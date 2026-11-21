import { prisma } from "@/lib/db";
import { diaSP } from "@/lib/datas";
import type { LinhaAnalise } from "./conciliacao";
import type { TransporteWhatsapp } from "@/lib/whatsapp/mxchat";

/**
 * Aviso diário da conciliação pelo WhatsApp (MXChat): quantas linhas do extrato estão pendentes, quantas urgentes,
 * quantas sugestões prontas para confirmar e as mais urgentes. Vai uma vez por dia, a partir da hora escolhida, pelo
 * agendador (de hora em hora, das 8h às 20h). Fica em Configuracao "conciliacao-aviso".
 */
export type ConfigAviso = { ativo: boolean; numeros: string[]; hora: number; ultimoEnvio: string | null };
const PADRAO: ConfigAviso = { ativo: false, numeros: [], hora: 8, ultimoEnvio: null };
const CHAVE = "conciliacao-aviso";

export async function configAviso(): Promise<ConfigAviso> {
  const c = await prisma.configuracao.findUnique({ where: { chave: CHAVE } });
  return { ...PADRAO, ...((c?.valor ?? {}) as Partial<ConfigAviso>) };
}

async function gravar(valor: ConfigAviso) {
  await prisma.configuracao.upsert({ where: { chave: CHAVE }, create: { chave: CHAVE, valor }, update: { valor } });
}

export async function salvarConfigAviso(d: { ativo: boolean; numeros: string; hora: number }) {
  const { numeroWhatsapp } = await import("@/lib/whatsapp/mxchat");
  const brutos = d.numeros.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
  const numeros: string[] = [];
  for (const b of brutos) {
    const n = numeroWhatsapp(b);
    if (!n) throw new Error(`Número inválido: "${b}" (use DDD + número)`);
    if (!numeros.includes(n)) numeros.push(n);
  }
  if (d.ativo && !numeros.length) throw new Error("Informe ao menos um número de WhatsApp para receber o aviso");
  const hora = Math.min(20, Math.max(8, Math.round(d.hora || 8)));
  const atual = await configAviso();
  await gravar({ ...atual, ativo: d.ativo, numeros, hora });
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;

/** Texto do aviso. Null quando não há nada pendente (não manda mensagem à toa). */
export function montarAviso(linhas: LinhaAnalise[], hoje: Date, extra: { saldos?: { conta: string; banco: number; sistema: number }[]; link?: string } = {}): string | null {
  if (!linhas.length) return null;
  const soma = (ls: LinhaAnalise[]) => ls.reduce((s, l) => s + Math.abs(l.valor), 0);
  const urgentes = linhas.filter((l) => l.urgencia === "urgente");
  const sugestoes = linhas.filter((l) => l.acao !== "REVISAR");
  const altas = sugestoes.filter((l) => l.nivel === "alta");
  const vencidas = linhas.filter((l) => l.acao === "BAIXAR" && l.confianca >= 60 && l.prazo.startsWith("conta vencida"));
  const revisar = linhas.length - sugestoes.length;
  const h = hoje.toISOString().slice(0, 10);
  const partes = [
    `*Conciliação bancária - ${h.slice(8, 10)}/${h.slice(5, 7)}/${h.slice(0, 4)}*`,
    `Pendentes: ${linhas.length} (${brl(soma(linhas))})`,
    `🔴 Urgentes pelo prazo: ${urgentes.length}`,
    `✅ Sugestões prontas: ${sugestoes.length}${altas.length ? ` (${altas.length} com confiança alta)` : ""}`,
    `✋ A revisar sem sugestão: ${revisar}`,
  ];
  if (vencidas.length) partes.push(`⚠️ ${vencidas.length} conta${vencidas.length > 1 ? "s" : ""} já paga${vencidas.length > 1 ? "s" : ""} no banco aparece${vencidas.length > 1 ? "m" : ""} vencida${vencidas.length > 1 ? "s" : ""} no sistema`);
  const top = [...linhas].sort((a, b) => b.pontosUrgencia - a.pontosUrgencia || a.ordem.localeCompare(b.ordem)).filter((l) => l.urgencia !== "normal").slice(0, 5);
  if (top.length) {
    partes.push("", "*Mais urgentes:*");
    for (const l of top) partes.push(`• ${dataBr(l.data)} ${l.descricao.slice(0, 50)} ${brl(l.valor)} (${l.prazo})`);
  }
  const difs = (extra.saldos ?? []).filter((s) => Math.abs(s.banco - s.sistema) >= 0.01);
  if (difs.length) {
    partes.push("", "*Saldo:*");
    for (const s of difs) partes.push(`• ${s.conta}: banco ${brl(s.banco)} · sistema ${brl(s.sistema)} (diferença ${brl(s.banco - s.sistema)})`);
  }
  if (extra.link) partes.push("", extra.link);
  return partes.join("\n");
}

/** Hora (0-23) em Brasília. */
const horaSP = (d: Date) => Number(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false })) % 24;

/**
 * Manda o aviso se estiver ligado, já passou da hora e ainda não foi hoje (ou na hora, com `forcar`, pelo botão de
 * teste). Grava o dia do envio mesmo quando não há nada pendente, para não tentar de novo a cada hora.
 */
export async function enviarAvisoConciliacao(opts: { forcar?: boolean; agora?: Date; transporte?: TransporteWhatsapp; usuarioNome?: string | null } = {}) {
  const agora = opts.agora ?? new Date();
  const cfg = await configAviso();
  const hoje = diaSP(agora).toISOString().slice(0, 10);
  if (!opts.forcar) {
    if (!cfg.ativo) return { enviado: 0, motivo: "aviso desligado" };
    if (cfg.ultimoEnvio === hoje) return { enviado: 0, motivo: "já enviado hoje" };
    if (horaSP(agora) < cfg.hora) return { enviado: 0, motivo: `antes das ${cfg.hora}h` };
  }
  if (!cfg.numeros.length) throw new Error("Cadastre ao menos um número para o aviso");
  const { analisarExtrato } = await import("./conciliacao");
  const { saldosParaAviso } = await import("./saldos");
  const { enviarWhatsapp } = await import("@/lib/whatsapp/mxchat");
  const linhas = await analisarExtrato();
  const base = process.env.URL_PUBLICA?.trim().replace(/\/+$/, "");
  const texto = montarAviso(linhas, diaSP(agora), { saldos: await saldosParaAviso().catch(() => []), link: base ? `${base}/financeiro/conciliacao?ordem=urgencia` : undefined });
  if (!opts.forcar) await gravar({ ...cfg, ultimoEnvio: hoje });
  if (!texto) return { enviado: 0, motivo: "nada pendente" };
  let enviado = 0;
  const erros: string[] = [];
  for (const numero of cfg.numeros) {
    try {
      await enviarWhatsapp({ numero, texto, entidade: "CONCILIACAO", automatica: !opts.forcar, usuarioNome: opts.usuarioNome ?? null }, { transporte: opts.transporte });
      enviado++;
    } catch (e) { erros.push(e instanceof Error ? e.message : String(e)); }
  }
  return { enviado, erros, motivo: erros[0] };
}
