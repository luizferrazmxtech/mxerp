import { Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { lojaAtualId } from "@/lib/empresa/loja";
import { resumoProduto, type ResumoEstoque } from "./estoque";

/**
 * Estoque do carro: um depósito por equipe (a equipe é o carro, sempre com os mesmos técnicos), com um local só.
 *  - abastece com uma transferência de estoque (loja → carro), sem gerar venda;
 *  - o que está no carro não entra no disponível da loja;
 *  - item de OS marcado "no carro" reserva e baixa do carro da equipe.
 */

export class EstoqueCarroError extends Error {}

const slug = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "EQUIPE";

/** Cria (ou reativa) o estoque do carro da equipe: depósito "Carro - Equipe" com o local CARRO-EQUIPE. */
export async function criarEstoqueEquipe(equipeId: string, nome?: string) {
  return prisma.$transaction(async (tx) => {
    const e = await tx.equipe.findUnique({ where: { id: equipeId }, select: { id: true, nome: true } });
    if (!e) throw new EstoqueCarroError("Equipe não encontrada");
    const existente = await tx.deposito.findUnique({ where: { equipeId }, include: { locais: { orderBy: { codigo: "asc" } } } });
    if (existente) {
      if (!existente.ativo) await tx.deposito.update({ where: { id: existente.id }, data: { ativo: true } });
      if (existente.locais.length) return { depositoId: existente.id, localId: existente.locais[0].id };
    }
    const base = (nome?.trim() || `Carro - ${e.nome}`).slice(0, 76);
    let depNome = base;
    for (let i = 2; !existente && (await tx.deposito.findUnique({ where: { nome: depNome } })); i++) depNome = `${base} ${i}`;
    const dep = existente ?? (await tx.deposito.create({ data: { nome: depNome, equipeId } }));
    let codigo = `CARRO-${slug(e.nome)}`;
    for (let i = 2; await tx.local.findUnique({ where: { codigo } }); i++) codigo = `CARRO-${slug(e.nome)}-${i}`;
    const local = await tx.local.create({ data: { depositoId: dep.id, codigo, descricao: `Carro da equipe ${e.nome}` } });
    return { depositoId: dep.id, localId: local.id };
  });
}

/** Local do carro da equipe (ativo), ou null se ela não tem. */
export async function localDaEquipe(tx: Tx | typeof prisma, equipeId: string | null | undefined) {
  if (!equipeId) return null;
  const l = await tx.local.findFirst({ where: { ativo: true, deposito: { equipeId, ativo: true } }, orderBy: { codigo: "asc" }, select: { id: true } });
  return l?.id ?? null;
}

/**
 * Carro de onde o técnico tira as peças numa OS: o carro da equipe da OS; se a OS não tem equipe com carro,
 * o carro da (primeira) equipe de que o técnico é membro.
 */
export async function carroDoTecnico(tx: Tx | typeof prisma, usuarioId: string, osId?: string) {
  if (osId) {
    const o = await tx.ordemServico.findUnique({ where: { id: osId }, select: { equipeId: true } });
    const daOs = await localDaEquipe(tx, o?.equipeId);
    if (daOs) return daOs;
  }
  const l = await tx.local.findFirst({
    where: { ativo: true, deposito: { ativo: true, equipe: { ativo: true, membros: { has: usuarioId } } } },
    orderBy: { codigo: "asc" }, select: { id: true },
  });
  return l?.id ?? null;
}

export type CarroEquipe = { equipeId: string; equipeNome: string; membros: string[]; depositoId: string; nome: string; localId: string };

/** Carros de todas as equipes ativas (para os formulários da OS). */
export async function carrosDasEquipes(): Promise<CarroEquipe[]> {
  const deps = await prisma.deposito.findMany({
    where: { ativo: true, equipeId: { not: null } },
    include: { equipe: { select: { nome: true, membros: true } }, locais: { where: { ativo: true }, orderBy: { codigo: "asc" }, take: 1, select: { id: true } } },
    orderBy: { nome: "asc" },
  });
  return deps.filter((d) => d.locais.length && d.equipeId).map((d) => ({
    equipeId: d.equipeId!, equipeNome: d.equipe?.nome ?? d.nome, membros: d.equipe?.membros ?? [], depositoId: d.id, nome: d.nome, localId: d.locais[0].id,
  }));
}

export type LinhaEstoqueCarro = { produtoId: string; codigo: string; nome: string; unidade: string; fisico: number; reservado: number; livre: number; custo: number };

/** O que está no carro da equipe: físico, separado para OS (reservado) e livre. */
export async function saldoDoCarro(equipeId: string): Promise<LinhaEstoqueCarro[]> {
  const rows = await prisma.$queryRaw<{ produtoId: string; codigo: string; nome: string; unidade: string; custo: Prisma.Decimal; fisico: Prisma.Decimal; reservado: Prisma.Decimal }[]>`
    WITH s AS (
      SELECT s."produtoId", SUM(s.quantidade) fisico FROM "Saldo" s JOIN "Local" l ON l.id = s."localId" JOIN "Deposito" d ON d.id = l."depositoId"
       WHERE d."equipeId" = ${equipeId} GROUP BY s."produtoId"
    ), r AS (
      SELECT r."produtoId", SUM(r.quantidade) reservado FROM "Reserva" r JOIN "Local" l ON l.id = r."localId" JOIN "Deposito" d ON d.id = l."depositoId"
       WHERE d."equipeId" = ${equipeId} AND r.status = 'ATIVA' GROUP BY r."produtoId"
    )
    SELECT p.id "produtoId", p.codigo, p.nome, p.unidade, p.custo, COALESCE(s.fisico, 0) fisico, COALESCE(r.reservado, 0) reservado
      FROM "Produto" p LEFT JOIN s ON s."produtoId" = p.id LEFT JOIN r ON r."produtoId" = p.id
     WHERE COALESCE(s.fisico, 0) <> 0 OR COALESCE(r.reservado, 0) <> 0
     ORDER BY p.nome`;
  return rows.map((r) => {
    const fisico = Number(r.fisico), reservado = Number(r.reservado);
    return { produtoId: r.produtoId, codigo: r.codigo, nome: r.nome, unidade: r.unidade, custo: Number(r.custo), fisico, reservado, livre: Math.round((fisico - reservado) * 10000) / 10000 };
  });
}

export type SaldoDetalhado = ResumoEstoque & {
  unidade: string;
  controla: boolean;
  /** por depósito: loja(s) e carros das equipes */
  onde: { nome: string; carro: boolean; fisico: number; reservado: number }[];
};

/** Para o "passar o mouse na quantidade": físico, reservado, disponível e onde está. */
export async function saldoDetalhado(produtoId: string): Promise<SaldoDetalhado | null> {
  const p = await prisma.produto.findUnique({ where: { id: produtoId }, select: { unidade: true, controlaEstoque: true } });
  if (!p) return null;
  const loja = await lojaAtualId();
  const [resumo, rows] = await Promise.all([
    prisma.$transaction((tx) => resumoProduto(tx, produtoId)),
    prisma.$queryRaw<{ nome: string; carro: boolean; fisico: Prisma.Decimal; reservado: Prisma.Decimal }[]>`
      SELECT d.nome, (d."equipeId" IS NOT NULL) carro, SUM(s.quantidade) fisico,
             COALESCE((SELECT SUM(r.quantidade) FROM "Reserva" r JOIN "Local" rl ON rl.id = r."localId"
                        WHERE r."produtoId" = ${produtoId} AND r.status = 'ATIVA' AND rl."depositoId" = d.id), 0) reservado
        FROM "Saldo" s JOIN "Local" l ON l.id = s."localId" JOIN "Deposito" d ON d.id = l."depositoId"
       WHERE s."produtoId" = ${produtoId} AND (${loja}::text IS NULL OR d."empresaId" IS NULL OR d."empresaId" = ${loja} OR d."equipeId" IS NOT NULL)
       GROUP BY d.id
      HAVING SUM(s.quantidade) <> 0
       ORDER BY (d."equipeId" IS NOT NULL), d.nome`,
  ]);
  return {
    ...resumo, unidade: p.unidade, controla: p.controlaEstoque,
    onde: rows.map((r) => ({ nome: r.nome, carro: r.carro, fisico: Number(r.fisico), reservado: Number(r.reservado) })),
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
