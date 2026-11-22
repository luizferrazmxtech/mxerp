import { prisma } from "@/lib/db";
import { diaSP, somarDias } from "@/lib/datas";
import type { TransporteWhatsapp } from "@/lib/whatsapp/mxchat";
import { painelRelatorios, variacao } from "./painel";
import { inadimplencia, saldoProjetado } from "./financeiro";

/**
 * Resumo semanal no WhatsApp (MXChat): faturamento e lucro da semana passada (segunda a domingo) comparados com a
 * anterior, maior cliente, contas a receber vencidas e aviso se o saldo previsto fica negativo nos próximos 30 dias.
 * Vai uma vez por semana, no dia e a partir da hora escolhidos, pelo agendador (de hora em hora).
 * Fica em Configuracao "relatorios-resumo".
 */
export type ConfigResumo = { ativo: boolean; numeros: string[]; diaSemana: number; hora: number; ultimoEnvio: string | null };
const PADRAO: ConfigResumo = { ativo: false, numeros: [], diaSemana: 1, hora: 8, ultimoEnvio: null };
const CHAVE = "relatorios-resumo";
export const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export async function configResumo(): Promise<ConfigResumo> {
  const c = await prisma.configuracao.findUnique({ where: { chave: CHAVE } });
  return { ...PADRAO, ...((c?.valor ?? {}) as Partial<ConfigResumo>) };
}

async function gravar(valor: ConfigResumo) {
  await prisma.configuracao.upsert({ where: { chave: CHAVE }, create: { chave: CHAVE, valor }, update: { valor } });
}

export async function salvarConfigResumo(d: { ativo: boolean; numeros: string; diaSemana: number; hora: number }) {
  const { numeroWhatsapp } = await import("@/lib/whatsapp/mxchat");
  const numeros: string[] = [];
  for (const b of d.numeros.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean)) {
    const n = numeroWhatsapp(b);
    if (!n) throw new Error(`Número inválido: "${b}" (use DDD + número)`);
    if (!numeros.includes(n)) numeros.push(n);
  }
  if (d.ativo && !numeros.length) throw new Error("Informe ao menos um número de WhatsApp para receber o resumo");
  const atual = await configResumo();
  await gravar({ ...atual, ativo: d.ativo, numeros, diaSemana: Math.min(6, Math.max(0, Math.round(d.diaSemana))), hora: Math.min(20, Math.max(6, Math.round(d.hora || 8))) });
}

/** Semana passada (segunda a domingo) em relação a `hoje`. */
export function semanaPassada(hoje: Date) {
  const dow = hoje.getUTCDay(); // 0 = domingo
  const segundaDestaSemana = somarDias(hoje, -((dow + 6) % 7));
  return { de: somarDias(segundaDestaSemana, -7), ate: somarDias(segundaDestaSemana, -1) };
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dm = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const seta = (v: number | null) => (v === null ? "" : ` (${v >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(v * 100))}% sobre a semana anterior)`);

/** Texto do resumo da semana passada. */
export async function montarResumo(hoje = diaSP(), link?: string) {
  const sem = semanaPassada(hoje);
  const [p, inad, saldo] = await Promise.all([painelRelatorios(sem, {}, hoje), inadimplencia(hoje), saldoProjetado(30, hoje)]);
  const a = p.atual, b = p.anterior;
  const partes = [
    `*Resumo da semana ${dm(sem.de)} a ${dm(sem.ate)}*`,
    `💰 Faturamento: ${brl(a.receita)}${seta(variacao(a.receita, b.receita))}`,
    `📈 Lucro bruto: ${brl(a.lucro)} · margem ${Math.round(a.margem * 1000) / 10}%`,
    `🧾 ${a.documentos} venda(s)/OS · ticket médio ${brl(a.ticket)}`,
  ];
  if (p.clientes.top[0]) partes.push(`🏆 Maior cliente: ${p.clientes.top[0].rotulo} (${brl(p.clientes.top[0].receita)})`);
  if (p.produtos.top[0]) partes.push(`📦 Produto mais vendido: ${p.produtos.top[0].rotulo} (${brl(p.produtos.top[0].receita)})`);
  partes.push("", `💵 Saldo hoje: ${brl(saldo.hoje)}`);
  if (inad.total) partes.push(`⚠️ A receber vencido: ${brl(inad.total)} em ${inad.contas} conta(s)${inad.devedores[0] ? `, o maior com ${inad.devedores[0].nome} (${brl(inad.devedores[0].valor)})` : ""}`);
  if (saldo.primeiroNegativo) partes.push(`🔴 O saldo previsto fica negativo em ${dm(saldo.primeiroNegativo.dia)} (${brl(saldo.primeiroNegativo.saldo)})`);
  if (link) partes.push("", link);
  return partes.join("\n");
}

/** Hora (0-23) em Brasília. */
const horaSP = (d: Date) => Number(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false })) % 24;

/** Manda o resumo se estiver ligado, for o dia escolhido, já passou da hora e ainda não foi hoje (ou na hora, com `forcar`). */
export async function enviarResumoSemanal(opts: { forcar?: boolean; agora?: Date; transporte?: TransporteWhatsapp; usuarioNome?: string | null } = {}) {
  const agora = opts.agora ?? new Date();
  const cfg = await configResumo();
  const hoje = diaSP(agora);
  const chave = hoje.toISOString().slice(0, 10);
  if (!opts.forcar) {
    if (!cfg.ativo) return { enviado: 0, motivo: "resumo desligado" };
    if (hoje.getUTCDay() !== cfg.diaSemana) return { enviado: 0, motivo: `só às ${DIAS_SEMANA[cfg.diaSemana]}s` };
    if (cfg.ultimoEnvio === chave) return { enviado: 0, motivo: "já enviado hoje" };
    if (horaSP(agora) < cfg.hora) return { enviado: 0, motivo: `antes das ${cfg.hora}h` };
  }
  if (!cfg.numeros.length) throw new Error("Cadastre ao menos um número para o resumo");
  const { enviarWhatsapp } = await import("@/lib/whatsapp/mxchat");
  const base = process.env.URL_PUBLICA?.trim().replace(/\/+$/, "");
  const texto = await montarResumo(hoje, base ? `${base}/relatorios` : undefined);
  if (!opts.forcar) await gravar({ ...cfg, ultimoEnvio: chave });
  let enviado = 0;
  const erros: string[] = [];
  for (const numero of cfg.numeros) {
    try {
      await enviarWhatsapp({ numero, texto, entidade: "RELATORIO", automatica: !opts.forcar, usuarioNome: opts.usuarioNome ?? null }, { transporte: opts.transporte });
      enviado++;
    } catch (e) { erros.push(e instanceof Error ? e.message : String(e)); }
  }
  return { enviado, erros, motivo: erros[0], texto };
}
