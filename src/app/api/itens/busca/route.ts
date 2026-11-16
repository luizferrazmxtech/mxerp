import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { estoquesDe } from "@/lib/itens/produtos";

/** Busca de produtos (com valores por tabela e disponível) ou serviços para os formulários de orçamento/venda. */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const q = (u.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json([]);
  const c = { contains: q, mode: "insensitive" as const };
  if (u.get("tipo") === "servico") {
    const l = await prisma.servico.findMany({ where: { ativo: true, OR: [{ nome: c }, { codigo: c }] }, select: { id: true, codigo: true, nome: true, preco: true }, orderBy: { nome: "asc" }, take: 15 });
    return NextResponse.json(l.map((s) => ({ ...s, preco: Number(s.preco) })));
  }
  const l = await prisma.produto.findMany({
    where: { ativo: true, OR: [{ nome: c }, { codigo: c }, { gtin: q }] }, orderBy: { nome: "asc" }, take: 15,
    select: { id: true, codigo: true, nome: true, unidade: true, precoVenda: true, controlaEstoque: true, valores: { where: { ativo: true }, select: { tipoValorId: true, valor: true } } },
  });
  const est = await estoquesDe(l.map((p) => p.id));
  return NextResponse.json(l.map((p) => {
    const e = est.get(p.id)!;
    return { id: p.id, codigo: p.codigo, nome: p.nome, unidade: p.unidade, preco: Number(p.precoVenda), disponivel: p.controlaEstoque ? e.fisico - e.reservado : null, valores: p.valores.map((v) => ({ tipoValorId: v.tipoValorId, valor: Number(v.valor) })) };
  }));
}
