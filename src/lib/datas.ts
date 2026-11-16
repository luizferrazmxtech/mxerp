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

/** Períodos do seletor das listas do Gestão Click (para colunas @db.Date). */
export const PERIODOS = [
  { chave: "hoje", rotulo: "Hoje" }, { chave: "semana", rotulo: "Esta semana" }, { chave: "mes-passado", rotulo: "Mês passado" },
  { chave: "mes", rotulo: "Este mês" }, { chave: "proximo-mes", rotulo: "Próximo mês" }, { chave: "todos", rotulo: "Todo o período" },
] as const;

/** Intervalo [de, ate] (inclusive, datas à meia-noite UTC) do período escolhido; null = todo o período. */
export function periodoDia(p?: string, de?: string, ate?: string): { de: Date; ate: Date; rotulo: string } | null {
  const hoje = diaSP();
  const fimMes = (a: number, m: number) => new Date(Date.UTC(a, m + 1, 0));
  const a = hoje.getUTCFullYear(), m = hoje.getUTCMonth();
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  if (p === "todos") return null;
  if (p === "periodo" && de && /^\d{4}-\d{2}-\d{2}$/.test(de)) {
    const f = ate && /^\d{4}-\d{2}-\d{2}$/.test(ate) ? parseDia(ate) : parseDia(de);
    const i = parseDia(de);
    return { de: i, ate: f, rotulo: `${fmt(i)} a ${fmt(f)}` };
  }
  if (p === "hoje") return { de: hoje, ate: hoje, rotulo: "Hoje" };
  if (p === "semana") {
    const ini = somarDias(hoje, -hoje.getUTCDay());
    return { de: ini, ate: somarDias(ini, 6), rotulo: "Esta semana" };
  }
  if (p === "mes-passado") { const i = new Date(Date.UTC(a, m - 1, 1)); return { de: i, ate: fimMes(a, m - 1), rotulo: `${MESES[i.getUTCMonth()]} de ${i.getUTCFullYear()}` }; }
  if (p === "proximo-mes") { const i = new Date(Date.UTC(a, m + 1, 1)); return { de: i, ate: fimMes(a, m + 1), rotulo: `${MESES[i.getUTCMonth()]} de ${i.getUTCFullYear()}` }; }
  if (p && /^\d{4}-\d{2}$/.test(p)) { const [y, mm] = p.split("-").map(Number); return { de: new Date(Date.UTC(y, mm - 1, 1)), ate: fimMes(y, mm - 1), rotulo: `${MESES[mm - 1]} de ${y}` }; }
  return { de: new Date(Date.UTC(a, m, 1)), ate: fimMes(a, m), rotulo: `${MESES[m]} de ${a}` };
}
