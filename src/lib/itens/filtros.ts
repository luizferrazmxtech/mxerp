import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { palavras, wherePalavras } from "@/lib/busca/palavras";

export type ParamsLista = Record<string, string | undefined>;

/** Ids da tabela em que toda palavra da busca aparece em alguma das colunas, em qualquer ordem e sem acento (igual à busca da venda). */
export async function idsPorPalavras(tabela: "Produto" | "Servico", q: string, colunas: string[], exato?: string): Promise<string[]> {
  if (!palavras(q).length) return [];
  const cols = colunas.map((c) => Prisma.sql`t.${Prisma.raw(`"${c}"`)}`);
  const ex = exato ? Prisma.sql`t.${Prisma.raw(`"${exato}"`)} = ${q.trim()} OR ` : Prisma.empty;
  const linhas = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT t.id FROM ${Prisma.raw(`"${tabela}"`)} t WHERE ${ex}(${wherePalavras(q, cols)})`);
  return linhas.map((l) => l.id);
}

/** Filtros da lista de produtos (busca simples e avançada do Gestão Click). */
export async function whereProdutos(sp: ParamsLista): Promise<Prisma.ProdutoWhereInput> {
  const and: Prisma.ProdutoWhereInput[] = [];
  const cont = (v: string) => ({ contains: v.trim(), mode: "insensitive" as const });
  if (sp.q?.trim()) and.push({ id: { in: await idsPorPalavras("Produto", sp.q, ["nome", "codigo", "gtin"], "gtin") } });
  if (sp.nome?.trim()) and.push({ id: { in: await idsPorPalavras("Produto", sp.nome, ["nome"]) } });
  if (sp.codigo) and.push({ OR: [{ codigo: cont(sp.codigo) }, { gtin: sp.codigo.trim() }] });
  if (sp.loja) and.push({ OR: [{ lojas: { has: sp.loja } }, { lojas: { isEmpty: true } }] }); // sem loja marcada = todas
  if (sp.grupo) {
    const filhos = await prisma.grupoProduto.findMany({ where: { paiId: sp.grupo }, select: { id: true } });
    and.push({ grupoId: { in: [sp.grupo, ...filhos.map((f) => f.id)] } });
  }
  if (sp.ativo === "sim") and.push({ ativo: true });
  if (sp.ativo === "nao") and.push({ ativo: false });
  if (sp.forn) and.push({ fornecedores: { some: { fornecedorId: sp.forn } } });
  if (sp.sit) {
    const cond = {
      zero: Prisma.sql`COALESCE(s.q, 0) <= 0`,
      positivo: Prisma.sql`COALESCE(s.q, 0) > 0`,
      minimo: Prisma.sql`p."estoqueMinimo" > 0 AND COALESCE(s.q, 0) <= p."estoqueMinimo"`,
      maximo: Prisma.sql`p."estoqueMaximo" IS NOT NULL AND COALESCE(s.q, 0) >= p."estoqueMaximo"`,
    }[sp.sit];
    if (cond) {
      const ids = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT p.id FROM "Produto" p
        LEFT JOIN (SELECT "produtoId", SUM(quantidade) q FROM "Saldo" GROUP BY "produtoId") s ON s."produtoId" = p.id
        WHERE p."controlaEstoque" AND ${cond}`);
      and.push({ id: { in: ids.map((x) => x.id) } });
    }
  }
  for (const [k, v] of Object.entries(sp)) {
    if (k.startsWith("ce_") && v) and.push({ camposExtras: { path: [k.slice(3)], string_contains: v } });
  }
  return and.length ? { AND: and } : {};
}

export function ordemProdutos(o?: string): Prisma.ProdutoOrderByWithRelationInput {
  const dir = o?.startsWith("-") ? "desc" : "asc";
  const c = o?.replace(/^-/, "");
  if (c === "codigo") return { codigo: dir };
  if (c === "valor") return { precoVenda: dir };
  if (c === "cadastrado") return { createdAt: dir };
  return { nome: dir };
}

/** Filtros da lista de serviços. */
export async function whereServicos(sp: ParamsLista): Promise<Prisma.ServicoWhereInput> {
  const and: Prisma.ServicoWhereInput[] = [];
  const cont = (v: string) => ({ contains: v.trim(), mode: "insensitive" as const });
  if (sp.q?.trim()) and.push({ id: { in: await idsPorPalavras("Servico", sp.q, ["nome", "codigo"]) } });
  if (sp.nome?.trim()) and.push({ id: { in: await idsPorPalavras("Servico", sp.nome, ["nome"]) } });
  if (sp.codigo) and.push({ codigo: cont(sp.codigo) });
  if (sp.loja) and.push({ OR: [{ lojas: { has: sp.loja } }, { lojas: { isEmpty: true } }] }); // sem loja marcada = todas
  if (sp.ativo === "sim") and.push({ ativo: true });
  if (sp.ativo === "nao") and.push({ ativo: false });
  if (sp.forn) and.push({ fornecedores: { some: { fornecedorId: sp.forn } } });
  return and.length ? { AND: and } : {};
}

export function ordemServicos(o?: string): Prisma.ServicoOrderByWithRelationInput {
  const dir = o?.startsWith("-") ? "desc" : "asc";
  const c = o?.replace(/^-/, "");
  if (c === "codigo") return { codigo: dir };
  if (c === "custo") return { custo: dir };
  if (c === "valor") return { preco: dir };
  return { nome: dir };
}
