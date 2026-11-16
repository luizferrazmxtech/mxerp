import { periodoDia } from "@/lib/datas";

/** Período do seletor convertido em instantes (dia de São Paulo, UTC-3) para filtrar createdAt. */
export function periodoInstantes(p?: string, de?: string, ate?: string) {
  const per = periodoDia(p, de, ate);
  if (!per) return { rotulo: "Todo o período", filtro: undefined };
  return { rotulo: per.rotulo, filtro: { gte: new Date(per.de.getTime() + 3 * 3600e3), lt: new Date(per.ate.getTime() + 27 * 3600e3) } };
}
