import type { Tx } from "@/lib/db";
import { LOJA_ATUAL } from "@/lib/empresa/loja";

/** Cadastros financeiros mínimos para o sistema funcionar (idempotente). */
export const FORMAS_PADRAO = [
  { nome: "Dinheiro", tPag: "01", diasPrazo: 0 },
  { nome: "PIX", tPag: "17", diasPrazo: 0 },
  { nome: "Cartão de débito", tPag: "04", diasPrazo: 1 },
  { nome: "Cartão de crédito", tPag: "03", diasPrazo: 30 },
  { nome: "Boleto", tPag: "15", diasPrazo: 30, boletoInter: true },
  { nome: "Crediário / a prazo", tPag: "05", diasPrazo: 30 },
];

// `codigo` é a classificação inicial no plano de contas (1 = receitas, 2 = saídas); dá para mudar na tela
export const CATEGORIAS_PADRAO = [
  { codigo: "1.01", nome: "Venda de produtos", tipo: "RECEBER", grupoDre: "RECEITA_BRUTA" },
  { codigo: "1.02", nome: "Prestação de serviços", tipo: "RECEBER", grupoDre: "RECEITA_BRUTA" },
  { codigo: "1.03", nome: "Receitas financeiras", tipo: "RECEBER", grupoDre: "RECEITA_FINANCEIRA" },
  { codigo: "1.04", nome: "Outras receitas", tipo: "RECEBER", grupoDre: "OUTRAS_RECEITAS" },
  { codigo: "2.01", nome: "Impostos sobre vendas (DAS/ICMS/ISS)", tipo: "PAGAR", grupoDre: "DEDUCOES" },
  { codigo: "2.02", nome: "Devoluções de vendas", tipo: "PAGAR", grupoDre: "DEDUCOES" },
  // compra de mercadoria vira estoque; o custo entra na DRE como CMV quando a peça é vendida
  { codigo: "2.03", nome: "Compra de mercadorias (estoque)", tipo: "PAGAR", grupoDre: "NAO_OPERACIONAL" },
  { codigo: "2.04", nome: "Serviços de terceiros", tipo: "PAGAR", grupoDre: "CUSTO" },
  { codigo: "2.05", nome: "Salários e encargos", tipo: "PAGAR", grupoDre: "DESPESA_OPERACIONAL" },
  { codigo: "2.06", nome: "Aluguel", tipo: "PAGAR", grupoDre: "DESPESA_OPERACIONAL" },
  { codigo: "2.07", nome: "Energia, água, internet, telefone", tipo: "PAGAR", grupoDre: "DESPESA_OPERACIONAL" },
  { codigo: "2.08", nome: "Combustível e veículos", tipo: "PAGAR", grupoDre: "DESPESA_OPERACIONAL" },
  { codigo: "2.09", nome: "Tarifas bancárias e taxas de cartão", tipo: "PAGAR", grupoDre: "DESPESA_FINANCEIRA" },
  { codigo: "2.10", nome: "Juros pagos", tipo: "PAGAR", grupoDre: "DESPESA_FINANCEIRA" },
  { codigo: "2.11", nome: "Outras despesas", tipo: "PAGAR", grupoDre: "OUTRAS_DESPESAS" },
  { codigo: "2.12", nome: "Retirada de sócios", tipo: "PAGAR", grupoDre: "NAO_OPERACIONAL" },
  { codigo: "3.01", nome: "Transferência entre contas", tipo: "PAGAR", grupoDre: "NAO_OPERACIONAL" },
  { codigo: "3.02", nome: "Transferência entre contas", tipo: "RECEBER", grupoDre: "NAO_OPERACIONAL" },
] as const;

export async function garantirPadroes(tx: Tx) {
  for (const f of FORMAS_PADRAO)
    await tx.formaPagamento.upsert({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: f.nome } }, create: f, update: {} });
  // uma consulta só quando já está tudo criado (a tela do financeiro chama isto a cada abertura)
  const existentes = await tx.categoriaFinanceira.findMany({ where: { OR: CATEGORIAS_PADRAO.map((c) => ({ nome: c.nome, tipo: c.tipo })) }, select: { nome: true, tipo: true, codigo: true } });
  for (const c of CATEGORIAS_PADRAO) {
    const e = existentes.find((x) => x.nome === c.nome && x.tipo === c.tipo);
    if (!e) await tx.categoriaFinanceira.create({ data: c });
    else if (e.codigo === null) await tx.categoriaFinanceira.update({ where: { empresaId_nome_tipo: { empresaId: LOJA_ATUAL, nome: c.nome, tipo: c.tipo } }, data: { codigo: c.codigo } });
  }
  await tx.contaBancaria.upsert({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: "Caixa" } }, create: { nome: "Caixa" }, update: {} });
}

export async function categoria(tx: Tx, nome: string, tipo: "RECEBER" | "PAGAR") {
  return tx.categoriaFinanceira.findUniqueOrThrow({ where: { empresaId_nome_tipo: { empresaId: LOJA_ATUAL, nome, tipo } } });
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

/** Subcategorias de pagamento a funcionários (filhas de "Salários e encargos"), usadas pela conciliação. */
export const CATEGORIAS_PESSOAL = {
  SALARIO: { codigo: "2.05.01", nome: "Salários" },
  ADIANTAMENTO: { codigo: "2.05.02", nome: "Adiantamento salarial" },
  FERIAS: { codigo: "2.05.03", nome: "Férias" },
  DECIMO: { codigo: "2.05.04", nome: "13º salário" },
  OUTROS: { codigo: "2.05.09", nome: "Outros pagamentos a funcionários" },
} as const;
export type TipoPagamentoPessoal = keyof typeof CATEGORIAS_PESSOAL;

/**
 * Categorias que a conciliação reconhece pelo nome de quem recebeu (regras do Luiz, 22/11): FGTS (Cef Matriz), INSS e
 * Simples Nacional (Receita Federal: no dia 20 costumam ser dois pagamentos, o maior é o Simples) e o plano de saúde
 * dos funcionários (Hapvida). Encargos e plano ficam dentro de "Salários e encargos" (entram no painel de mão de obra).
 */
export const CATEGORIAS_CONCILIACAO = [
  { codigo: "2.05.05", nome: "FGTS", pai: "Salários e encargos", grupoDre: "DESPESA_OPERACIONAL" },
  { codigo: "2.05.06", nome: "INSS", pai: "Salários e encargos", grupoDre: "DESPESA_OPERACIONAL" },
  { codigo: "2.05.07", nome: "Plano de saúde dos funcionários", pai: "Salários e encargos", grupoDre: "DESPESA_OPERACIONAL" },
  { codigo: "2.05.08", nome: "Exames médicos de funcionários", pai: "Salários e encargos", grupoDre: "DESPESA_OPERACIONAL" },
  { codigo: "2.01.01", nome: "Simples Nacional", pai: "Impostos sobre vendas (DAS/ICMS/ISS)", grupoDre: "DEDUCOES" },
  { codigo: "2.01.02", nome: "ICMS ST e DIFAL", pai: "Impostos sobre vendas (DAS/ICMS/ISS)", grupoDre: "DEDUCOES" },
  { codigo: "2.11.01", nome: "Seguros", pai: "Outras despesas", grupoDre: "OUTRAS_DESPESAS" },
  { codigo: "2.13", nome: "Fatura de cartão de crédito", pai: null, grupoDre: "OUTRAS_DESPESAS" },
] as const;

export async function garantirCategoriasPessoal(tx: Tx) {
  for (const c of CATEGORIAS_CONCILIACAO) {
    const p = c.pai ? await tx.categoriaFinanceira.findUnique({ where: { empresaId_nome_tipo: { empresaId: LOJA_ATUAL, nome: c.pai, tipo: "PAGAR" } }, select: { id: true } }) : null;
    await tx.categoriaFinanceira.upsert({ where: { empresaId_nome_tipo: { empresaId: LOJA_ATUAL, nome: c.nome, tipo: "PAGAR" } },
      create: { nome: c.nome, tipo: "PAGAR", grupoDre: c.grupoDre, codigo: c.codigo, paiId: p?.id ?? null },
      update: {},
    });
  }
  const pai = await tx.categoriaFinanceira.findUnique({ where: { empresaId_nome_tipo: { empresaId: LOJA_ATUAL, nome: "Salários e encargos", tipo: "PAGAR" } } });
  const out = {} as Record<TipoPagamentoPessoal, string>;
  for (const [k, c] of Object.entries(CATEGORIAS_PESSOAL) as [TipoPagamentoPessoal, { codigo: string; nome: string }][]) {
    const r = await tx.categoriaFinanceira.upsert({ where: { empresaId_nome_tipo: { empresaId: LOJA_ATUAL, nome: c.nome, tipo: "PAGAR" } },
      create: { nome: c.nome, tipo: "PAGAR", grupoDre: "DESPESA_OPERACIONAL", codigo: c.codigo, paiId: pai?.id ?? null },
      update: {},
    });
    out[k] = r.id;
  }
  return out;
}
