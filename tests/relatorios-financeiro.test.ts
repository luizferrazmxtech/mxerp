import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const fin = await import("@/lib/relatorios/financeiro");
const { garantirPadroes } = await import("@/lib/financeiro/padroes");

const hoje = new Date("2026-11-21T00:00:00Z");
const d = (s: string) => new Date(`${s}T00:00:00Z`);
let cli: string, cli2: string, receita: string, pai: string, filha: string, outra: string;

beforeAll(() => execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" }));

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Lancamento","Pessoa","CategoriaFinanceira","FormaPagamento","ContaBancaria" CASCADE`);
  await prisma.$transaction((tx) => garantirPadroes(tx));
  cli = (await prisma.pessoa.create({ data: { nome: "Condomínio Azul" } })).id;
  cli2 = (await prisma.pessoa.create({ data: { nome: "Padaria" } })).id;
  receita = (await prisma.categoriaFinanceira.create({ data: { nome: "Receita teste", tipo: "RECEBER", grupoDre: "RECEITA_BRUTA" } })).id;
  pai = (await prisma.categoriaFinanceira.create({ data: { nome: "Ocupação", tipo: "PAGAR", grupoDre: "DESPESA_OPERACIONAL" } })).id;
  filha = (await prisma.categoriaFinanceira.create({ data: { nome: "Aluguel teste", tipo: "PAGAR", grupoDre: "DESPESA_OPERACIONAL", paiId: pai } })).id;
  outra = (await prisma.categoriaFinanceira.create({ data: { nome: "Marketing teste", tipo: "PAGAR", grupoDre: "DESPESA_OPERACIONAL" } })).id;
});

const lanc = (tipo: "RECEBER" | "PAGAR", categoriaId: string, valor: number, vencimento: string, extra: Record<string, unknown> = {}) =>
  prisma.lancamento.create({ data: { tipo, descricao: "x", categoriaId, valor, vencimento: d(vencimento), competencia: d(vencimento), ...extra } });

describe("painel financeiro", () => {
  it("inadimplência por faixa de atraso e maiores devedores", async () => {
    await lanc("RECEBER", receita, 100, "2026-11-11", { pessoaId: cli }); // 10 dias
    await lanc("RECEBER", receita, 200, "2026-10-01", { pessoaId: cli }); // 51 dias
    await lanc("RECEBER", receita, 50, "2026-06-01", { pessoaId: cli2 }); // > 90
    await lanc("RECEBER", receita, 999, "2026-11-10", { pessoaId: cli2, pagoEm: d("2026-11-10"), valorPago: 999 }); // pago
    await lanc("RECEBER", receita, 70, "2026-11-25", { pessoaId: cli2 }); // a vencer
    const r = await fin.inadimplencia(hoje);
    expect(r.total).toBe(350);
    expect(r.faixas.map((f) => [f.chave, f.valor])).toEqual([["1-30", 100], ["31-60", 200], ["61-90", 0], ["90+", 50]]);
    expect(r.faixas[0].vencDe).toEqual(d("2026-10-22"));
    expect(r.faixas[0].vencAte).toEqual(d("2026-11-20"));
    expect(r.devedores.map((x) => [x.nome, x.valor, x.contas])).toEqual([["Condomínio Azul", 300, 2], ["Padaria", 50, 1]]);
  });

  it("despesas somadas na categoria mãe, pelo vencimento do período", async () => {
    await lanc("PAGAR", filha, 1000, "2026-11-05");
    await lanc("PAGAR", pai, 100, "2026-11-06");
    await lanc("PAGAR", outra, 300, "2026-11-30");
    await lanc("PAGAR", outra, 5000, "2026-12-01"); // fora
    const r = await fin.despesasPorCategoria({ de: d("2026-11-01"), ate: d("2026-11-30") });
    expect(r.total).toBe(1400);
    expect(r.linhas.map((l) => [l.nome, l.valor, l.contas])).toEqual([["Ocupação", 1100, 2], ["Marketing teste", 300, 1]]);
  });

  it("saldo projetado: saldo de hoje mais as contas em aberto pelo vencimento", async () => {
    await prisma.contaBancaria.create({ data: { nome: "Banco", saldoInicial: 1000 } });
    await lanc("RECEBER", receita, 500, "2026-11-25");
    await lanc("PAGAR", outra, 2000, "2026-12-10");
    await lanc("PAGAR", outra, 80, "2026-11-01"); // vencida: não entra na projeção
    const r = await fin.saldoProjetado(90, hoje);
    expect(r.hoje).toBe(1000);
    expect(r.pontos).toHaveLength(90);
    expect(r.pontos.find((p) => p.dia.getTime() === d("2026-11-25").getTime())!.saldo).toBe(1500);
    expect(r.primeiroNegativo!.dia).toEqual(d("2026-12-10"));
    expect(r.final).toBe(-500);
    expect(r.atrasadoPagar).toBe(80);
  });
});
