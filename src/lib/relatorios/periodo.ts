import { periodoDia } from "@/lib/datas";

/** Período dos relatórios (padrão: mês atual; "todo o período" = últimos 5 anos). */
export function periodoRelatorio(sp: Record<string, string | undefined>) {
  const p = periodoDia(sp.periodo ?? "mes", sp.pde, sp.pate);
  if (p) return p;
  const hoje = new Date();
  return { de: new Date(Date.UTC(hoje.getUTCFullYear() - 5, 0, 1)), ate: new Date(Date.UTC(hoje.getUTCFullYear(), 11, 31)), rotulo: "Todo o período" };
}

export const paramsDe = (sp: Record<string, string | undefined>) => Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>;
