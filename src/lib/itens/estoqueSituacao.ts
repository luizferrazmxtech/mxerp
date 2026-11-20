/** Situação do estoque de um produto na busca (cores das etiquetas). Sem banco: pode ir para o navegador. */
export type SituacaoEstoque = "SEM_CONTROLE" | "FALTA" | "ABAIXO" | "OK" | "ACIMA";

export function situacaoEstoque(disponivel: number | null, minimo: number, maximo: number | null): SituacaoEstoque {
  if (disponivel == null) return "SEM_CONTROLE";
  if (disponivel <= 0) return "FALTA";
  if (minimo > 0 && disponivel < minimo) return "ABAIXO";
  if (maximo != null && maximo > 0 && disponivel > maximo) return "ACIMA";
  return "OK";
}

export const ROTULO_ESTOQUE: Record<SituacaoEstoque, { rotulo: string; cor: string; linha: string }> = {
  FALTA: { rotulo: "Em falta", cor: "text-red-700 bg-red-50", linha: "bg-red-50/60" },
  ABAIXO: { rotulo: "Abaixo do mínimo", cor: "text-amber-700 bg-amber-50", linha: "bg-amber-50/60" },
  OK: { rotulo: "Em estoque", cor: "text-emerald-700 bg-emerald-50", linha: "" },
  ACIMA: { rotulo: "Acima do máximo", cor: "text-sky-700 bg-sky-50", linha: "" },
  SEM_CONTROLE: { rotulo: "Sem controle", cor: "text-slate-600 bg-slate-50", linha: "" },
};
