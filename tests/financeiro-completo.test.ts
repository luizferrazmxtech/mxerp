import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const fin = await import("@/lib/financeiro/lancamentos");
const { garantirPadroes, categoria } = await import("@/lib/financeiro/padroes");
const plano = await import("@/lib/financeiro/plano");
const transf = await import("@/lib/financeiro/transferencias");
const { fluxoCaixa, fluxoMensal } = await import("@/lib/financeiro/fluxo");
const { calcularDre } = await import("@/lib/financeiro/dre");

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const ANO = 2026;
let caixa: string, inter: string;

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Lancamento","CentroCusto","CategoriaFinanceira","ContaBancaria","FormaPagamento","TransacaoBancaria" CASCADE`);
  await prisma.$transaction((tx) => garantirPadroes(tx));
  caixa = (await prisma.contaBancaria.findUniqueOrThrow({ where: { nome: "Caixa" } })).id;
  inter = (await prisma.contaBancaria.create({ data: { nome: "Inter PJ", saldoInicial: 1000 } })).id;
});

const lancar = (tipo: "PAGAR" | "RECEBER", nomeCat: string, valor: number, venc: string, extra: Record<string, unknown> = {}) =>
  prisma.$transaction(async (tx) => {
    const c = await categoria(tx, nomeCat, tipo);
    return (await fin.criarLancamentos(tx, { tipo, descricao: nomeCat, categoriaId: c.id, valorTotal: valor, primeiroVencimento: d(venc), ...extra }))[0];
  });
const baixar = (id: string, data: string, conta: string) => prisma.$transaction((tx) => fin.baixarLancamento(tx, id, { data: d(data), contaBancariaId: conta }));

describe("plano de contas", () => {
  it("padrões vêm com classificação e a árvore ordena 1.2 antes de 1.10", async () => {
    const alug = await prisma.categoriaFinanceira.findFirstOrThrow({ where: { nome: "Aluguel" } });
    expect(alug.codigo).toBe("2.06");
    const pai = await prisma.$transaction((tx) => plano.salvarCategoria(tx, { nome: "Despesas administrativas", codigo: "4", tipo: "PAGAR", grupoDre: "DESPESA_OPERACIONAL" }));
    await prisma.$transaction((tx) => plano.salvarCategoria(tx, { nome: "Contabilidade", codigo: "4.10", tipo: "PAGAR", grupoDre: "DESPESA_OPERACIONAL", paiId: pai.id }));
    await prisma.$transaction((tx) => plano.salvarCategoria(tx, { nome: "Cartório", codigo: "4.2", tipo: "PAGAR", grupoDre: "DESPESA_OPERACIONAL", paiId: pai.id }));
    const arv = await prisma.$transaction((tx) => plano.planoDeContas(tx, { tipo: "PAGAR" }));
    const i = arv.findIndex((c) => c.id === pai.id);
    expect(arv.slice(i, i + 3).map((c) => [c.nome, c.nivel])).toEqual([["Despesas administrativas", 0], ["Cartório", 1], ["Contabilidade", 1]]);
  });

  it("recusa ciclo, mãe de outro tipo, nome repetido e exclusão com lançamentos", async () => {
    const a = await prisma.$transaction((tx) => plano.salvarCategoria(tx, { nome: "A", tipo: "PAGAR", grupoDre: "OUTRAS_DESPESAS" }));
    const b = await prisma.$transaction((tx) => plano.salvarCategoria(tx, { nome: "B", tipo: "PAGAR", grupoDre: "OUTRAS_DESPESAS", paiId: a.id }));
    await expect(prisma.$transaction((tx) => plano.salvarCategoria(tx, { id: a.id, nome: "A", tipo: "PAGAR", grupoDre: "OUTRAS_DESPESAS", paiId: b.id }))).rejects.toThrow(/dentro deste plano/);
    const rec = await prisma.categoriaFinanceira.findFirstOrThrow({ where: { tipo: "RECEBER" } });
    await expect(prisma.$transaction((tx) => plano.salvarCategoria(tx, { nome: "C", tipo: "PAGAR", grupoDre: "OUTRAS_DESPESAS", paiId: rec.id }))).rejects.toThrow(/mesmo tipo/);
    await expect(prisma.$transaction((tx) => plano.salvarCategoria(tx, { nome: "aluguel", tipo: "PAGAR", grupoDre: "OUTRAS_DESPESAS" }))).rejects.toThrow(/Já existe/);
    await expect(prisma.$transaction((tx) => plano.excluirCategoria(tx, a.id))).rejects.toThrow(/filhas/);
    await lancar("PAGAR", "B", 10, "2026-03-01");
    await expect(prisma.$transaction((tx) => plano.excluirCategoria(tx, b.id))).rejects.toThrow(/desative/);
  });
});

describe("centros de custo", () => {
  it("lançamento com centro filtra a DRE; centro com uso não é excluído", async () => {
    const loja = await prisma.$transaction((tx) => plano.salvarCentroCusto(tx, { nome: "Loja" }));
    await prisma.$transaction((tx) => plano.salvarCentroCusto(tx, { nome: "Campo" }));
    await expect(prisma.$transaction((tx) => plano.salvarCentroCusto(tx, { nome: "loja" }))).rejects.toThrow(/Já existe/);
    await lancar("PAGAR", "Aluguel", 1000, "2026-03-10", { centroCustoId: loja.id });
    await lancar("PAGAR", "Aluguel", 400, "2026-03-10");
    const total = await calcularDre(ANO, "COMPETENCIA");
    const daLoja = await calcularDre(ANO, "COMPETENCIA", loja.id);
    const desp = (x: typeof total) => x.linhas.find((l) => l.chave === "DESPESA_OPERACIONAL")!.meses[2];
    expect(desp(total)).toBe(1400);
    expect(desp(daLoja)).toBe(1000);
    expect(daLoja.centro).toBe("Loja");
    await expect(prisma.$transaction((tx) => plano.excluirCentroCusto(tx, loja.id))).rejects.toThrow(/desative/);
    // nome de centro digitado num documento vira o mesmo centro (sem diferenciar maiúsculas)
    expect(await prisma.$transaction((tx) => plano.centroPorNome(tx, " LOJA "))).toBe(loja.id);
  });
});

describe("transferências entre contas", () => {
  it("move o saldo, não entra na DRE e só é excluída inteira", async () => {
    const t = await prisma.$transaction((tx) => transf.transferirEntreContas(tx, { origemId: inter, destinoId: caixa, valor: 250, data: d("2026-04-05") }));
    const saldos = await prisma.$transaction((tx) => fin.saldosContas(tx));
    expect(saldos.find((c) => c.id === inter)!.saldo).toBe(750);
    expect(saldos.find((c) => c.id === caixa)!.saldo).toBe(250);
    const dre = await calcularDre(ANO, "CAIXA");
    expect(dre.linhas.every((l) => l.total === 0)).toBe(true);
    await expect(prisma.$transaction((tx) => fin.estornarLancamento(tx, t.saida.id))).rejects.toThrow(/transferência/);
    const lista = await prisma.$transaction((tx) => transf.listarTransferencias(tx));
    expect(lista).toEqual([expect.objectContaining({ id: t.id, origem: "Inter PJ", destino: "Caixa", valor: 250 })]);
    await prisma.$transaction((tx) => transf.excluirTransferencia(tx, t.id));
    expect(await prisma.lancamento.count()).toBe(0);
  });

  it("recusa mesma conta e valor zero", async () => {
    await expect(prisma.$transaction((tx) => transf.transferirEntreContas(tx, { origemId: caixa, destinoId: caixa, valor: 10, data: d("2026-04-05") }))).rejects.toThrow(/diferente/);
    await expect(prisma.$transaction((tx) => transf.transferirEntreContas(tx, { origemId: caixa, destinoId: inter, valor: 0, data: d("2026-04-05") }))).rejects.toThrow(/maior que zero/);
  });
});

describe("fluxo de caixa", () => {
  it("saldo anterior, realizado, previsto, atrasado e dia a dia", async () => {
    const antigo = await lancar("RECEBER", "Venda de produtos", 300, "2026-04-20");
    await baixar(antigo.id, "2026-04-28", inter); // antes do período: entra no saldo anterior
    const r = await lancar("RECEBER", "Prestação de serviços", 500, "2026-05-03");
    await baixar(r.id, "2026-05-04", inter);
    const p = await lancar("PAGAR", "Aluguel", 200, "2026-05-10");
    await baixar(p.id, "2026-05-10", caixa);
    await lancar("RECEBER", "Venda de produtos", 120, "2026-05-25"); // previsto
    await lancar("PAGAR", "Energia, água, internet, telefone", 80, "2026-05-28"); // previsto
    await lancar("PAGAR", "Outras despesas", 50, "2026-04-02"); // atrasado (antes do período, em aberto)
    await prisma.$transaction((tx) => transf.transferirEntreContas(tx, { origemId: inter, destinoId: caixa, valor: 100, data: d("2026-05-15") }));

    const f = await fluxoCaixa({ de: d("2026-05-01"), ate: d("2026-05-31"), hoje: d("2026-05-20") });
    expect(f.saldoAnterior).toBe(1300); // 1000 inicial do Inter + 300 recebidos em abril
    expect([f.recebido, f.pago, f.aReceber, f.aPagar]).toEqual([500, 200, 120, 80]);
    expect(f.saldo).toBe(1600);
    expect(f.saldoPrevisto).toBe(1640);
    expect(f.atrasadoPagar).toBe(50);
    expect(f.linhas.some((l) => l.transferencia)).toBe(false); // todas as contas: transferência não aparece
    expect(f.dias).toHaveLength(31);
    expect(f.dias[3].saldo).toBe(1800); // dia 4
    expect(f.dias[30].previsto).toBe(1640);

    // só o Inter: transferência sai como pagamento
    const fi = await fluxoCaixa({ de: d("2026-05-01"), ate: d("2026-05-31"), hoje: d("2026-05-20"), contaId: inter });
    expect([fi.saldoAnterior, fi.recebido, fi.pago, fi.saldo]).toEqual([1300, 500, 100, 1700]);

    const m = await fluxoMensal(d("2026-05-31"), 3);
    expect(m.porMes.map((x) => [x.mes, x.receber, x.pagar])).toEqual([["2026-03", 0, 0], ["2026-04", 300, 0], ["2026-05", 500, 200]]);
    expect(m.porConta.find((c) => c.conta === "Inter PJ")).toMatchObject({ receber: 300 + 500, pagar: 100 });
  });
});
