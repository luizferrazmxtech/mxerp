/** Data "civil" de São Paulo como Date à meia-noite UTC (para colunas @db.Date). */
export function diaSP(d: Date = new Date()): Date {
  return new Date(`${d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}T00:00:00Z`);
}
export const somarDias = (d: Date, dias: number) => new Date(d.getTime() + dias * 86400000);
export const diasEntre = (de: Date, ate: Date) => Math.round((ate.getTime() - de.getTime()) / 86400000);
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const dataBR = (d: Date | null | undefined) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
export const dataHoraBR = (d: Date | null | undefined) => (d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
export const moeda = (v: number | string | { toString(): string } | null | undefined) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Vencimento da competência AAAA-MM no dia escolhido (meses curtos usam o último dia). */
export function vencimentoDe(competencia: string, dia: number) {
  const [a, m] = competencia.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return new Date(Date.UTC(a, m - 1, Math.min(dia, ultimo)));
}
export function proximaCompetencia(c: string) {
  const [a, m] = c.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}
export const competenciaDe = (d: Date) => iso(d).slice(0, 7);
