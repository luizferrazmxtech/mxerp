import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { LOJA_ATUAL } from "@/lib/empresa/loja";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const est = await import("@/lib/estoque/estoque");
const vendas = await import("@/lib/vendas/vendas");
const ped = await import("@/lib/vendas/pedidos");
const { garantirPadroes } = await import("@/lib/financeiro/padroes");
const { baixarLancamento, estornarLancamento } = await import("@/lib/financeiro/lancamentos");
const { TAXAS_PAGSEGURO, calcularTaxa, colunaParcelamento, lerTabela, maxVezes, cartao } = await import("@/lib/financeiro/taxasCartao");
type Dados = import("@/lib/orcamentos/tipos").DadosOrcamento;

let prod = "", cli = "", credito = "", debito = "", contaPs = "";
let u = { id: "", nome: "Luiz", papel: "ADMIN" as const };

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "Lancamento","VendaPagamento","VendaItem","Venda","Reserva","MovimentoEstoque","Saldo","Produto","Servico","Local","Deposito","Pessoa","Sequencia","FormaPagamento","CategoriaFinanceira","ContaBancaria" CASCADE`);
  await prisma.situacaoVendaConfig.updateMany({ data: { bloqueados: [], permiteEdicao: true } });
  const dep = await prisma.deposito.create({ data: { nome: "Loja" } });
  const loc = (await prisma.local.create({ data: { depositoId: dep.id, codigo: "A-01" } })).id;
  prod = (await prisma.produto.create({ data: { codigo: "NB", nome: "Nobreak", precoVenda: 1000, custo: 600, localPadraoId: loc } })).id;
  cli = (await prisma.pessoa.create({ data: { nome: "Cliente", cliente: true } })).id;
  const usuario = await prisma.usuario.upsert({ where: { email: "formas@local.test" }, update: {}, create: { nome: "Luiz", email: "formas@local.test", papel: "ADMIN" } });
  u = { id: usuario.id, nome: usuario.nome, papel: "ADMIN" };
  await prisma.$transaction(async (tx) => {
    await est.entrada(tx, { produtoId: prod, localId: loc, quantidade: 10, origemTipo: "IMPLANTACAO" });
    await garantirPadroes(tx);
  });
  contaPs = (await prisma.contaBancaria.create({ data: { nome: "PagSeguro" } })).id;
  const tab = JSON.parse(JSON.stringify(TAXAS_PAGSEGURO));
  credito = (await prisma.formaPagamento.update({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: "Cartão de crédito" } }, data: { taxas: tab, contaBancariaId: contaPs } })).id;
  debito = (await prisma.formaPagamento.update({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: "Cartão de débito" } }, data: { taxas: tab, contaBancariaId: contaPs } })).id;
});

const saldo = async (contaId: string) => {
  const ls = await prisma.lancamento.findMany({ where: { contaBancariaId: contaId, pagoEm: { not: null } } });
  return Math.round(ls.reduce((s, l) => s + (l.tipo === "RECEBER" ? 1 : -1) * Number(l.valorPago), 0) * 100) / 100;
};

describe("taxas do cartão", () => {
  it("como o simulador da PagSeguro: intermediação do plano + parcelamento (antecipação a 1,71% ao mês)", () => {
    // a fórmula 1 − (1/n)·Σ 1/1,0171^i bate com o simulador (até 0,01 em 3x e 7x)
    expect(colunaParcelamento(1.71)).toEqual([0, 2.51, 3.32, 4.13, 4.93, 5.72, 6.5, 7.28, 8.04, 8.8, 9.54, 10.28]);
    const f = { tPag: "03", taxa: 0, taxas: TAXAS_PAGSEGURO };
    expect(calcularTaxa(f, 1000, "Visa", 1)).toMatchObject({ percentual: 3.05, parcelamento: 0, taxa: 30.5, liquido: 969.5, prazoDias: 0, rotulo: "Crédito 1x Visa" });
    // telas do simulador: R$ 100,00 em 2x recebe R$ 94,74; em 7x, R$ 90,64; em 12x, R$ 86,87
    expect(calcularTaxa(f, 100, "Mastercard", 2)).toMatchObject({ intermediacao: 2.75, parcelamento: 2.51, taxa: 5.26, liquido: 94.74 });
    expect(calcularTaxa(f, 100, "Visa", 7)).toMatchObject({ intermediacao: 2.85, parcelamento: 6.51, liquido: 90.64 });
    expect(calcularTaxa(f, 100, "Visa", 12).liquido).toBe(86.87);
    expect(calcularTaxa(f, 1000, "Diners", 12)).toMatchObject({ percentual: 14.07, taxa: 140.7, prazoDias: 30 });
    // tabela guardada no banco (JSON) volta igual
    expect(lerTabela(JSON.parse(JSON.stringify(TAXAS_PAGSEGURO)))).toEqual(TAXAS_PAGSEGURO);
    // demais bandeiras (Elo…): na hora; R$ 100,00 em 2x recebe R$ 93,24. Bandeira fora da lista cai em "Outras"
    expect(calcularTaxa(f, 100, "Elo", 2)).toMatchObject({ intermediacao: 4.25, parcelamento: 2.51, liquido: 93.24, prazoDias: 0 });
    expect(calcularTaxa(f, 100, "Diners", 7)).toMatchObject({ liquido: 89.7, prazoDias: 30 });
    expect(calcularTaxa(f, 100, "Bandeira X", 1).percentual).toBe(4.75);
    // sem bandeira, o primeiro grupo
    expect(calcularTaxa(f, 100, "", 1).percentual).toBe(3.05);
    expect(maxVezes(TAXAS_PAGSEGURO, "Elo")).toBe(12);
    // débito: Visa/Master 1,55% na hora; a outra bandeira sem débito usa o do primeiro grupo
    const d = { tPag: "04", taxa: 0, taxas: TAXAS_PAGSEGURO };
    expect(calcularTaxa(d, 200, "Visa", 5)).toMatchObject({ percentual: 1.55, taxa: 3.1, vezes: 1, prazoDias: 0 });
    expect(calcularTaxa(d, 200, "Elo").percentual).toBe(1.55);
    // forma sem tabela: taxa fixa
    expect(calcularTaxa({ tPag: "17", taxa: 0.99, taxas: {} }, 100)).toMatchObject({ percentual: 0.99, taxa: 0.99, prazoDias: null });
    expect(cartao(" Visa ", "15")).toEqual({ bandeira: "Visa", vezes: 12 });
  });

  it("PDV: crédito Visa 3x cai na hora na conta PagSeguro e a taxa sai na mesma conta, em \"PagSeguro taxas\"", async () => {
    const v = await vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 1 }], pagamentos: [{ formaPagamentoId: credito, valor: 1000, parcelas: 3, bandeira: "Visa" }] });
    const rec = await prisma.lancamento.findMany({ where: { origemId: v.id, tipo: "RECEBER" } });
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ contaBancariaId: contaPs, observacao: "Crédito 3x Visa" });
    expect(rec[0].pagoEm).not.toBeNull();
    const taxa = await prisma.lancamento.findFirstOrThrow({ where: { taxaDeId: rec[0].id }, include: { categoria: { include: { pai: true } } } });
    expect(Number(taxa.valor)).toBe(60.8); // 2,75% + 3,33%
    expect(taxa.pagoEm).not.toBeNull();
    expect(taxa.categoria.nome).toBe("PagSeguro taxas");
    expect(taxa.categoria.pai?.nome).toBe("Tarifas bancárias e taxas de cartão");
    expect(await saldo(contaPs)).toBe(939.2);
    expect((await prisma.vendaPagamento.findFirstOrThrow({ where: { vendaId: v.id } })).bandeira).toBe("Visa");
  });

  it("PDV: Diners fica a receber em 30 dias, com a taxa em aberto; a baixa paga a taxa e o estorno reabre", async () => {
    const v = await vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 1 }], pagamentos: [{ formaPagamentoId: credito, valor: 1000, parcelas: 2, bandeira: "Diners" }] });
    const rec = await prisma.lancamento.findFirstOrThrow({ where: { origemId: v.id, tipo: "RECEBER" } });
    expect(rec.pagoEm).toBeNull();
    expect((rec.vencimento.getTime() - rec.competencia.getTime()) / 86400000).toBe(30);
    const taxa = await prisma.lancamento.findFirstOrThrow({ where: { taxaDeId: rec.id } });
    expect(Number(taxa.valor)).toBe(63); // 3,79% + 2,51%
    expect(taxa.pagoEm).toBeNull();
    expect(taxa.vencimento).toEqual(rec.vencimento);

    await prisma.$transaction((tx) => baixarLancamento(tx, rec.id, { data: rec.vencimento, contaBancariaId: contaPs }));
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id: taxa.id } })).pagoEm).toEqual(rec.vencimento);
    expect(await saldo(contaPs)).toBe(937);
    await prisma.$transaction((tx) => estornarLancamento(tx, rec.id));
    expect((await prisma.lancamento.findUniqueOrThrow({ where: { id: taxa.id } })).pagoEm).toBeNull();
  });

  it("forma sem taxa (dinheiro) não lança nada a mais", async () => {
    const din = await prisma.formaPagamento.findUniqueOrThrow({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: "Dinheiro" } } });
    const v = await vendas.vendaBalcao({ itens: [{ produtoId: prod, quantidade: 1 }], pagamentos: [{ formaPagamentoId: din.id, valor: 1000 }] });
    expect(await prisma.lancamento.count({ where: { OR: [{ origemId: v.id }, { taxaDe: { origemId: v.id } }] } })).toBe(1);
    expect(debito).not.toBe("");
  });

  it("pedido de venda à vista no crédito: bandeira e vezes geram a taxa; cancelar apaga a taxa junto", async () => {
    const dados: Dados = {
      tipo: "PRODUTO", numero: "", clienteId: cli, clienteNome: "", data: "2026-11-24", validade: "", vendedorId: "", prazoEntrega: "", aosCuidados: "",
      canal: "Presencial", centroCusto: "", introducao: "", situacaoId: "sv_aberto",
      produtos: [{ produtoId: prod, nome: "Nobreak", codigo: "NB", unidade: "UN", detalhes: "", quantidade: "1", tipoValorId: "", valorUnit: "1000,00", desconto: "0", descontoPct: false }],
      servicos: [], transportadoraId: "", transportadoraNome: "", frete: "0", mostrarEntrega: false, enderecoEntregaId: "",
      desconto: "", descontoPct: false, exibirTotal: true,
      gerarCondicoes: true, condicao: "AVISTA", formaPagamentoId: credito, vencimento: "2026-11-24", intervaloDias: "30", numParcelas: "2", primeiraParcela: "2026-11-24",
      parcelas: [], bandeira: "Elo", vezes: "6", observacoes: "", observacaoInterna: "", camposExtras: {},
    };
    const v = await ped.salvarPedido(dados, u);
    const p = await prisma.vendaParcela.findFirstOrThrow({ where: { vendaId: v.id } });
    expect(p).toMatchObject({ bandeira: "Elo", vezes: 6 });
    await ped.alterarSituacaoPedido(v.id, "sv_concretizada", u);
    const rec = await prisma.lancamento.findFirstOrThrow({ where: { origemTipo: "VENDA", origemId: v.id } });
    expect(rec.vencimento.toISOString().slice(0, 10)).toBe("2026-11-24"); // demais bandeiras: na hora
    expect(rec.observacao).toBe("Crédito 6x Elo");
    const taxa = await prisma.lancamento.findFirstOrThrow({ where: { taxaDeId: rec.id } });
    expect(Number(taxa.valor)).toBe(99.7); // 4,25% + 5,72%
    expect(taxa).toMatchObject({ tipo: "PAGAR", contaBancariaId: contaPs, pagoEm: null });

    await ped.alterarSituacaoPedido(v.id, "sv_cancelada", u);
    expect(await prisma.lancamento.count({ where: { id: { in: [rec.id, taxa.id] } } })).toBe(0);
  });
});
