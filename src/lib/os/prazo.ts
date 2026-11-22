import { diaSP } from "@/lib/datas";

/**
 * Quanto a OS demorou em relação à previsão. Pura (sem banco), pode ser usada em componente de cliente.
 * Conta em dias civis de São Paulo. A previsão vinda do Gestão Click é só a data (meia-noite UTC); a do
 * formulário é um instante: as duas viram o dia civil antes de comparar.
 */
export type PrazoOs =
  | { base: "previsao"; dias: number; concluida: boolean } // dias > 0 = passou da previsão
  | { base: "entrada"; dias: number; concluida: boolean }; // sem previsão: dias desde a abertura

const DIA = 86400000;
const civil = (d: Date) => (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0 ? d : diaSP(d));
const entreDias = (de: Date, ate: Date) => Math.round((civil(ate).getTime() - civil(de).getTime()) / DIA);

export function prazoOs(o: { entrada: Date; previsao: Date | null; saida: Date | null }, agora: Date = new Date()): PrazoOs {
  const fim = o.saida ?? agora, concluida = !!o.saida;
  if (o.previsao) return { base: "previsao", dias: entreDias(o.previsao, fim), concluida };
  return { base: "entrada", dias: Math.max(entreDias(o.entrada, fim), 0), concluida };
}

const plural = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

/** Texto curto: "12 dias após a previsão", "no prazo", "concluída em 5 dias (sem previsão)". */
export function textoPrazo(p: PrazoOs): string {
  if (p.base === "previsao") {
    if (p.dias > 0) return `${plural(p.dias)} após a previsão`;
    return p.concluida ? "no prazo" : p.dias === 0 ? "vence hoje" : `faltam ${plural(-p.dias)}`;
  }
  return p.concluida ? `concluída em ${plural(p.dias)} (sem previsão)` : `aberta há ${plural(p.dias)} (sem previsão)`;
}

/** Fora do prazo: passou da previsão. */
export const atrasada = (p: PrazoOs) => p.base === "previsao" && p.dias > 0;

/** Data da previsão em dd/mm/aaaa, sem voltar um dia quando ela veio só como data (meia-noite UTC). */
export const dataPrevisao = (d: Date) => civil(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });
