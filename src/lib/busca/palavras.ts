import { Prisma } from "@prisma/client";

/**
 * Busca por palavras, como no Gestão Click: "conector rj45 1000" acha "CONECTOR RJ45 CAT5E CONEX 1000".
 * Cada palavra precisa aparecer em alguma das colunas, em qualquer ordem, sem diferenciar maiúsculas e acentos.
 */

const COM = "áàâãäåéèêëíìîïóòôõöúùûüçñý";
const SEM = "aaaaaaeeeeiiiiooooouuuucny";

/** minúsculas e sem acento (o mesmo que o translate() do SQL faz). */
export const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Palavras da busca, já normalizadas (no máximo 8). */
export function palavras(q: string) {
  return normalizar(q).split(/\s+/).map((p) => p.trim()).filter(Boolean).slice(0, 8);
}

const escapar = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);

/** SQL da coluna minúscula e sem acento. */
export const semAcento = (coluna: Prisma.Sql) => Prisma.sql`translate(lower(coalesce(${coluna}, '')), ${COM}, ${SEM})`;

/** Condição SQL: toda palavra aparece em pelo menos uma das colunas. Sem palavras, TRUE. */
export function wherePalavras(q: string, colunas: Prisma.Sql[]): Prisma.Sql {
  const ps = palavras(q);
  if (!ps.length || !colunas.length) return Prisma.sql`TRUE`;
  const cols = colunas.map(semAcento);
  return Prisma.join(ps.map((p) => {
    const like = `%${escapar(p)}%`;
    return Prisma.sql`(${Prisma.join(cols.map((c) => Prisma.sql`${c} LIKE ${like}`), " OR ")})`;
  }), " AND ");
}

/** Palavras digitadas, como vieram (sem normalizar), para usar no `contains` do Prisma. */
export function palavrasBusca(q: string | null | undefined) {
  return (q ?? "").trim().split(/\s+/).map((p) => p.trim()).filter(Boolean).slice(0, 8);
}

/** Número de documento digitado como palavra ("8698" ou "#8698"); 0 se não for número. */
export const numeroPalavra = (p: string) => (/^#?\d{1,9}$/.test(p) ? Number(p.replace("#", "")) : 0);

/**
 * Busca por palavras nas listas feitas com o Prisma: cada palavra precisa casar com alguma das condições,
 * em qualquer ordem ("silva joao" acha "João da Silva"). Devolve as condições para juntar num AND.
 */
export function cadaPalavra<T>(q: string | null | undefined, condicoes: (palavra: string) => T[]): { OR: T[] }[] {
  return palavrasBusca(q).map((p) => ({ OR: condicoes(p) }));
}

/** `contains` sem diferenciar maiúsculas. */
export const contem = (p: string) => ({ contains: p, mode: "insensitive" as const });
