/** Data "civil" de São Paulo como Date à meia-noite UTC (para colunas @db.Date). */
export function diaSP(d: Date = new Date()): Date {
  const s = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // AAAA-MM-DD
  return new Date(`${s}T00:00:00Z`);
}

/** Converte "AAAA-MM-DD" (input type=date) em Date à meia-noite UTC. */
export function parseDia(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Data inválida");
  return new Date(`${s}T00:00:00Z`);
}

export const somarDias = (d: Date, dias: number) => new Date(d.getTime() + dias * 86400000);
