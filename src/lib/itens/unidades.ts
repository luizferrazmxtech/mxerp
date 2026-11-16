/**
 * Comparação de unidades e palpite de conversão (sem banco: o formulário também usa).
 * Notas de fornecedores escrevem a mesma unidade de jeitos diferentes (UN, UND, UNID, PC…).
 */

const GRUPOS: Record<string, string[]> = {
  UN: ["UN", "UND", "UNID", "UNIDADE", "UNIDADES", "U", "PC", "PCS", "PCA", "PECA", "PEÇA", "PÇ", "UN1"],
  M: ["M", "MT", "MTS", "MTR", "METRO", "METROS", "ML"],
  CX: ["CX", "CXA", "CAIXA", "CX1", "BOX"],
  RL: ["RL", "ROLO", "RLO", "BOB", "BOBINA"],
  KG: ["KG", "KGS", "QUILO", "QUILOGRAMA"],
  PCT: ["PCT", "PCTE", "PACOTE", "PT", "PAC"],
  M2: ["M2", "M²", "METRO QUADRADO"],
  L: ["L", "LT", "LITRO", "LITROS"],
  PAR: ["PAR", "PR"],
  JG: ["JG", "JOGO", "KIT", "KT"],
};
const GRUPO_DE = new Map(Object.entries(GRUPOS).flatMap(([g, l]) => l.map((u) => [u, g] as const)));

/** Unidade normalizada para comparar (UND → UN, MTS → M, CAIXA → CX). */
export function unidadeBase(u: string | null | undefined) {
  const k = (u ?? "").trim().toUpperCase().replace(/\.$/, "");
  return GRUPO_DE.get(k) ?? k;
}
export const mesmaUnidade = (a: string | null | undefined, b: string | null | undefined) => unidadeBase(a) === unidadeBase(b);

/**
 * Palpite do fator pela descrição, quando o produto é vendido por metro e comprado em caixa/rolo:
 * "CABO UTP CAT6 CX 305M" → 305, "ROLO NYLON 100 METROS" → 100. Sem palpite devolve null.
 */
export function fatorPeloNome(nome: string, unidadeVenda: string) {
  if (unidadeBase(unidadeVenda) !== "M") return null;
  const m = /(\d{1,4}(?:[.,]\d+)?)\s*(?:M|MT|MTS|METROS?)\b/i.exec(nome);
  const v = m ? Number(m[1].replace(",", ".")) : NaN;
  return v > 1 ? v : null;
}

/** Texto da conversão: "1 CX = 305 MT". */
export const textoConversao = (unidadeCompra: string, fator: number, unidade: string) =>
  `1 ${unidadeCompra} = ${fator.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} ${unidade}`;
