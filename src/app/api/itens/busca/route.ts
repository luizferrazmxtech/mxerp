import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { estoquesDe } from "@/lib/itens/produtos";
import { situacaoEstoque } from "@/lib/itens/estoqueSituacao";
import { palavras, semAcento, wherePalavras } from "@/lib/busca/palavras";

/**
 * Busca de produtos (com valores por tabela, disponível e situação do estoque) ou serviços para os formulários
 * de orçamento/venda/OS/compra. Procura cada palavra em qualquer ordem, sem acento, no nome, código e código de barras.
 */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const q = (u.get("q") ?? "").trim();
  if (q.length < 2 || !palavras(q).length) return NextResponse.json([]);
  const exato = q.toLowerCase();
  const primeira = `${palavras(q)[0]}%`;

  if (u.get("tipo") === "servico") {
    const ids = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT s.id FROM "Servico" s
       WHERE s.ativo AND ${wherePalavras(q, [Prisma.sql`s.nome`, Prisma.sql`s.codigo`])}
       ORDER BY (lower(s.codigo) = ${exato}) DESC, (${semAcento(Prisma.sql`s.nome`)} LIKE ${primeira}) DESC, s.nome
       LIMIT 20`);
    const l = await prisma.servico.findMany({ where: { id: { in: ids.map((i) => i.id) } }, select: { id: true, codigo: true, nome: true, preco: true } });
    const m = new Map(l.map((s) => [s.id, s]));
    return NextResponse.json(ids.map((i) => m.get(i.id)!).filter(Boolean).map((s) => ({ ...s, preco: Number(s.preco) })));
  }

  const ids = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT p.id FROM "Produto" p
     WHERE p.ativo AND (lower(coalesce(p.gtin, '')) = ${exato} OR ${wherePalavras(q, [Prisma.sql`p.nome`, Prisma.sql`p.codigo`, Prisma.sql`p.gtin`])})
     ORDER BY (lower(p.codigo) = ${exato} OR lower(coalesce(p.gtin, '')) = ${exato}) DESC, (${semAcento(Prisma.sql`p.nome`)} LIKE ${primeira}) DESC, p.nome
     LIMIT 20`);
  const l = await prisma.produto.findMany({
    where: { id: { in: ids.map((i) => i.id) } },
    select: { id: true, codigo: true, nome: true, unidade: true, unidadeCompra: true, fatorConversao: true, precoVenda: true, custo: true, controlaEstoque: true, estoqueMinimo: true, estoqueMaximo: true, valores: { where: { ativo: true }, select: { tipoValorId: true, valor: true } } },
  });
  const m = new Map(l.map((p) => [p.id, p]));
  const est = await estoquesDe(l.map((p) => p.id));
  return NextResponse.json(ids.map((i) => m.get(i.id)!).filter(Boolean).map((p) => {
    const e = est.get(p.id)!;
    const disponivel = p.controlaEstoque ? e.fisico - e.reservado - e.carros : null;
    const minimo = Number(p.estoqueMinimo);
    const maximo = p.estoqueMaximo == null ? null : Number(p.estoqueMaximo);
    return {
      id: p.id, codigo: p.codigo, nome: p.nome, unidade: p.unidade, unidadeCompra: p.unidadeCompra, fatorConversao: Number(p.fatorConversao),
      preco: Number(p.precoVenda), custo: Number(p.custo), fisico: p.controlaEstoque ? e.fisico : null, disponivel,
      // livre nos carros das equipes (fora do disponível da loja)
      carros: p.controlaEstoque ? e.carros : null, fisicoCarros: p.controlaEstoque ? e.fisicoCarros : null,
      minimo, maximo, situacao: situacaoEstoque(disponivel, minimo, maximo),
      valores: p.valores.map((v) => ({ tipoValorId: v.tipoValorId, valor: Number(v.valor) })),
    };
  }));
}
