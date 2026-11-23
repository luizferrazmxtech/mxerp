import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { LOJA_ATUAL } from "@/lib/empresa/loja";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const est = await import("@/lib/estoque/estoque");
const os = await import("@/lib/os/os");
const vendas = await import("@/lib/vendas/vendas");
const fin = await import("@/lib/financeiro/lancamentos");
const { garantirPadroes, categoria } = await import("@/lib/financeiro/padroes");
const { calcularDre } = await import("@/lib/financeiro/dre");

let prod: string, cliente: string, servico: string, pix: string, boleto: string;
const ANO = new Date().getFullYear();
const MES = new Date().getMonth();

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Lancamento","VendaPagamento","VendaItem","Venda","Reserva","MovimentoEstoque","Saldo","OsItemProduto","OsItemServico","OsHistorico","OrdemServico","Servico","Produto","Local","Deposito","Pessoa","Sequencia","FormaPagamento","CategoriaFinanceira","ContaBancaria" CASCADE`);
  const dep = await prisma.deposito.create({ data: { nome: "Loja" } });
  const loc = (await prisma.local.create({ data: { depositoId: dep.id, codigo: "A-01" } })).id;
  prod = (await prisma.produto.create({ data: { codigo: "SW", nome: "Switch", precoVenda: 500, custo: 200, localPadraoId: loc } })).id;
  servico = (await prisma.servico.create({ data: { codigo: "INST", nome: "Instalação", preco: 300 } })).id;
  cliente = (await prisma.pessoa.create({ data: { nome: "Cliente" } })).id;
  await prisma.$transaction(async (tx) => {
    await est.entrada(tx, { produtoId: prod, localId: loc, quantidade: 10, origemTipo: "IMPLANTACAO" });
    await garantirPadroes(tx);
  });
  pix = (await prisma.formaPagamento.findUniqueOrThrow({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: "PIX" } } })).id;
  boleto = (await prisma.formaPagamento.findUniqueOrThrow({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: "Boleto" } } })).id;
});

describe("financeiro e DRE", () => {
  it("faturar OS baixa estoque e gera recebimento; reabrir cancela", async () => {
    const o = await os.criarOs({ clienteId: cliente });
    await os.adicionarProduto(o.id, { produtoId: prod, quantidade: 1 });
    await os.adicionarServico(o.id, { servicoId: servico });
    await expect(os.alterarSituacao(o.id, "FATURADA")).rejects.toThrow(/Faturar/);
    await os.faturarOs(o.id, [{ formaPagamentoId: boleto, valor: 800, parcelas: 2 }]);
    const l = await prisma.lancamento.findMany({ where: { origemId: o.id } });
    expect(l.map((x) => Number(x.valor))).toEqual([400, 400]);
    expect((await prisma.$transaction((tx) => est.resumoProduto(tx, prod))).fisico).toBe(9);
    await os.alterarSituacao(o.id, "EM_ANDAMENTO");
    expect(await prisma.lancamento.count({ where: { origemId: o.id } })).toBe(0);
    expect((await prisma.$transaction((tx) => est.resumoProduto(tx, prod))).reservado).toBe(1);
  });

  it("baixar e estornar lançamento atualiza saldo da conta", async () => {
    const cat = await prisma.$transaction((tx) => categoria(tx, "Aluguel", "PAGAR"));
    const caixa = await prisma.contaBancaria.findUniqueOrThrow({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: "Caixa" } } });
    const [l] = await prisma.$transaction((tx) =>
      fin.criarLancamentos(tx, { tipo: "PAGAR", descricao: "Aluguel", categoriaId: cat.id, valorTotal: 1500, primeiroVencimento: new Date() }));
    await prisma.$transaction((tx) => fin.baixarLancamento(tx, l.id, { data: new Date(), contaBancariaId: caixa.id, juros: 15 }));
    let saldo = (await prisma.$transaction((tx) => fin.saldosContas(tx))).find((c) => c.nome === "Caixa")!.saldo;
    expect(saldo).toBe(-1515);
    await prisma.$transaction((tx) => fin.estornarLancamento(tx, l.id));
    saldo = (await prisma.$transaction((tx) => fin.saldosContas(tx))).find((c) => c.nome === "Caixa")!.saldo;
    expect(saldo).toBe(0);
  });

  it("DRE: receita, CMV pelo custo das peças, despesas e resultado", async () => {
    await vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 2 }], pagamentos: [{ formaPagamentoId: pix, valor: 1000 }] });
    const aluguel = await prisma.$transaction((tx) => categoria(tx, "Aluguel", "PAGAR"));
    const compra = await prisma.$transaction((tx) => categoria(tx, "Compra de mercadorias (estoque)", "PAGAR"));
    const hoje = new Date();
    await prisma.$transaction(async (tx) => {
      await fin.criarLancamentos(tx, { tipo: "PAGAR", descricao: "Aluguel", categoriaId: aluguel.id, valorTotal: 300, primeiroVencimento: hoje });
      await fin.criarLancamentos(tx, { tipo: "PAGAR", descricao: "Compra", categoriaId: compra.id, valorTotal: 5000, primeiroVencimento: hoje });
    });
    const dre = await calcularDre(ANO);
    const linha = (k: string) => dre.linhas.find((l) => l.chave === k)!.meses[MES];
    expect(linha("RECEITA_BRUTA")).toBe(1000);
    expect(linha("CUSTO")).toBe(400); // 2 × 200, compra de estoque não entra
    expect(linha("LB")).toBe(600);
    expect(linha("DESPESA_OPERACIONAL")).toBe(300);
    expect(linha("RLIQ")).toBe(300);
    const caixa = await calcularDre(ANO, "CAIXA");
    expect(caixa.linhas.find((l) => l.chave === "DESPESA_OPERACIONAL")!.meses[MES]).toBe(0); // aluguel não pago
  });
});
