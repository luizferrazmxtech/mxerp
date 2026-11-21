import { Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { lojaAtualId } from "@/lib/empresa/loja";
import { resumoProduto, type ResumoEstoque } from "./estoque";

/**
 * Estoque do técnico: um depósito por técnico (o carro dele), com um local só.
 *  - abastece com uma transferência de estoque (loja → carro), sem gerar venda;
 *  - o que está lá não entra no disponível da loja;
 *  - item de OS marcado "com o técnico" reserva e baixa do carro dele.
 */

export class EstoqueTecnicoError extends Error {}

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "TECNICO";

/** Cria (ou reativa) o estoque do técnico: depósito "Carro - Nome" com o local TEC-NOME. */
export async function criarEstoqueTecnico(tecnicoId: string, nome?: string) {
  return prisma.$transaction(async (tx) => {
    const u = await tx.usuario.findUnique({ where: { id: tecnicoId }, select: { id: true, nome: true } });
    if (!u) throw new EstoqueTecnicoError("Funcionário não encontrado");
    const existente = await tx.deposito.findUnique({ where: { tecnicoId }, include: { locais: { orderBy: { codigo: "asc" } } } });
    if (existente) {
      if (!existente.ativo) await tx.deposito.update({ where: { id: existente.id }, data: { ativo: true } });
      if (existente.locais.length) return { depositoId: existente.id, localId: existente.locais[0].id };
    }
    let depNome = (nome?.trim() || `Carro - ${u.nome}`).slice(0, 80);
    for (let i = 2; !existente && (await tx.deposito.findUnique({ where: { nome: depNome } })); i++) depNome = `${(nome?.trim() || `Carro - ${u.nome}`).slice(0, 76)} ${i}`;
    const dep = existente ?? (await tx.deposito.create({ data: { nome: depNome, tecnicoId } }));
    let codigo = `TEC-${slug(u.nome)}`;
    for (let i = 2; await tx.local.findUnique({ where: { codigo } }); i++) codigo = `TEC-${slug(u.nome)}-${i}`;
    const local = await tx.local.create({ data: { depositoId: dep.id, codigo, descricao: `Estoque do técnico ${u.nome}` } });
    return { depositoId: dep.id, localId: local.id };
  });
}

/** Local do estoque do técnico (ativo), ou null se ele não tem. */
export async function localDoTecnico(tx: Tx | typeof prisma, usuarioId: string) {
  const l = await tx.local.findFirst({
    where: { ativo: true, deposito: { tecnicoId: usuarioId, ativo: true } },
    orderBy: { codigo: "asc" }, select: { id: true },
  });
  return l?.id ?? null;
}

export type EstoqueDeTecnico = { tecnicoId: string; tecnicoNome: string; depositoId: string; nome: string; localId: string };

/** Todos os estoques de técnicos ativos (para os formulários da OS). */
export async function estoquesDosTecnicos(): Promise<EstoqueDeTecnico[]> {
  const deps = await prisma.deposito.findMany({
    where: { ativo: true, tecnicoId: { not: null } },
    include: { tecnico: { select: { nome: true } }, locais: { where: { ativo: true }, orderBy: { codigo: "asc" }, take: 1, select: { id: true } } },
    orderBy: { nome: "asc" },
  });
  return deps.filter((d) => d.locais.length && d.tecnicoId).map((d) => ({
    tecnicoId: d.tecnicoId!, tecnicoNome: d.tecnico?.nome ?? d.nome, depositoId: d.id, nome: d.nome, localId: d.locais[0].id,
  }));
}

export type LinhaEstoqueTecnico = { produtoId: string; codigo: string; nome: string; unidade: string; fisico: number; reservado: number; livre: number; custo: number };

/** O que está no carro do técnico: físico, separado para OS (reservado) e livre. */
export async function saldoDoTecnico(usuarioId: string): Promise<LinhaEstoqueTecnico[]> {
  const rows = await prisma.$queryRaw<{ produtoId: string; codigo: string; nome: string; unidade: string; custo: Prisma.Decimal; fisico: Prisma.Decimal; reservado: Prisma.Decimal }[]>`
    SELECT p.id "produtoId", p.codigo, p.nome, p.unidade, p.custo, SUM(s.quantidade) fisico,
           COALESCE((SELECT SUM(r.quantidade) FROM "Reserva" r JOIN "Local" rl ON rl.id = r."localId" JOIN "Deposito" rd ON rd.id = rl."depositoId"
                      WHERE r."produtoId" = p.id AND r.status = 'ATIVA' AND rd."tecnicoId" = ${usuarioId}), 0) reservado
      FROM "Saldo" s JOIN "Local" l ON l.id = s."localId" JOIN "Deposito" d ON d.id = l."depositoId" JOIN "Produto" p ON p.id = s."produtoId"
     WHERE d."tecnicoId" = ${usuarioId}
     GROUP BY p.id
    HAVING SUM(s.quantidade) <> 0 OR COALESCE((SELECT SUM(r.quantidade) FROM "Reserva" r JOIN "Local" rl ON rl.id = r."localId" JOIN "Deposito" rd ON rd.id = rl."depositoId"
                      WHERE r."produtoId" = p.id AND r.status = 'ATIVA' AND rd."tecnicoId" = ${usuarioId}), 0) <> 0
     ORDER BY p.nome`;
  return rows.map((r) => {
    const fisico = Number(r.fisico), reservado = Number(r.reservado);
    return { produtoId: r.produtoId, codigo: r.codigo, nome: r.nome, unidade: r.unidade, custo: Number(r.custo), fisico, reservado, livre: Math.round((fisico - reservado) * 10000) / 10000 };
  });
}

export type SaldoDetalhado = ResumoEstoque & {
  unidade: string;
  controla: boolean;
  /** por depósito: loja(s) e carros dos técnicos */
  onde: { nome: string; tecnico: boolean; fisico: number; reservado: number }[];
};

/** Para o "passar o mouse na quantidade": físico, reservado, disponível e onde está. */
export async function saldoDetalhado(produtoId: string): Promise<SaldoDetalhado | null> {
  const p = await prisma.produto.findUnique({ where: { id: produtoId }, select: { unidade: true, controlaEstoque: true } });
  if (!p) return null;
  const loja = await lojaAtualId();
  const [resumo, rows] = await Promise.all([
    prisma.$transaction((tx) => resumoProduto(tx, produtoId)),
    prisma.$queryRaw<{ nome: string; tecnico: boolean; fisico: Prisma.Decimal; reservado: Prisma.Decimal }[]>`
      SELECT d.nome, (d."tecnicoId" IS NOT NULL) tecnico, SUM(s.quantidade) fisico,
             COALESCE((SELECT SUM(r.quantidade) FROM "Reserva" r JOIN "Local" rl ON rl.id = r."localId"
                        WHERE r."produtoId" = ${produtoId} AND r.status = 'ATIVA' AND rl."depositoId" = d.id), 0) reservado
        FROM "Saldo" s JOIN "Local" l ON l.id = s."localId" JOIN "Deposito" d ON d.id = l."depositoId"
       WHERE s."produtoId" = ${produtoId} AND (${loja}::text IS NULL OR d."empresaId" IS NULL OR d."empresaId" = ${loja} OR d."tecnicoId" IS NOT NULL)
       GROUP BY d.id
      HAVING SUM(s.quantidade) <> 0
       ORDER BY (d."tecnicoId" IS NOT NULL), d.nome`,
  ]);
  return {
    ...resumo, unidade: p.unidade, controla: p.controlaEstoque,
    onde: rows.map((r) => ({ nome: r.nome, tecnico: r.tecnico, fisico: Number(r.fisico), reservado: Number(r.reservado) })),
  };
}

/** Livre (físico − reservado) de cada produto em cada carro: chave "produtoId|localId". */
export async function livreNosCarros(produtoIds: string[], localIds: string[]) {
  const m = new Map<string, number>();
  if (!produtoIds.length || !localIds.length) return m;
  const [saldos, reservas] = await Promise.all([
    prisma.saldo.findMany({ where: { produtoId: { in: produtoIds }, localId: { in: localIds } } }),
    prisma.reserva.groupBy({ by: ["produtoId", "localId"], where: { produtoId: { in: produtoIds }, localId: { in: localIds }, status: "ATIVA" }, _sum: { quantidade: true } }),
  ]);
  for (const s of saldos) m.set(`${s.produtoId}|${s.localId}`, Number(s.quantidade));
  for (const r of reservas) {
    const k = `${r.produtoId}|${r.localId}`;
    m.set(k, Math.round(((m.get(k) ?? 0) - Number(r._sum.quantidade ?? 0)) * 10000) / 10000);
  }
  return m;
}
