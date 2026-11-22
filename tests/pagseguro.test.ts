import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { LOJA_ATUAL } from "@/lib/empresa/loja";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;
process.env.CHAVE_SEGREDOS ??= "chave-de-teste-do-pagseguro-123";

const { prisma } = await import("@/lib/db");
const ps = await import("@/lib/pagseguro/pagseguro");
const vendas = await import("@/lib/vendas/vendas");
const { garantirPadroes } = await import("@/lib/financeiro/padroes");
const { diaSP, somarDias } = await import("@/lib/datas");

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

type Chamada = { url: string; metodo: string; corpo: unknown; auth: string | null };
function falso(responder: (url: URL, corpo: unknown) => { status?: number; json: unknown }) {
  const chamadas: Chamada[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    const corpo = init.body ? JSON.parse(String(init.body)) : undefined;
    chamadas.push({ url, metodo: init.method ?? "GET", corpo, auth: new Headers(init.headers).get("authorization") });
    const r = responder(new globalThis.URL(url), corpo);
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { f, chamadas };
}

let prod = "";
const hoje = diaSP(new Date());
const iso = (d: Date) => d.toISOString().slice(0, 10);
const ligar = (m: Partial<Parameters<typeof ps.salvarConfigPagSeguro>[0]> = {}) => ps.salvarConfigPagSeguro({
  ativo: true, ambiente: "SANDBOX", token: "token-api", pix: true, pixMinutos: 10, edi: true, ediUsuario: "123456", ediToken: "token-edi", conciliarDesde: iso(somarDias(hoje, -10)), ...m,
});
const forma = async (nome: string) => (await prisma.formaPagamento.findUniqueOrThrow({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: nome } } })).id;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "TransacaoPagSeguro","CobrancaPix","Lancamento","VendaPagamento","VendaItem","Venda","Reserva","MovimentoEstoque","Saldo","Produto","Local","Deposito","FormaPagamento","ContaBancaria","Sequencia" CASCADE`);
  await prisma.$executeRawUnsafe(`DELETE FROM "Configuracao" WHERE chave = 'pagseguro'`);
  await prisma.$transaction((tx) => garantirPadroes(tx));
  const dep = await prisma.deposito.create({ data: { nome: "Loja" } });
  const loc = (await prisma.local.create({ data: { depositoId: dep.id, codigo: "A-01" } })).id;
  prod = (await prisma.produto.create({ data: { codigo: "SW", nome: "Switch", precoVenda: 100, custo: 50, localPadraoId: loc } })).id;
});

describe("PagSeguro", () => {
  it("ligar cria a conta PagSeguro e as formas; tokens cifrados", async () => {
    await expect(ligar({ token: "" })).rejects.toThrow(/token do PagSeguro/);
    await expect(ligar({ ediUsuario: "" })).rejects.toThrow(/EDI/);
    await ligar();
    const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: "PagSeguro" } } });
    const formas = await prisma.formaPagamento.findMany({ where: { pagseguro: true }, orderBy: { nome: "asc" } });
    expect(formas.map((f) => [f.nome, f.tPag, f.diasPrazo, f.contaBancariaId])).toEqual([
      ["Cartão de crédito (PagSeguro)", "03", 30, conta.id], ["Cartão de débito (PagSeguro)", "04", 1, conta.id], ["PIX (PagSeguro)", "17", 0, conta.id],
    ]);
    const salvo = JSON.stringify((await prisma.configuracao.findUnique({ where: { chave: "pagseguro" } }))?.valor);
    expect(salvo).not.toContain("token-api");
    expect(salvo).not.toContain("token-edi");
    expect(await ps.configPagSeguroTela()).toMatchObject({ temToken: true, temEdiToken: true, pixMinutos: 10 });
  });

  it("PIX no PDV: cria o pedido com QR, fica pago no PagSeguro e a venda cai na conta PagSeguro", async () => {
    await ligar();
    const { f, chamadas } = falso((u) => {
      if (u.pathname === "/orders") return { json: { id: "ORDE_1", qr_codes: [{ id: "QRCO_1", text: "00020101PIXCOPIAECOLA" }] } };
      return { json: { id: "ORDE_1", charges: chamadas.length > 2 ? [{ id: "CHAR_1", status: "PAID", paid_at: new Date().toISOString(), amount: { value: 18990 } }] : [] } };
    });
    const pix = await ps.criarPix({ valor: 189.9 }, { fetch: f });
    expect(chamadas[0].url).toBe("https://sandbox.api.pagseguro.com/orders");
    expect(chamadas[0].auth).toBe("Bearer token-api");
    expect(chamadas[0].corpo).toMatchObject({ qr_codes: [{ amount: { value: 18990 } }], items: [{ unit_amount: 18990, quantity: 1 }] });
    expect(pix.texto).toBe("00020101PIXCOPIAECOLA");
    expect(pix.imagem).toMatch(/^data:image\/png;base64,/);
    await expect(ps.conferirPixDaVenda(pix.id, 189.9)).rejects.toThrow(/ainda não foi pago/);
    expect((await ps.consultarPix(pix.id, { fetch: f })).situacao).toBe("PENDENTE");
    expect((await ps.consultarPix(pix.id, { fetch: f })).situacao).toBe("PAGA");
    await expect(ps.conferirPixDaVenda(pix.id, 150)).rejects.toThrow(/não confere/);
    await ps.conferirPixDaVenda(pix.id, 189.9);

    const v = await vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 1, valorUnit: 189.9 }], pagamentos: [{ formaPagamentoId: await forma("PIX (PagSeguro)"), valor: 189.9 }] });
    const l = await prisma.lancamento.findFirstOrThrow({ where: { origemTipo: "VENDA", origemId: v.id }, include: { contaBancaria: true } });
    expect(l.contaBancaria?.nome).toBe("PagSeguro");
    expect(l.pagoEm).toBeTruthy();
    // o PIX comum continua caindo no Caixa
    const v2 = await vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 1, valorUnit: 10 }], pagamentos: [{ formaPagamentoId: await forma("PIX"), valor: 10 }] });
    expect((await prisma.lancamento.findFirstOrThrow({ where: { origemId: v2.id }, include: { contaBancaria: true } })).contaBancaria?.nome).toBe("Caixa");
  });

  it("EDI: liga o crédito parcelado à conta, muda o vencimento para o repasse, baixa quando cai e lança a taxa", async () => {
    await ligar();
    const v = await vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 2, valorUnit: 150 }], pagamentos: [{ formaPagamentoId: await forma("Cartão de crédito (PagSeguro)"), valor: 300, parcelas: 2 }] });
    const pix = await vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 1, valorUnit: 50 }], pagamentos: [{ formaPagamentoId: await forma("PIX (PagSeguro)"), valor: 50 }] });
    const d = iso(hoje), p1 = iso(somarDias(hoje, 1)), p2 = iso(somarDias(hoje, 31));
    const transacional = [
      { codigo_transacao: "TX1", parcela: "1", quantidade_parcela: "2", data_venda_ajuste: d, hora_inicial_transacao: "10:00:00", meio_pagamento: "1", valor_parcela: "150.00", valor_liquido_transacao: "145.50", data_prevista_pagamento: p1, nsu: "999", instituicao_financeira: "VISA", cartao_holder: "****1234" },
      { codigo_transacao: "TX1", parcela: "2", quantidade_parcela: "2", data_venda_ajuste: d, meio_pagamento: "1", valor_parcela: "150.00", valor_liquido_transacao: "145.50", data_prevista_pagamento: p2 },
      { codigo_transacao: "TX2", parcela: "1", quantidade_parcela: "1", data_venda_ajuste: d, meio_pagamento: "11", valor_parcela: "50.00", valor_liquido_transacao: "49.50", data_prevista_pagamento: d },
      { codigo_transacao: "TX3", parcela: "1", quantidade_parcela: "1", data_venda_ajuste: d, meio_pagamento: "8", valor_parcela: "77.00", valor_liquido_transacao: "76.00", data_prevista_pagamento: p1 },
    ];
    let repasses: unknown[] = [];
    const { f, chamadas } = falso((u) => {
      const tipo = u.searchParams.get("tipoMovimento");
      if (u.searchParams.get("dataMovimento") !== d && u.searchParams.get("dataMovimento") !== p1) return { json: { detalhes: [] } };
      if (tipo === "1") return { json: { detalhes: u.searchParams.get("dataMovimento") === d ? transacional : [], pagination: { totalPages: 1 } } };
      return { json: { detalhes: u.searchParams.get("dataMovimento") === p1 ? repasses : [] } };
    });
    const r1 = await ps.sincronizarPagSeguro({ fetch: f, hoje });
    expect(chamadas[0].auth).toBe(`Basic ${Buffer.from("123456:token-edi").toString("base64")}`);
    expect(r1).toMatchObject({ ligadas: 3, recebidas: 0, taxas: 1 }); // a taxa do PIX entra já: ele caiu na hora
    const parcelas = await prisma.lancamento.findMany({ where: { origemId: v.id }, orderBy: { parcela: "asc" } });
    expect(parcelas.map((p) => iso(p.vencimento))).toEqual([p1, p2]);
    expect(parcelas.every((p) => !p.pagoEm)).toBe(true);
    const tx3 = await prisma.transacaoPagSeguro.findFirstOrThrow({ where: { codigo: "TX3" } });
    expect(tx3.situacao).toBe("SEM_CONTA");
    const taxaPix = await prisma.lancamento.findFirstOrThrow({ where: { tipo: "PAGAR", descricao: { contains: `Venda ${pix.numero}` } }, include: { categoria: true, contaBancaria: true } });
    expect(Number(taxaPix.valor)).toBe(0.5);
    expect(taxaPix.categoria.nome).toBe("Tarifas bancárias e taxas de cartão");
    expect(taxaPix.contaBancaria?.nome).toBe("PagSeguro");

    // no dia seguinte, o repasse da 1ª parcela
    repasses = [{ codigo_transacao: "TX1", parcela: "1", data_movimentacao: p1, valor_liquido_transacao: "145.50" }];
    const amanha = somarDias(hoje, 1);
    const r2 = await ps.sincronizarPagSeguro({ fetch: f, hoje: amanha });
    expect(r2).toMatchObject({ recebidas: 1, taxas: 1, ligadas: 0 });
    const [a, b] = await prisma.lancamento.findMany({ where: { origemId: v.id }, orderBy: { parcela: "asc" }, include: { contaBancaria: true } });
    expect(iso(a.pagoEm!)).toBe(p1);
    expect(a.contaBancaria?.nome).toBe("PagSeguro");
    expect(Number(a.valorPago)).toBe(150);
    expect(b.pagoEm).toBeNull();
    const taxas = await prisma.lancamento.findMany({ where: { tipo: "PAGAR", descricao: { startsWith: "Taxa PagSeguro" } } });
    expect(taxas.map((t) => Number(t.valor)).sort()).toEqual([0.5, 4.5]);
    // repetir não duplica nada
    expect(await ps.sincronizarPagSeguro({ fetch: f, hoje: amanha })).toMatchObject({ ligadas: 0, recebidas: 0, taxas: 0 });
    expect(await prisma.transacaoPagSeguro.count()).toBe(4);
  });

  it("desligado: o agendador não chama o EDI", async () => {
    const { f, chamadas } = falso(() => ({ json: {} }));
    expect(await ps.sincronizarPagSeguro({ fetch: f })).toMatchObject({ ignorado: expect.stringMatching(/desligada/) });
    expect(chamadas).toHaveLength(0);
  });
});
