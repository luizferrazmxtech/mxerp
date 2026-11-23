import { lerNumero } from "@/lib/itens/tipos";
import { descontoLinha, subtotalProduto, type LinhaServico, type Parcela } from "@/lib/orcamentos/tipos";

/** Tipos e cálculos das compras que o formulário (cliente) também usa. */

/**
 * Linha de produto da compra. `quantidade` e `valorUnit` estão na unidade da nota: se `unidadeCompra` estiver preenchida,
 * cada uma vale `fator` unidades do produto (ex.: 1 CX = 305 MT); no estoque entra quantidade × fator, com o custo por MT.
 * `codigoFornecedor` é o código do item na NF-e (vínculo aprendido ao salvar) e `salvarConversao` grava a conversão no produto.
 */
export type LinhaCompra = {
  produtoId: string; nome: string; codigo: string; unidade: string; detalhes: string; quantidade: string; valorUnit: string; desconto: string; descontoPct: boolean;
  unidadeCompra?: string; fator?: string; codigoFornecedor?: string; salvarConversao?: boolean;
  /** conversão que está no cadastro do produto (para o formulário oferecer as duas unidades) */
  conversaoProduto?: { unidade: string; fator: number } | null;
};

export type DadosCompra = {
  tipo: "PRODUTO" | "SERVICO"; numero: string; fornecedorId: string; fornecedorNome: string; data: string; situacaoId: string;
  numeroNfe: string; chaveNfe: string; centroCusto: string;
  produtos: LinhaCompra[]; servicos: LinhaServico[];
  transportadoraId: string; transportadoraNome: string; frete: string; freteNoTotal: boolean; impostos: string; impostosNoTotal: boolean;
  desconto: string; descontoPct: boolean;
  condicao: "AVISTA" | "PARCELADO"; formaPagamentoId: string; vencimento: string; intervaloDias: string; numParcelas: string; primeiraParcela: string; parcelas: Parcela[];
  observacoes: string; observacaoInterna: string; camposExtras: Record<string, string>;
  /** estoque (depósito) onde as peças entram; "" = o padrão das configurações de estoque */
  depositoId?: string;
  cotacaoId?: string;
};

const n = (s: string) => lerNumero(s) ?? 0;
const arred = (v: number) => Math.round(v * 100) / 100;

export const subtotalCompra = subtotalProduto;

/** Quantas unidades do produto vêm em cada unidade da linha (1 quando a linha está na própria unidade do produto). */
export function fatorLinha(l: Pick<LinhaCompra, "unidadeCompra" | "fator">) {
  if (!(l.unidadeCompra ?? "").trim()) return 1;
  const f = lerNumero(l.fator ?? "");
  return f && f > 0 ? f : 1;
}
/** Quantidade que entra no estoque, na unidade do produto. */
export const qtdEstoqueLinha = (l: Pick<LinhaCompra, "unidadeCompra" | "fator" | "quantidade">) => n(l.quantidade) * fatorLinha(l);
/** Custo por unidade do produto (subtotal com desconto ÷ quantidade convertida). */
export function custoUnidadeVenda(l: LinhaCompra) {
  const q = qtdEstoqueLinha(l);
  return q > 0 ? subtotalCompra(l) / q : 0;
}

/** Totais: produtos e serviços − desconto, mais frete e impostos quando marcados para somar. */
export function totaisCompra(d: Pick<DadosCompra, "produtos" | "servicos" | "desconto" | "descontoPct" | "frete" | "freteNoTotal" | "impostos" | "impostosNoTotal">) {
  const produtos = arred(d.produtos.reduce((s, l) => s + subtotalCompra(l), 0));
  const servicos = arred(d.servicos.reduce((s, l) => s + subtotalCompra(l), 0));
  const desconto = descontoLinha(produtos + servicos, d.desconto, d.descontoPct);
  const frete = n(d.frete), impostos = n(d.impostos);
  return { produtos, servicos, desconto, frete, impostos, total: arred(produtos + servicos - desconto + (d.freteNoTotal ? frete : 0) + (d.impostosNoTotal ? impostos : 0)) };
}

/** O que a situação lança, como no Gestão Click. */
export const LANCAMENTOS_COMPRA: [string, string][] = [
  ["NAO", "Não lança"], ["AMBOS", "Lança estoque e financeiro"], ["ESTOQUE", "Lança somente estoque"], ["FINANCEIRO", "Lança somente financeiro"],
];
export const rotuloLancamento = (l: string) => LANCAMENTOS_COMPRA.find(([v]) => v === l)?.[1] ?? l;
export const lancaEstoque = (l: string) => l === "AMBOS" || l === "ESTOQUE";
export const lancaFinanceiro = (l: string) => l === "AMBOS" || l === "FINANCEIRO";

export const TAGS_COMPRA = ["[nome_fornecedor]", "[numero]", "[valor_total]", "[data]", "[link]", "[nome_empresa]"];

/** Situações da cotação: rótulo e cor da pílula. */
export const SIT_COTACAO: Record<string, [string, string]> = {
  ABERTA: ["Em aberto", "border-orange-300 bg-orange-50 text-orange-700"],
  FINALIZADA: ["Virou compra", "border-emerald-300 bg-emerald-50 text-emerald-700"],
  CANCELADA: ["Cancelada", "border-slate-300 bg-slate-50 text-slate-600"],
};
