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

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** Mês "AAAA-MM" no fuso de São Paulo (UTC-3), com início e fim como instantes, para filtrar timestamps. */
export function mesSP(chave?: string | null) {
  const atual = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
  const c = chave && /^\d{4}-\d{2}$/.test(chave) ? chave : atual;
  const [a, m] = c.split("-").map(Number);
  const prox = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
  return {
    chave: c,
    rotulo: `${MESES[m - 1]} de ${a}`,
    inicio: new Date(`${c}-01T00:00:00-03:00`),
    fim: new Date(`${prox}-01T00:00:00-03:00`),
  };
}

/** Os últimos `n` meses (o atual primeiro), para o seletor de mês das listas. */
export function mesesRecentes(n = 12) {
  const out: ReturnType<typeof mesSP>[] = [];
  let c = mesSP().chave;
  for (let i = 0; i < n; i++) {
    out.push(mesSP(c));
    const [a, m] = c.split("-").map(Number);
    c = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
  }
  return out;
}

export const rotuloMesCurto = (c: string) => { const [a, m] = c.split("-").map(Number); return `${MESES[m - 1].slice(0, 3)}/${String(a).slice(2)}`; };
