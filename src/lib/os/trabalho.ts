import { prisma, type Tx } from "@/lib/db";
import { OsError } from "@/lib/os/ordens";
import { podeMexerNaOs, type UsuarioTecnico } from "@/lib/os/tecnico";

/**
 * Tempo de mão de obra da OS: o técnico aperta Iniciar, Pausar (com motivo), Retomar e Finalizar.
 * Cada trecho trabalhado é uma linha de OsTrabalho; o total é a soma dos trechos (o aberto conta até agora).
 * Vale por OS (a equipe trabalha junta), com quem iniciou e quem parou cada trecho.
 */

export type EstadoTrabalho = "NAO_INICIADO" | "TRABALHANDO" | "PAUSADO" | "FINALIZADO";
export type ResumoTrabalho = {
  estado: EstadoTrabalho;
  /** ms trabalhados nos trechos já fechados */
  fechadoMs: number;
  /** início do trecho aberto (ISO), para o relógio correr na tela */
  abertoDesde: string | null;
  trechos: { inicio: string; fim: string | null; motivo: string | null; iniciadoPor: string; encerradoPor: string | null }[];
};

export const MOTIVOS_PAUSA = ["Almoço / intervalo", "Buscar material", "Aguardando cliente", "Deslocamento", "Outro"];

export async function resumoTrabalho(osId: string, db: Tx | typeof prisma = prisma): Promise<ResumoTrabalho> {
  const [os, trechos] = await Promise.all([
    db.ordemServico.findUnique({ where: { id: osId }, select: { trabalhoFinalizadoEm: true } }),
    db.osTrabalho.findMany({ where: { osId }, orderBy: { inicio: "asc" } }),
  ]);
  const aberto = trechos.find((t) => !t.fim);
  const fechadoMs = trechos.reduce((s, t) => s + (t.fim ? t.fim.getTime() - t.inicio.getTime() : 0), 0);
  const estado: EstadoTrabalho = aberto ? "TRABALHANDO" : os?.trabalhoFinalizadoEm ? "FINALIZADO" : trechos.length ? "PAUSADO" : "NAO_INICIADO";
  return {
    estado, fechadoMs, abertoDesde: aberto ? aberto.inicio.toISOString() : null,
    trechos: trechos.map((t) => ({ inicio: t.inicio.toISOString(), fim: t.fim?.toISOString() ?? null, motivo: t.motivo, iniciadoPor: t.iniciadoPor, encerradoPor: t.encerradoPor })),
  };
}

/** "2h 05min" */
export function duracao(ms: number) {
  const min = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}min` : `${m}min`;
}

async function travar(tx: Tx, u: UsuarioTecnico, osId: string) {
  const [o] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "OrdemServico" WHERE id = ${osId} FOR NO KEY UPDATE`;
  if (!o) throw new OsError("OS não encontrada");
  if (!(await podeMexerNaOs(tx, u, osId))) throw new OsError("Você não é técnico desta OS nem da equipe dela");
  return tx.osTrabalho.findFirst({ where: { osId, fim: null } });
}

const historico = (tx: Tx, osId: string, u: UsuarioTecnico, descricao: string) =>
  tx.osHistorico.create({ data: { osId, descricao, usuarioNome: u.nome, usuarioId: u.id } });

/** Iniciar ou retomar: abre um trecho. Retomar depois de finalizado reabre o tempo. */
export function iniciarTrabalho(u: UsuarioTecnico, osId: string, agora = new Date()) {
  return prisma.$transaction(async (tx) => {
    if (await travar(tx, u, osId)) throw new OsError("O trabalho já está em andamento");
    const antes = await tx.osTrabalho.count({ where: { osId } });
    await tx.osTrabalho.create({ data: { osId, inicio: agora, iniciadoPor: u.nome, iniciadoPorId: u.id } });
    await tx.ordemServico.update({ where: { id: osId }, data: { trabalhoFinalizadoEm: null } });
    await historico(tx, osId, u, antes ? "Trabalho retomado" : "Trabalho iniciado");
    return { primeiro: !antes };
  });
}

/** Pausar ("Almoço", "Buscar material"…) ou finalizar: fecha o trecho aberto. */
export function pararTrabalho(u: UsuarioTecnico, osId: string, opts: { finalizar?: boolean; motivo?: string } = {}, agora = new Date()) {
  return prisma.$transaction(async (tx) => {
    const aberto = await travar(tx, u, osId);
    if (!aberto && !opts.finalizar) throw new OsError("O trabalho não está em andamento");
    if (!aberto && !(await tx.osTrabalho.count({ where: { osId } }))) throw new OsError("Inicie o trabalho antes de finalizar");
    const motivo = opts.finalizar ? "Finalizado" : (opts.motivo || "Pausa").trim().slice(0, 120);
    if (aberto) await tx.osTrabalho.update({ where: { id: aberto.id }, data: { fim: agora < aberto.inicio ? aberto.inicio : agora, motivo, encerradoPor: u.nome } });
    if (opts.finalizar) await tx.ordemServico.update({ where: { id: osId }, data: { trabalhoFinalizadoEm: agora } });
    const r = await resumoTrabalho(osId, tx);
    await historico(tx, osId, u, opts.finalizar ? `Trabalho finalizado: ${duracao(r.fechadoMs)} de mão de obra` : `Trabalho pausado (${motivo})`);
    return r;
  });
}
