import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { prisma } from "@/lib/db";
import { processar } from "@/lib/faturas";
import { ClienteInter, receberWebhook, type TransporteInter } from "@/lib/inter";
import { usarTransporteDeTeste, type Mensagem } from "@/lib/email";
import { licencaDoCliente } from "@/lib/licenca";
import { salvar } from "@/lib/config";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

/** Inter falso: guarda os boletos registrados e deixa marcar como pagos. */
function interFalso() {
  const boletos = new Map<string, { seuNumero: string; situacao: string; valor: number; pago?: string }>();
  let n = 0;
  const t: TransporteInter = async (metodo, url, _h, corpo) => {
    const u = new URL(url);
    if (u.pathname === "/oauth/v2/token") return { status: 200, corpo: JSON.stringify({ access_token: "tok", expires_in: 3600 }) };
    if (metodo === "POST" && u.pathname === "/cobranca/v3/cobrancas") {
      const j = JSON.parse(corpo!);
      const cs = `cs-${++n}`;
      boletos.set(cs, { seuNumero: j.seuNumero, situacao: "A_RECEBER", valor: j.valorNominal });
      return { status: 200, corpo: JSON.stringify({ codigoSolicitacao: cs }) };
    }
    const m = u.pathname.match(/^\/cobranca\/v3\/cobrancas\/(cs-\d+)(\/pdf)?$/);
    if (metodo === "GET" && m) {
      const b = boletos.get(m[1])!;
      if (m[2]) return { status: 200, corpo: JSON.stringify({ pdf: Buffer.from("%PDF").toString("base64") }) };
      return { status: 200, corpo: JSON.stringify({ cobranca: { codigoSolicitacao: m[1], situacao: b.situacao, dataSituacao: b.pago, valorTotalRecebido: b.valor }, boleto: { linhaDigitavel: `0779${m[1]}` }, pix: { pixCopiaECola: "pix" } }) };
    }
    if (metodo === "GET" && u.pathname === "/cobranca/v3/cobrancas") {
      return { status: 200, corpo: JSON.stringify({ cobrancas: [...boletos].map(([cs, b]) => ({ cobranca: { codigoSolicitacao: cs, situacao: b.situacao, dataSituacao: b.pago, valorTotalRecebido: b.valor } })), totalPaginas: 1 }) };
    }
    return { status: 404, corpo: "" };
  };
  const cliente = new ClienteInter({ clientId: "x", clientSecret: "y", cert: "", key: "", conta: "", base: "https://inter.teste" }, t);
  return { cliente, boletos, pagar: (cs: string, dia: string) => { const b = boletos.get(cs)!; b.situacao = "RECEBIDO"; b.pago = dia; } };
}

const emails: Mensagem[] = [];

beforeAll(() => {
  execSync("npx prisma migrate deploy", { stdio: "ignore", env: { ...process.env } });
  usarTransporteDeTeste(async (m) => { emails.push(m); });
});

beforeEach(async () => {
  emails.length = 0;
  await prisma.$executeRawUnsafe('TRUNCATE "Fatura", "Tarefa", "Cliente", "Plano", "Configuracao" CASCADE');
  await salvar("geral", { urlPublica: "https://central.teste", nomeEmpresa: "MXTECH", multaPct: 2, jurosMesPct: 1 });
});

async function cliente() {
  const p = await prisma.plano.create({ data: { nome: "Pro", valorMensal: 300, maxEmpresas: 5, maxUsuarios: 10 } });
  return prisma.cliente.create({ data: {
    slug: "jtecobio", nome: "JT Ecobio Ltda", documento: "11222333000181", email: "fin@jt.com.br", dominio: "jt.mxerp.com.br", planoId: p.id,
    logradouro: "Rua A", numero: "10", bairro: "Centro", cidade: "São Paulo", uf: "SP", cep: "01001000",
    diaVencimento: 10, inicioCobranca: d("2026-12-01"), situacao: "ATIVO", licencaToken: "token-de-licenca-do-cliente-0001",
  } });
}

describe("mensalidades", () => {
  it("gera a fatura antes do vencimento, emite o boleto, manda o e-mail com PDF e não repete", async () => {
    const c = await cliente();
    const inter = interFalso();
    const r = await processar({ cliente: inter.cliente, hoje: d("2026-12-01") });
    expect(r).toMatchObject({ criadas: 1, boletos: 1, emails: 1, erros: [] });
    const f = await prisma.fatura.findFirstOrThrow({ where: { clienteId: c.id } });
    expect(f).toMatchObject({ competencia: "2026-12", situacao: "ABERTA", linhaDigitavel: "0779cs-1" });
    expect(Number(f.valor)).toBe(300);
    expect(emails[0].para).toBe("fin@jt.com.br");
    expect(emails[0].anexos?.[0].nome).toBe("boleto-2026-12.pdf");
    const r2 = await processar({ cliente: inter.cliente, hoje: d("2026-12-02") });
    expect(r2).toMatchObject({ criadas: 0, boletos: 0, emails: 0 });
  });

  it("atraso muda a licença e o pagamento (webhook) libera", async () => {
    const c = await cliente();
    const inter = interFalso();
    await processar({ cliente: inter.cliente, hoje: d("2026-12-01") });
    const lic = await licencaDoCliente(c.id, d("2026-12-21"));
    expect(lic).toMatchObject({ situacao: "SO_LEITURA", diasAtraso: 11, maxEmpresas: 5, maxUsuarios: 10 });
    expect(lic.fatura?.link).toMatch(/^https:\/\/central\.teste\/boleto\//);
    const r = await processar({ cliente: inter.cliente, hoje: d("2026-12-21") });
    expect(r.lembretes).toBe(1);
    inter.pagar("cs-1", "2026-12-21");
    expect(await receberWebhook([{ codigoSolicitacao: "cs-1" }, { codigoSolicitacao: "de-outro-sistema" }], inter.cliente)).toBe(1);
    const f = await prisma.fatura.findFirstOrThrow({ where: { clienteId: c.id } });
    expect(f).toMatchObject({ situacao: "PAGA", formaPagamento: "BOLETO" });
    expect((await licencaDoCliente(c.id, d("2026-12-21"))).situacao).toBe("EM_DIA");
  });

  it("cadastro incompleto não emite e guarda o motivo", async () => {
    const c = await cliente();
    await prisma.cliente.update({ where: { id: c.id }, data: { cep: null } });
    const r = await processar({ cliente: interFalso().cliente, hoje: d("2026-12-01") });
    expect(r.erros[0]).toMatch(/CEP/);
    const f = await prisma.fatura.findFirstOrThrow({ where: { clienteId: c.id } });
    expect(f.boletoSituacao).toBe("ERRO");
    expect(emails).toHaveLength(0);
  });
});
