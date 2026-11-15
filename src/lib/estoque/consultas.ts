import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type LinhaEstoque = {
  id: string;
  codigo: string;
  nome: string;
  unidade: string;
  precoVenda: number;
  fisico: number;
  reservado: number;
  falta: number;
  disponivel: number;
  locais: string | null; // "A-01 (2), B-02 (3)"
};

/** Lista de produtos com físico / reservado / disponível e onde estão. */
export async function buscarEstoque(termo = "", limite = 100): Promise<LinhaEstoque[]> {
  const like = `%${termo.trim()}%`;
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
    WITH s AS (
      SELECT sa."produtoId", SUM(sa.quantidade) fisico,
             string_agg(l.codigo || ' (' || trim(to_char(sa.quantidade, 'FM999999990.####'), '.') || ')', ', ' ORDER BY l.codigo)
               FILTER (WHERE sa.quantidade <> 0) locais
        FROM "Saldo" sa JOIN "Local" l ON l.id = sa."localId"
       GROUP BY sa."produtoId"
    ), r AS (
      SELECT "produtoId",
             SUM(quantidade) FILTER (WHERE "localId" IS NOT NULL) reservado,
             SUM(quantidade) FILTER (WHERE "localId" IS NULL) falta
        FROM "Reserva" WHERE status = 'ATIVA' GROUP BY "produtoId"
    )
    SELECT p.id, p.codigo, p.nome, p.unidade, p."precoVenda",
           COALESCE(s.fisico,0) fisico, COALESCE(r.reservado,0) reservado,
           COALESCE(r.falta,0) falta, s.locais
      FROM "Produto" p
      LEFT JOIN s ON s."produtoId" = p.id
      LEFT JOIN r ON r."produtoId" = p.id
     WHERE p.ativo AND (p.codigo ILIKE ${like} OR p.nome ILIKE ${like} OR p.gtin = ${termo.trim()})
     ORDER BY p.nome
     LIMIT ${limite}`);
  return rows.map((r) => {
    const fisico = Number(r.fisico);
    const reservado = Number(r.reservado);
    return {
      id: r.id as string,
      codigo: r.codigo as string,
      nome: r.nome as string,
      unidade: r.unidade as string,
      precoVenda: Number(r.precoVenda),
      fisico,
      reservado,
      falta: Number(r.falta),
      disponivel: fisico - reservado,
      locais: (r.locais as string) ?? null,
    };
  });
}
