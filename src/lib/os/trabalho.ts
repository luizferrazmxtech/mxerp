import { prisma, type Tx } from "@/lib/db";
import { OsError } from "@/lib/os/ordens";
import { dataSP, horaSP } from "@/lib/ui/format";
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
  trechos: { id: string; inicio: string; fim: string | null; motivo: string | null; iniciadoPor: string; encerradoPor: string | null }[];
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
    trechos: trechos.map((t) => ({ id: t.id, inicio: t.inicio.toISOString(), fim: t.fim?.toISOString() ?? null, motivo: t.motivo, iniciadoPor: t.iniciadoPor, encerradoPor: t.encerradoPor })),
  };
}

/** "2h 05min"; um trecho de segundos aparece como "menos de 1min" (e não "0min"). */
export function duracao(ms: number) {
  if (ms > 0 && ms < 30000) return "menos de 1min";
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
    const os = await tx.ordemServico.findUniqueOrThrow({ where: { id: osId }, select: { tecnicoId: true, tecnicoIds: true } });
    await tx.osTrabalho.create({ data: { osId, inicio: agora, iniciadoPor: u.nome, iniciadoPorId: u.id } });
    // OS sem técnico: quem começa a trabalhar passa a ser o técnico dela
    const semTecnico = !os.tecnicoId && !os.tecnicoIds.length;
    await tx.ordemServico.update({ where: { id: osId }, data: { trabalhoFinalizadoEm: null, ...(semTecnico ? { tecnicoId: u.id, tecnicoIds: [u.id] } : {}) } });
    await historico(tx, osId, u, antes ? "Trabalho retomado" : "Trabalho iniciado");
    if (semTecnico) await historico(tx, osId, u, `Técnico definido: ${u.nome} (iniciou o trabalho)`);
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
    const fim = agora < (aberto?.inicio ?? agora) ? aberto!.inicio : agora;
    const trecho = aberto ? ` · trecho ${horaSP(aberto.inicio)}–${horaSP(fim)} (${duracao(fim.getTime() - aberto.inicio.getTime())})` : "";
    await historico(tx, osId, u, opts.finalizar ? `Trabalho finalizado: ${duracao(r.fechadoMs)} de mão de obra${trecho}` : `Trabalho pausado (${motivo})${trecho} · total ${duracao(r.fechadoMs)}`);
    return r;
  });
}

// ───────────── correção do tempo (administrador) ─────────────

export type TrechoCorrigido = { id?: string | null; inicio: Date; fim: Date | null; motivo?: string | null };

const trechoTxt = (t: { inicio: Date; fim: Date | null }) =>
  `${dataSP(t.inicio)} ${horaSP(t.inicio)}–${t.fim ? `${dataSP(t.fim) === dataSP(t.inicio) ? "" : `${dataSP(t.fim)} `}${horaSP(t.fim)}` : "agora"}`
  + (t.fim ? ` (${duracao(t.fim.getTime() - t.inicio.getTime())})` : "");

/**
 * O administrador corrige o tempo lançado pelo técnico: altera início/fim, inclui e exclui trechos (a lista enviada
 * substitui a atual). Grava no histórico da OS o antes → depois de cada trecho e o total; a auditoria registra cada
 * trecho alterado. O total da OS (tela, impressão, área do cliente) é sempre a soma dos trechos, então se recalcula sozinho.
 */
export function corrigirTrabalho(u: { id: string; nome: string }, osId: string, novos: TrechoCorrigido[], observacao = "", agora = new Date()) {
  return prisma.$transaction(async (tx) => {
    const [o] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "OrdemServico" WHERE id = ${osId} FOR NO KEY UPDATE`;
    if (!o) throw new OsError("OS não encontrada");
    const atuais = await tx.osTrabalho.findMany({ where: { osId }, orderBy: { inicio: "asc" } });
    const porId = new Map(atuais.map((t) => [t.id, t]));
    const limite = new Date(agora.getTime() + 60000);
    for (const t of novos) {
      if (isNaN(t.inicio.getTime()) || (t.fim && isNaN(t.fim.getTime()))) throw new OsError("Data ou hora inválida em um dos trechos");
      if (t.id && !porId.has(t.id)) throw new OsError("Um dos trechos não é desta OS (recarregue a página)");
      if (!t.fim && !(t.id && !porId.get(t.id)!.fim)) throw new OsError("Informe o fim de todos os trechos (só o trecho em andamento pode ficar sem fim)");
      if (t.fim && t.fim <= t.inicio) throw new OsError(`O fim tem que ser depois do início (trecho que começa em ${dataSP(t.inicio)} ${horaSP(t.inicio)})`);
      if (t.inicio > limite || (t.fim && t.fim > limite)) throw new OsError("Um trecho não pode terminar no futuro");
    }
    const ordem = [...novos].sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
    for (let i = 1; i < ordem.length; i++) {
      const ant = ordem[i - 1];
      if (!ant.fim || ant.fim > ordem[i].inicio) throw new OsError(`Os trechos ${trechoTxt(ant)} e ${trechoTxt(ordem[i])} se sobrepõem`);
    }

    const linhas: string[] = [];
    const manter = new Set(novos.map((t) => t.id).filter(Boolean) as string[]);
    for (const t of atuais) if (!manter.has(t.id)) {
      await tx.osTrabalho.delete({ where: { id: t.id } });
      linhas.push(`excluído ${trechoTxt(t)}`);
    }
    for (const t of novos) {
      const motivo = (t.motivo ?? "").trim().slice(0, 120) || null;
      const velho = t.id ? porId.get(t.id) : null;
      if (velho) {
        const mudouHora = velho.inicio.getTime() !== t.inicio.getTime() || (velho.fim?.getTime() ?? null) !== (t.fim?.getTime() ?? null);
        if (!mudouHora && (velho.motivo ?? null) === motivo) continue;
        await tx.osTrabalho.update({ where: { id: velho.id }, data: { inicio: t.inicio, fim: t.fim, motivo, ...(t.fim && !velho.fim ? { encerradoPor: u.nome } : {}) } });
        linhas.push(mudouHora ? `${trechoTxt(velho)} → ${trechoTxt(t)}` : `${trechoTxt(t)}: motivo ${velho.motivo ?? "—"} → ${motivo ?? "—"}`);
      } else {
        await tx.osTrabalho.create({ data: { osId, inicio: t.inicio, fim: t.fim, motivo: motivo ?? "Incluído na correção", iniciadoPor: u.nome, iniciadoPorId: u.id, encerradoPor: u.nome } });
        linhas.push(`incluído ${trechoTxt(t)}`);
      }
    }
    if (!linhas.length) throw new OsError("Nada foi alterado");
    const totalAntes = atuais.reduce((s, t) => s + ((t.fim ?? agora).getTime() - t.inicio.getTime()), 0);
    const totalDepois = novos.reduce((s, t) => s + ((t.fim ?? agora).getTime() - t.inicio.getTime()), 0);
    // sem nenhum trecho, a OS volta a "não iniciado"
    if (!novos.length) await tx.ordemServico.update({ where: { id: osId }, data: { trabalhoFinalizadoEm: null } });
    const obs = observacao.trim().slice(0, 300);
    await tx.osHistorico.create({ data: {
      osId, usuarioNome: u.nome, usuarioId: u.id,
      descricao: `Mão de obra corrigida: ${linhas.join("; ")} · total ${duracao(totalAntes)} → ${duracao(totalDepois)}${obs ? ` · ${obs}` : ""}`.slice(0, 2000),
    } });
    return resumoTrabalho(osId, tx);
  });
}
