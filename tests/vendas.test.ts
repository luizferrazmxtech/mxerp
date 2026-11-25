import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { LOJA_ATUAL } from "@/lib/empresa/loja";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const est = await import("@/lib/estoque/estoque");
const vendas = await import("@/lib/vendas/vendas");
const { garantirPadroes } = await import("@/lib/financeiro/padroes");
const { dividirParcelas } = await import("@/lib/financeiro/lancamentos");

let prod: string, loc: string, dinheiro: string, credito: string;

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Lancamento","VendaPagamento","VendaItem","Venda","Reserva","MovimentoEstoque","Saldo","Produto","Local","Deposito","Pessoa","Sequencia","FormaPagamento","CategoriaFinanceira","ContaBancaria" CASCADE`);
  const dep = await prisma.deposito.create({ data: { nome: "Loja" } });
  loc = (await prisma.local.create({ data: { depositoId: dep.id, codigo: "A-01" } })).id;
  prod = (await prisma.produto.create({ data: { codigo: "CB", nome: "Cabo", precoVenda: 39.9, custo: 12, localPadraoId: loc } })).id;
  await prisma.$transaction(async (tx) => {
    await est.entrada(tx, { produtoId: prod, localId: loc, quantidade: 5, origemTipo: "IMPLANTACAO" });
    await garantirPadroes(tx);
  });
  dinheiro = (await prisma.formaPagamento.findUniqueOrThrow({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: "Dinheiro" } } })).id;
  credito = (await prisma.formaPagamento.findUniqueOrThrow({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: "Cartão de crédito" } } })).id;
});

const fisico = async () => (await prisma.$transaction((tx) => est.resumoProduto(tx, prod)));

describe("vendas", () => {
  it("PDV baixa estoque e lança recebimentos", async () => {
    const v = await vendas.vendaBalcao({
      itens: [{ produtoId: prod, quantidade: 2 }],
      pagamentos: [{ formaPagamentoId: dinheiro, valor: 19.8 }, { formaPagamentoId: credito, valor: 60, parcelas: 3 }],
    });
    expect(Number(v.total)).toBeCloseTo(79.8);
    expect((await fisico()).fisico).toBe(3);
    const lanc = await prisma.lancamento.findMany({ where: { origemId: v.id }, orderBy: [{ pagoEm: "asc" }, { parcela: "asc" }] });
    expect(lanc).toHaveLength(4);
    expect(lanc.filter((l) => l.pagoEm).map((l) => Number(l.valor))).toEqual([19.8]);
    expect(lanc.filter((l) => !l.pagoEm).map((l) => Number(l.valor))).toEqual([20, 20, 20]);
  });

  it("PDV recusa pagamento que não fecha", async () => {
    await expect(vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 1 }], pagamentos: [{ formaPagamentoId: dinheiro, valor: 10 }] }))
      .rejects.toThrow(/não fecham/);
    expect((await fisico()).fisico).toBe(5);
  });

  it("pedido aberto reserva; orçamento não reserva", async () => {
    const orc = await vendas.criarVenda({ situacao: "ORCAMENTO" });
    await vendas.adicionarItem(orc.id, { produtoId: prod, quantidade: 2 });
    expect((await fisico()).reservado).toBe(0);
    await vendas.alterarSituacaoVenda(orc.id, "ABERTA");
    expect((await fisico()).reservado).toBe(2);
    await vendas.concluirVenda(orc.id, [{ formaPagamentoId: dinheiro, valor: 79.8 }]);
    expect(await fisico()).toMatchObject({ fisico: 3, reservado: 0 });
  });

  it("cancelar venda concluída devolve estoque (com recebido, só forçando)", async () => {
    const v = await vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 1 }], pagamentos: [{ formaPagamentoId: dinheiro, valor: 39.9 }] });
    await expect(vendas.alterarSituacaoVenda(v.id, "CANCELADA")).rejects.toThrow(/recebidas/);
    await vendas.alterarSituacaoVenda(v.id, "CANCELADA", { forcar: true });
    expect((await fisico()).fisico).toBe(5);
    expect(await prisma.lancamento.count({ where: { origemId: v.id } })).toBe(0);
  });

  it("cancelar venda do PDV estorna o recebimento, devolve o estoque e registra no histórico", async () => {
    const ped = await import("@/lib/vendas/pedidos");
    const cli = await prisma.pessoa.create({ data: { nome: "Maria", cliente: true } });
    const v = await vendas.vendaBalcao({ clienteId: cli.id, itens: [{ produtoId: prod, quantidade: 2 }], pagamentos: [{ formaPagamentoId: dinheiro, valor: 19.8 }, { formaPagamentoId: credito, valor: 60, parcelas: 3 }] });
    expect(v.clienteId).toBe(cli.id);
    expect((await fisico()).fisico).toBe(3);
    const u = { id: "", nome: "Gerente" };
    const r = await ped.cancelarVendaBalcao(v.id, u, { motivo: "cliente desistiu" });
    expect(r.estornado).toBeCloseTo(19.8);
    expect((await fisico()).fisico).toBe(5);
    expect(await prisma.lancamento.count({ where: { origemId: v.id } })).toBe(0);
    const depois = await prisma.venda.findUniqueOrThrow({ where: { id: v.id }, include: { historico: true } });
    expect(depois.situacao).toBe("CANCELADA");
    expect(depois.historico[0].descricao).toMatch(/estornado.*Motivo: cliente desistiu/);
    await expect(ped.cancelarVendaBalcao(v.id, u)).rejects.toThrow(/já está cancelada/);
    // a situação "Cancelada" vem marcada para não aparecer na lista, mas no balcão a venda cancelada aparece
    expect(depois.situacaoId).not.toBeNull();
    await prisma.situacaoVendaConfig.update({ where: { id: depois.situacaoId! }, data: { exibir: false } });
    const sp = { periodo: "todos" };
    expect((await prisma.venda.findMany({ where: await ped.whereVendas("BALCAO", sp) })).map((x) => x.id)).toContain(v.id);
    expect((await prisma.venda.findMany({ where: await ped.whereVendas("PEDIDO", { periodo: "todos" }, { todasSituacoes: true }) })).map((x) => x.id)).not.toContain(v.id);
  });

  it("não cancela venda do PDV com recebimento já conciliado", async () => {
    const ped = await import("@/lib/vendas/pedidos");
    const u = { id: "", nome: "Gerente" };
    const v = await vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 1 }], pagamentos: [{ formaPagamentoId: dinheiro, valor: 39.9 }] });
    const l = await prisma.lancamento.findFirstOrThrow({ where: { origemId: v.id } });
    await prisma.transacaoPagSeguro.create({ data: { codigo: "T1", dataVenda: new Date(), meio: "PIX", valorBruto: 39.9, valorLiquido: 39.9, situacao: "CONCILIADA", lancamentoId: l.id } });
    await expect(ped.cancelarVendaBalcao(v.id, u)).rejects.toThrow(/conciliado/);
    await prisma.transacaoPagSeguro.deleteMany({});
    expect((await fisico()).fisico).toBe(4);
    expect(await prisma.lancamento.count({ where: { origemId: v.id } })).toBe(1);
  });

  it("divide parcelas sem perder centavos", () => {
    expect(dividirParcelas(100, 3)).toEqual([33.34, 33.33, 33.33]);
  });
});
