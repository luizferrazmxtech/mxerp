import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;
process.env.CHAVE_SEGREDOS ??= "chave-de-teste-do-pix-inter-123";

const { prisma } = await import("@/lib/db");
const { garantirPadroes } = await import("@/lib/financeiro/padroes");
const { ClienteInter, ESCOPOS_PADRAO, ESCOPOS_PIX } = await import("@/lib/financeiro/inter");
const { cifrar } = await import("@/lib/seguranca/segredos");
const px = await import("@/lib/financeiro/pixInter");
const ext = await import("@/lib/financeiro/extrato");
const { conferirPixDaVenda } = await import("@/lib/pagseguro/pagseguro");

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

/** API Pix v2 do Inter de mentira. */
function interFalso() {
  const cobs = new Map<string, { status: string; valor: string; pix?: { endToEndId: string; valor: string; horario: string }[] }>();
  const chamadas: { metodo: string; caminho: string; corpo: unknown }[] = [];
  const escopos: string[] = [];
  const fake = async (metodo: string, url: string, _h: Record<string, string>, corpo: string | null) => {
    const u = new globalThis.URL(url);
    if (u.pathname === "/oauth/v2/token") {
      escopos.push(new URLSearchParams(corpo!).get("scope")!);
      return { status: 200, corpo: JSON.stringify({ access_token: "tok", expires_in: 3600 }) };
    }
    chamadas.push({ metodo, caminho: u.pathname, corpo: corpo ? JSON.parse(corpo) : null });
    const txid = u.pathname.replace("/pix/v2/cob/", "");
    if (metodo === "PUT") {
      const c = JSON.parse(corpo!);
      cobs.set(txid, { status: "ATIVA", valor: c.valor.original });
      return { status: 201, corpo: JSON.stringify({ txid, status: "ATIVA", pixCopiaECola: `00020101PIX-${txid}` }) };
    }
    const c = cobs.get(txid);
    if (!c) return { status: 404, corpo: "{}" };
    if (metodo === "GET") return { status: 200, corpo: JSON.stringify({ txid, ...c }) };
    if (metodo === "PATCH") { c.status = "REMOVIDA_PELO_USUARIO_RECEBEDOR"; return { status: 200, corpo: "{}" }; }
    return { status: 400, corpo: "{}" };
  };
  const pagar = (valor: string, horario = "2026-11-25T14:03:10.000Z") => {
    const [txid, c] = [...cobs.entries()].at(-1)!;
    Object.assign(c, { status: "CONCLUIDA", pix: [{ endToEndId: `E0000${txid.slice(-6)}`, valor, horario }] });
    return `E0000${txid.slice(-6)}`;
  };
  const cliente = () => new ClienteInter({ clientId: "id", clientSecret: "s", cert: "", key: "", conta: null, base: "https://inter.teste", contaErp: "INTER MXTECH", escopos: `${ESCOPOS_PADRAO} ${ESCOPOS_PIX}`, id: "inter" }, fake);
  return { chamadas, escopos, pagar, cliente };
}

let contaInter: string, pix: string, cat: string;
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "CobrancaPix","Lancamento","TransacaoBancaria","FormaPagamento","CategoriaFinanceira","ContaBancaria","IntegracaoInter" CASCADE`);
  await prisma.$transaction((tx) => garantirPadroes(tx));
  contaInter = (await prisma.contaBancaria.create({ data: { nome: "INTER MXTECH", banco: "077" } })).id;
  pix = (await prisma.formaPagamento.findFirstOrThrow({ where: { nome: "PIX" } })).id;
  cat = (await prisma.categoriaFinanceira.findFirstOrThrow({ where: { nome: "Venda de produtos" } })).id;
  await prisma.integracaoInter.create({ data: {
    id: "inter", clientId: "id", clientSecretCifrado: cifrar("s"), certificado: "", chaveCifrada: cifrar("k"), contaBancariaId: contaInter,
    escopos: `extrato.read ${ESCOPOS_PIX}`, pixPdv: true, chavePix: "12345678000195",
  } });
});

describe("Pix do Inter no PDV", () => {
  it("só fica ativo com a chave, a opção e a permissão cob.write", async () => {
    expect(await px.pixInterAtivo("inter")).toEqual({ interId: "inter", chave: "12345678000195" });
    await prisma.integracaoInter.update({ where: { id: "inter" }, data: { escopos: "extrato.read" } });
    expect(await px.pixInterAtivo("inter")).toBeNull();
    await prisma.integracaoInter.update({ where: { id: "inter" }, data: { escopos: `extrato.read ${ESCOPOS_PIX}`, chavePix: "" } });
    expect(await px.pixInterAtivo("inter")).toBeNull();
  });

  it("gera a cobrança, espera o pagamento, fecha a venda recebida no Inter e amarra o extrato pelo endToEndId", async () => {
    const f = interFalso();
    const c = f.cliente();
    const r = await px.criarPixInter({ valor: 40, interId: "inter" }, { cliente: c });
    expect(r.texto).toMatch(/^00020101PIX-MXPDV/);
    expect(r.imagem).toMatch(/^data:image\/png/);
    const put = f.chamadas[0];
    expect(put.metodo).toBe("PUT");
    expect(put.corpo).toMatchObject({ valor: { original: "40.00" }, chave: "12345678000195", calendario: { expiracao: 900 } });
    expect(f.escopos[0]).toBe(ESCOPOS_PIX);

    expect((await px.consultarPixInter(r.id, { cliente: c })).situacao).toBe("PENDENTE");
    await expect(conferirPixDaVenda(r.id, 40, "INTER")).rejects.toThrow("ainda não foi pago");
    const e2e = f.pagar("40.00");
    const paga = await px.consultarPixInter(r.id, { cliente: c });
    expect([paga.situacao, paga.e2eId]).toEqual(["PAGA", e2e]);
    await expect(conferirPixDaVenda(r.id, 40, "PAGSEGURO")).rejects.toThrow();
    await conferirPixDaVenda(r.id, 40, "INTER");

    // a venda do PDV lança a conta já recebida no Caixa (forma à vista): passa para a conta do Inter no dia do Pix
    const caixa = await prisma.contaBancaria.findFirstOrThrow({ where: { nome: "Caixa" } });
    const hoje = new Date("2026-11-25T00:00:00Z");
    const l = await prisma.lancamento.create({ data: { tipo: "RECEBER", descricao: "Venda 10", valor: 40, vencimento: hoje, competencia: hoje, categoriaId: cat, formaPagamentoId: pix, contaBancariaId: caixa.id, pagoEm: hoje, valorPago: 40, origemTipo: "VENDA", origemId: "v10" } });
    expect(await px.receberVendaPeloPix(r.id, "v10", [pix])).toBe(1);
    const recebida = await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } });
    expect([recebida.contaBancariaId, recebida.pagoEm?.toISOString().slice(0, 10)]).toEqual([contaInter, "2026-11-25"]);
    expect((await prisma.cobrancaPix.findUniqueOrThrow({ where: { id: r.id } })).vendaId).toBe("v10");
    await expect(conferirPixDaVenda(r.id, 40, "INTER")).rejects.toThrow("já foi usado");

    // extrato do Inter: a linha do Pix vem com o endToEndId
    await ext.importarExtrato(contaInter, [{ data: hoje, valor: 40, descricao: "Pix recebido - Fulano de Tal", documento: e2e, chave: "inter:1" }], { baixarAutomatico: false });
    const t = await prisma.transacaoBancaria.findFirstOrThrow({ where: { chave: "inter:1" } });
    expect(t.situacao).toBe("CONCILIADA");
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } })).transacaoId).toBe(t.id);
  });

  it("pago com valor diferente não fecha; cancelar remove a cobrança no Inter", async () => {
    const f = interFalso();
    const c = f.cliente();
    const r = await px.criarPixInter({ valor: 40, interId: "inter" }, { cliente: c });
    f.pagar("39.00");
    await expect(px.consultarPixInter(r.id, { cliente: c })).rejects.toThrow("valor diferente");
    const r2 = await px.criarPixInter({ valor: 25, interId: "inter" }, { cliente: c });
    expect((await px.cancelarPixInter(r2.id, { cliente: c })).situacao).toBe("CANCELADA");
    expect(f.chamadas.some((x) => x.metodo === "PATCH" && (x.corpo as { status: string }).status === "REMOVIDA_PELO_USUARIO_RECEBEDOR")).toBe(true);
  });

  it("conciliação: Pix casa pelo horário da venda (não só da conta), e a análise guardada é refeita quando algo muda", async () => {
    const conc = await import("@/lib/financeiro/conciliacao");
    await prisma.$executeRawUnsafe(`TRUNCATE "Venda" CASCADE`);
    const v = await prisma.venda.create({ data: { numero: 9228, tipo: "BALCAO", situacao: "CONCLUIDA", data: new Date("2026-11-23T21:38:00Z"), createdAt: new Date("2026-11-23T21:38:00Z") } });
    const dia = new Date("2026-11-23T00:00:00Z");
    // conta refeita depois (venda editada às 20:30): a hora da conta não bate, a da venda sim
    await prisma.lancamento.create({ data: { tipo: "RECEBER", descricao: "Venda de nº 9228", valor: 40, vencimento: dia, competencia: dia, categoriaId: cat, formaPagamentoId: pix, origemTipo: "VENDA", origemId: v.id, createdAt: new Date("2026-11-23T23:30:00Z") } });
    await prisma.transacaoBancaria.create({ data: { contaBancariaId: contaInter, data: dia, dataHora: new Date("2026-11-23T21:42:00Z"), valor: 40, descricao: "Pix recebido - Matheus Guerrero Geremias", chave: "t9228" } });
    conc.limparAnaliseConciliacao();
    const [l] = await conc.analisarExtrato();
    expect(l.confianca).toBeGreaterThanOrEqual(80);
    expect(l.motivos.join(" ")).toContain("venda às 18:38 (Pix às 18:42)");
    // guardada: mesma resposta sem refazer
    expect(await conc.analisarExtrato()).toBe(await conc.analisarExtrato());
    // nova linha do extrato: refaz
    await prisma.transacaoBancaria.create({ data: { contaBancariaId: contaInter, data: dia, valor: -10, descricao: "Tarifa", chave: "t2" } });
    expect((await conc.analisarExtrato()).length).toBe(2);
  });

  it("QR vencido sem pagamento fica EXPIRADO", async () => {
    const f = interFalso();
    const c = f.cliente();
    const r = await px.criarPixInter({ valor: 10, interId: "inter" }, { cliente: c });
    expect((await px.consultarPixInter(r.id, { cliente: c, agora: new Date(Date.now() + 16 * 60000) })).situacao).toBe("EXPIRADA");
  });
});
