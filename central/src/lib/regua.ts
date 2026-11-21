import { diasEntre } from "./datas";

/** Dias de atraso que mudam o que o cliente vê no sistema dele. */
export type Regua = { diasAviso: number; diasLeitura: number; diasBloqueio: number; diasAntecedencia: number };
export const REGUA_PADRAO: Regua = { diasAviso: 5, diasLeitura: 10, diasBloqueio: 30, diasAntecedencia: 10 };

export type SituacaoLicenca = "EM_DIA" | "AVISO" | "SO_LEITURA" | "BLOQUEADO";
export const ROTULO_LICENCA: Record<SituacaoLicenca, string> = {
  EM_DIA: "Em dia", AVISO: "Aviso de atraso", SO_LEITURA: "Só leitura", BLOQUEADO: "Bloqueado",
};

/**
 * Situação da licença pelo atraso da fatura em aberto mais antiga.
 * Liberação manual (promessa de pagamento) segura em no máximo "aviso" até a data combinada.
 * Cliente suspenso/cancelado fica bloqueado.
 */
export function situacaoLicenca(
  c: { situacao: string; liberadoAte: Date | null },
  abertas: { vencimento: Date }[],
  hoje: Date,
  r: Regua = REGUA_PADRAO,
): { situacao: SituacaoLicenca; diasAtraso: number } {
  const venc = abertas.map((f) => f.vencimento.getTime()).sort((a, b) => a - b)[0];
  const diasAtraso = venc !== undefined ? Math.max(0, diasEntre(new Date(venc), hoje)) : 0;
  if (c.situacao === "SUSPENSO" || c.situacao === "CANCELADO") return { situacao: "BLOQUEADO", diasAtraso };
  let s: SituacaoLicenca = "EM_DIA";
  if (diasAtraso >= r.diasBloqueio) s = "BLOQUEADO";
  else if (diasAtraso >= r.diasLeitura) s = "SO_LEITURA";
  else if (diasAtraso >= r.diasAviso) s = "AVISO";
  if (s !== "EM_DIA" && c.liberadoAte && c.liberadoAte >= hoje) s = "AVISO";
  return { situacao: s, diasAtraso };
}
