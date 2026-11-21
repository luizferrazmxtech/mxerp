import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { REGUA_PADRAO, type Regua } from "./regua";

/** Dados gerais da Central. */
export type Geral = {
  urlPublica: string; // https://central.mxtech.inf.br (links do boleto e webhook)
  nomeEmpresa: string; // aparece nos e-mails
  multaPct: number;
  jurosMesPct: number;
};
export const GERAL_PADRAO: Geral = { urlPublica: "", nomeEmpresa: "MXTECH", multaPct: 2, jurosMesPct: 1 };

/** Banco Inter da MXTECH (o que recebe as mensalidades). Segredos cifrados com a CHAVE_SEGREDOS da Central. */
export type InterSalvo = {
  clientId: string; clientSecretCifrado: string; certificado: string; chaveCifrada: string;
  contaCorrente: string; ambiente: "producao" | "sandbox"; webhookToken?: string; webhookMsg?: string;
  ultimaSinc?: string; ultimaSincMsg?: string;
};

/** E-mail que manda as faturas. Senha cifrada. */
export type Smtp = { host: string; porta: number; seguro: boolean; usuario: string; senhaCifrada: string; remetente: string };

type Mapa = { geral: Geral; regua: Regua; inter: InterSalvo | null; smtp: Smtp | null };
const PADRAO: Mapa = { geral: GERAL_PADRAO, regua: REGUA_PADRAO, inter: null, smtp: null };

export async function ler<K extends keyof Mapa>(chave: K): Promise<Mapa[K]> {
  const r = await prisma.configuracao.findUnique({ where: { chave } });
  if (!r) return PADRAO[chave];
  const v = r.valor as unknown as Mapa[K];
  return v && typeof v === "object" && PADRAO[chave] ? ({ ...PADRAO[chave], ...v } as Mapa[K]) : v;
}

export async function salvar<K extends keyof Mapa>(chave: K, valor: Mapa[K]) {
  const v = valor as unknown as Prisma.InputJsonValue;
  await prisma.configuracao.upsert({ where: { chave }, create: { chave, valor: v }, update: { valor: v } });
}
