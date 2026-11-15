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
