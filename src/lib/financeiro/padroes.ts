import type { Tx } from "@/lib/db";

/** Cadastros financeiros mínimos para o sistema funcionar (idempotente). */
export const FORMAS_PADRAO = [
  { nome: "Dinheiro", tPag: "01", diasPrazo: 0 },
  { nome: "PIX", tPag: "17", diasPrazo: 0 },
  { nome: "Cartão de débito", tPag: "04", diasPrazo: 1 },
  { nome: "Cartão de crédito", tPag: "03", diasPrazo: 30 },
  { nome: "Boleto", tPag: "15", diasPrazo: 30 },
  { nome: "Crediário / a prazo", tPag: "05", diasPrazo: 30 },
];

export const CATEGORIAS_PADRAO = [
  { nome: "Venda de produtos", tipo: "RECEBER", grupoDre: "RECEITA_BRUTA" },
  { nome: "Prestação de serviços", tipo: "RECEBER", grupoDre: "RECEITA_BRUTA" },
  { nome: "Receitas financeiras", tipo: "RECEBER", grupoDre: "RECEITA_FINANCEIRA" },
  { nome: "Outras receitas", tipo: "RECEBER", grupoDre: "OUTRAS_RECEITAS" },
  { nome: "Impostos sobre vendas (DAS/ICMS/ISS)", tipo: "PAGAR", grupoDre: "DEDUCOES" },
  { nome: "Devoluções de vendas", tipo: "PAGAR", grupoDre: "DEDUCOES" },
  // compra de mercadoria vira estoque; o custo entra na DRE como CMV quando a peça é vendida
  { nome: "Compra de mercadorias (estoque)", tipo: "PAGAR", grupoDre: "NAO_OPERACIONAL" },
  { nome: "Serviços de terceiros", tipo: "PAGAR", grupoDre: "CUSTO" },
  { nome: "Salários e encargos", tipo: "PAGAR", grupoDre: "DESPESA_OPERACIONAL" },
  { nome: "Aluguel", tipo: "PAGAR", grupoDre: "DESPESA_OPERACIONAL" },
  { nome: "Energia, água, internet, telefone", tipo: "PAGAR", grupoDre: "DESPESA_OPERACIONAL" },
  { nome: "Combustível e veículos", tipo: "PAGAR", grupoDre: "DESPESA_OPERACIONAL" },
  { nome: "Tarifas bancárias e taxas de cartão", tipo: "PAGAR", grupoDre: "DESPESA_FINANCEIRA" },
  { nome: "Juros pagos", tipo: "PAGAR", grupoDre: "DESPESA_FINANCEIRA" },
  { nome: "Outras despesas", tipo: "PAGAR", grupoDre: "OUTRAS_DESPESAS" },
  { nome: "Retirada de sócios", tipo: "PAGAR", grupoDre: "NAO_OPERACIONAL" },
  { nome: "Transferência entre contas", tipo: "PAGAR", grupoDre: "NAO_OPERACIONAL" },
  { nome: "Transferência entre contas", tipo: "RECEBER", grupoDre: "NAO_OPERACIONAL" },
] as const;

export async function garantirPadroes(tx: Tx) {
  for (const f of FORMAS_PADRAO)
    await tx.formaPagamento.upsert({ where: { nome: f.nome }, create: f, update: {} });
  for (const c of CATEGORIAS_PADRAO)
    await tx.categoriaFinanceira.upsert({
      where: { nome_tipo: { nome: c.nome, tipo: c.tipo } },
      create: c,
      update: {},
    });
  await tx.contaBancaria.upsert({ where: { nome: "Caixa" }, create: { nome: "Caixa" }, update: {} });
}

export async function categoria(tx: Tx, nome: string, tipo: "RECEBER" | "PAGAR") {
  return tx.categoriaFinanceira.findUniqueOrThrow({ where: { nome_tipo: { nome, tipo } } });
}

/**
 * Categoria da receita de um documento com peças e/ou serviços. Quando tem os dois, o lançamento fica na
 * categoria da parte maior e ganha um rateio proporcional, para a DRE separar "Venda de produtos" e
 * "Prestação de serviços" sem duplicar a conta (um boleto por parcela).
 */
export async function receitaDocumento(tx: Tx, totalProdutos: number, totalServicos: number) {
  const prod = await categoria(tx, "Venda de produtos", "RECEBER");
  const serv = await categoria(tx, "Prestação de serviços", "RECEBER");
  const soma = Math.max(0, totalProdutos) + Math.max(0, totalServicos);
  if (!(totalProdutos > 0) || !(totalServicos > 0)) return { categoriaId: totalServicos > 0 && !(totalProdutos > 0) ? serv.id : prod.id, rateio: [] as { categoriaId: string; fracao: number }[] };
  const fp = Math.round((totalProdutos / soma) * 1e8) / 1e8;
  return { categoriaId: fp >= 0.5 ? prod.id : serv.id, rateio: [{ categoriaId: prod.id, fracao: fp }, { categoriaId: serv.id, fracao: Math.round((1 - fp) * 1e8) / 1e8 }] };
}
