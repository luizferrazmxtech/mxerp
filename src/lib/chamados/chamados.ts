import type { PrioridadeChamado, Prisma, StatusChamado } from "@prisma/client";
import { prisma } from "@/lib/db";
import { proximoDoc } from "@/lib/sequencia";
import { cadaPalavra, contem, numeroPalavra } from "@/lib/busca/palavras";

/**
 * Atendimentos e chamados (helpdesk): o pedido do cliente (telefone, WhatsApp, e-mail…) vira um chamado numerado,
 * com responsável, prioridade, prazo e histórico. Pode virar uma OS (vinculada pelo número).
 */

type Usuario = { id: string; nome: string };
export class ChamadoError extends Error {}

export const ROTULO_STATUS: Record<StatusChamado, string> = {
  ABERTO: "Aberto", EM_ATENDIMENTO: "Em atendimento", AGUARDANDO_CLIENTE: "Aguardando cliente", RESOLVIDO: "Resolvido", FECHADO: "Fechado",
};
export const COR_STATUS: Record<StatusChamado, string> = {
  ABERTO: "border-sky-300 bg-sky-50 text-sky-700", EM_ATENDIMENTO: "border-amber-300 bg-amber-50 text-amber-800",
  AGUARDANDO_CLIENTE: "border-violet-300 bg-violet-50 text-violet-700", RESOLVIDO: "border-emerald-300 bg-emerald-50 text-emerald-700",
  FECHADO: "border-slate-300 bg-slate-50 text-slate-600",
};
export const ROTULO_PRIORIDADE: Record<PrioridadeChamado, string> = { BAIXA: "Baixa", NORMAL: "Normal", ALTA: "Alta", URGENTE: "Urgente" };
export const CANAIS = { TELEFONE: "Telefone", WHATSAPP: "WhatsApp", EMAIL: "E-mail", PRESENCIAL: "Presencial", SITE: "Site", OUTRO: "Outro" } as const;
/** Prazo padrão de solução por prioridade, em horas. */
export const PRAZO_HORAS: Record<PrioridadeChamado, number> = { URGENTE: 4, ALTA: 24, NORMAL: 72, BAIXA: 168 };
export const ABERTOS: StatusChamado[] = ["ABERTO", "EM_ATENDIMENTO", "AGUARDANDO_CLIENTE"];

const t = (s: string | null | undefined) => (s ?? "").trim() || null;

export type DadosChamado = {
  clienteId?: string | null; contato?: string | null; telefone?: string | null; assunto: string; descricao?: string | null;
  canal?: string; categoria?: string | null; prioridade?: PrioridadeChamado; responsavelId?: string | null; prazo?: Date | null;
};

export async function abrirChamado(d: DadosChamado, u: Usuario, agora = new Date()) {
  const assunto = t(d.assunto);
  if (!assunto) throw new ChamadoError("Informe o assunto do chamado");
  if (!d.clienteId && !t(d.contato)) throw new ChamadoError("Escolha o cliente ou informe o nome de quem pediu");
  const prioridade = d.prioridade ?? "NORMAL";
  const canal = d.canal && d.canal in CANAIS ? d.canal : "TELEFONE";
  return prisma.$transaction(async (tx) => {
    const numero = await proximoDoc(tx, "CHAMADO");
    const c = await tx.chamado.create({
      data: {
        numero, assunto: assunto.slice(0, 200), descricao: t(d.descricao), clienteId: d.clienteId || null, contato: t(d.contato), telefone: t(d.telefone),
        canal, categoria: t(d.categoria), prioridade, responsavelId: d.responsavelId || null, abertoPorId: u.id,
        prazo: d.prazo ?? new Date(agora.getTime() + PRAZO_HORAS[prioridade] * 3600_000),
        status: d.responsavelId ? "EM_ATENDIMENTO" : "ABERTO",
      },
    });
    await tx.chamadoInteracao.create({ data: { chamadoId: c.id, usuarioId: u.id, usuarioNome: u.nome, tipo: "ABERTURA", texto: `Chamado aberto (${CANAIS[canal as keyof typeof CANAIS]})` } });
    return c;
  });
}

/** Muda status, responsável, prioridade, prazo ou dados do chamado; cada mudança relevante entra no histórico. */
export async function atualizarChamado(
  id: string,
  d: Partial<DadosChamado> & { status?: StatusChamado; solucao?: string | null },
  u: Usuario, agora = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const c = await tx.chamado.findUniqueOrThrow({ where: { id }, include: { responsavel: { select: { nome: true } } } });
    const data: Prisma.ChamadoUncheckedUpdateInput = {};
    const hist: { tipo: string; texto: string }[] = [];
    if (d.assunto !== undefined) { const a = t(d.assunto); if (!a) throw new ChamadoError("Informe o assunto do chamado"); data.assunto = a.slice(0, 200); }
    for (const k of ["descricao", "contato", "telefone", "categoria"] as const) if (d[k] !== undefined) data[k] = t(d[k]);
    if (d.clienteId !== undefined) data.clienteId = d.clienteId || null;
    if (d.canal && d.canal in CANAIS) data.canal = d.canal;
    if (d.prazo !== undefined) data.prazo = d.prazo;
    if (d.prioridade && d.prioridade !== c.prioridade) {
      data.prioridade = d.prioridade;
      hist.push({ tipo: "STATUS", texto: `Prioridade: ${ROTULO_PRIORIDADE[c.prioridade]} → ${ROTULO_PRIORIDADE[d.prioridade]}` });
    }
    if (d.responsavelId !== undefined && (d.responsavelId || null) !== c.responsavelId) {
      const novo = d.responsavelId ? await tx.usuario.findUniqueOrThrow({ where: { id: d.responsavelId }, select: { nome: true } }) : null;
      data.responsavelId = d.responsavelId || null;
      hist.push({ tipo: "RESPONSAVEL", texto: `Responsável: ${c.responsavel?.nome ?? "ninguém"} → ${novo?.nome ?? "ninguém"}` });
      if (novo && c.status === "ABERTO" && !d.status) { data.status = "EM_ATENDIMENTO"; }
    }
    if (d.solucao !== undefined) data.solucao = t(d.solucao);
    if (d.status && d.status !== c.status) {
      const solucao = d.solucao !== undefined ? t(d.solucao) : c.solucao;
      if ((d.status === "RESOLVIDO" || d.status === "FECHADO") && !solucao) throw new ChamadoError("Descreva a solução antes de resolver o chamado");
      data.status = d.status;
      if (d.status === "RESOLVIDO" || d.status === "FECHADO") data.resolvidoEm = c.resolvidoEm ?? agora;
      else data.resolvidoEm = null; // reaberto
      hist.push({ tipo: "STATUS", texto: `${ROTULO_STATUS[c.status]} → ${ROTULO_STATUS[d.status]}${d.status === "RESOLVIDO" && solucao ? `: ${solucao}` : ""}` });
    }
    const r = await tx.chamado.update({ where: { id }, data });
    for (const h of hist) await tx.chamadoInteracao.create({ data: { chamadoId: id, usuarioId: u.id, usuarioNome: u.nome, ...h } });
    return r;
  });
}

/** Comentário no histórico. A primeira resposta de quem atende marca o tempo de resposta e põe o chamado em atendimento. */
export async function comentarChamado(id: string, texto: string, u: Usuario, opts: { interno?: boolean } = {}, agora = new Date()) {
  const tx = t(texto);
  if (!tx) throw new ChamadoError("Escreva o comentário");
  const c = await prisma.chamado.findUniqueOrThrow({ where: { id } });
  await prisma.chamadoInteracao.create({ data: { chamadoId: id, usuarioId: u.id, usuarioNome: u.nome, tipo: "COMENTARIO", texto: tx.slice(0, 5000), interno: !!opts.interno } });
  const data: Prisma.ChamadoUpdateInput = {};
  if (!opts.interno && !c.primeiraRespostaEm) data.primeiraRespostaEm = agora;
  if (!opts.interno && c.status === "ABERTO") data.status = "EM_ATENDIMENTO";
  if (!c.responsavelId) data.responsavel = { connect: { id: u.id } }; // quem responde assume
  return Object.keys(data).length ? prisma.chamado.update({ where: { id }, data }) : c;
}

/** Liga o chamado a uma OS (pelo número). */
export async function vincularOs(id: string, numeroOs: number, u: Usuario) {
  const os = await prisma.ordemServico.findFirst({ where: { numero: numeroOs }, select: { id: true, numero: true } });
  if (!os) throw new ChamadoError(`OS nº ${numeroOs} não encontrada`);
  await prisma.chamado.update({ where: { id }, data: { osId: os.id } });
  await prisma.chamadoInteracao.create({ data: { chamadoId: id, usuarioId: u.id, usuarioNome: u.nome, tipo: "STATUS", texto: `Vinculado à OS nº ${os.numero}` } });
  return os;
}

export type FiltroChamados = { status?: string; responsavelId?: string; clienteId?: string; q?: string; prioridade?: string };

export function filtroChamados(f: FiltroChamados, usuarioId?: string): Prisma.ChamadoWhereInput {
  const and: Prisma.ChamadoWhereInput[] = [];
  if (f.status === "abertos" || !f.status) and.push({ status: { in: ABERTOS } });
  else if (f.status === "atrasados") and.push({ status: { in: ABERTOS }, prazo: { lt: new Date() } });
  else if (f.status in ROTULO_STATUS) and.push({ status: f.status as StatusChamado });
  if (f.responsavelId === "meus" && usuarioId) and.push({ responsavelId: usuarioId });
  else if (f.responsavelId === "sem") and.push({ responsavelId: null });
  else if (f.responsavelId) and.push({ responsavelId: f.responsavelId });
  if (f.clienteId) and.push({ clienteId: f.clienteId });
  if (f.prioridade && f.prioridade in ROTULO_PRIORIDADE) and.push({ prioridade: f.prioridade as PrioridadeChamado });
  const q = t(f.q);
  and.push(...cadaPalavra(q, (p): Prisma.ChamadoWhereInput[] => {
    const n = numeroPalavra(p);
    return [...(n ? [{ numero: n }] : []), { assunto: contem(p) }, { descricao: contem(p) }, { contato: contem(p) },
      { cliente: { nome: contem(p) } }, { cliente: { fantasia: contem(p) } }];
  }));
  return and.length ? { AND: and } : {};
}

/** Números do painel: abertos, sem responsável, atrasados, meus, e tempos médios dos resolvidos nos últimos 30 dias. */
export async function resumoChamados(usuarioId: string, agora = new Date()) {
  const abertos = { status: { in: ABERTOS } };
  const [nAbertos, semResp, atrasados, meus, urgentes, resolvidos] = await Promise.all([
    prisma.chamado.count({ where: abertos }),
    prisma.chamado.count({ where: { ...abertos, responsavelId: null } }),
    prisma.chamado.count({ where: { ...abertos, prazo: { lt: agora } } }),
    prisma.chamado.count({ where: { ...abertos, responsavelId: usuarioId } }),
    prisma.chamado.count({ where: { ...abertos, prioridade: "URGENTE" } }),
    prisma.chamado.findMany({ where: { resolvidoEm: { gte: new Date(agora.getTime() - 30 * 86400_000) } }, select: { createdAt: true, resolvidoEm: true, primeiraRespostaEm: true, prazo: true } }),
  ]);
  const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const horas = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3600_000;
  return {
    abertos: nAbertos, semResponsavel: semResp, atrasados, meus, urgentes, resolvidos30: resolvidos.length,
    horasResolucao: media(resolvidos.map((r) => horas(r.createdAt, r.resolvidoEm!))),
    horasPrimeiraResposta: media(resolvidos.filter((r) => r.primeiraRespostaEm).map((r) => horas(r.createdAt, r.primeiraRespostaEm!))),
    noPrazo: resolvidos.length ? resolvidos.filter((r) => !r.prazo || r.resolvidoEm! <= r.prazo).length / resolvidos.length : null,
  };
}

/** "3 h", "2 d 4 h". */
export function horasTexto(h: number | null) {
  if (h == null) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 24) return `${Math.round(h)} h`;
  const d = Math.floor(h / 24), r = Math.round(h % 24);
  return r ? `${d} d ${r} h` : `${d} d`;
}
