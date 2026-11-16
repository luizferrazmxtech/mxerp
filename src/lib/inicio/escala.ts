/** Contas dos gráficos da tela inicial (sem banco, testáveis). */

/** Topo "redondo" do eixo e as marcas (ex.: 172.000 → 200k com marcas de 50k). */
export function escalaEixo(min: number, max: number, marcas = 4) {
  const amplitude = Math.max(max, 0) - Math.min(min, 0) || 1;
  const bruto = amplitude / marcas;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto) ?? bruto;
  const baixo = Math.min(0, Math.floor(min / passo) * passo);
  const alto = Math.max(passo, Math.ceil(max / passo) * passo);
  const valores: number[] = [];
  for (let v = baixo; v <= alto + passo / 2; v += passo) valores.push(Math.round(v * 100) / 100);
  return { baixo, alto, valores };
}

/** 150000 → "150k"; 1200000 → "1,2mi"; 12 → "12". */
export function abreviar(v: number) {
  if (Math.abs(v) < 0.005) return "0";
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}mi`;
  if (a >= 1_000) return `${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** Percentual seguro (0 quando não há base), limitado a 0–100 para o anel. */
export const percentual = (parte: number, todo: number) => (todo > 0 ? Math.min(100, Math.max(0, (parte / todo) * 100)) : 0);

/** Melhor e pior mês de uma série (pelo valor). */
export function melhorPior<T extends { rotulo: string }>(serie: T[], valor: (x: T) => number) {
  if (!serie.length) return null;
  const ord = [...serie].sort((a, b) => valor(b) - valor(a));
  return { melhor: ord[0], pior: ord[ord.length - 1] };
}

/** Saudação pela hora de São Paulo. */
export function saudacao(agora = new Date()) {
  const h = Number(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}
