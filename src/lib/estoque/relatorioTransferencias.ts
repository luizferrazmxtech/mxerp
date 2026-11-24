import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { todasAsLojas } from "@/lib/empresa/loja";

/**
 * Relatório de transferências de estoque (loja → loja, loja → carro, carro → loja), item por item.
 * A lista de transferências passa pela extensão do Prisma, então só aparecem as da empresa atual.
 */

export type FiltroTransferencias = {
  de: Date; ate: Date;
  origem?: string; destino?: string;
  /** depósito do carro: transferências que entram OU saem dele */
  carro?: string;
  /** código, nome ou código de barras do produto */
  produto?: string;
};

export type LinhaTransferencia = {
  transferenciaId: string; numero: number; data: Date; origem: string; destino: string; origemCarro: boolean; destinoCarro: boolean;
  produtoId: string; codigo: string; produto: string; unidade: string; quantidade: number; custoUnit: number; total: number;
  usuario: string; observacoes: string;
};

export type ResumoProdutoTransf = { produtoId: string; codigo: string; produto: string; unidade: string; quantidade: number; total: number; transferencias: number };

export async function relatorioTransferencias(f: FiltroTransferencias) {
  const termo = f.produto?.trim();
  const whereProduto: Prisma.ProdutoWhereInput | undefined = termo
    ? { OR: [{ codigo: { contains: termo, mode: "insensitive" } }, { nome: { contains: termo, mode: "insensitive" } }, { gtin: termo }] }
    : undefined;
  const where: Prisma.TransferenciaEstoqueWhereInput = {
    createdAt: { gte: new Date(f.de.getTime() + 3 * 3600e3), lt: new Date(f.ate.getTime() + 27 * 3600e3) },
    ...(f.origem ? { origemDepositoId: f.origem } : {}),
    ...(f.destino ? { destinoDepositoId: f.destino } : {}),
    ...(f.carro ? { OR: [{ origemDepositoId: f.carro }, { destinoDepositoId: f.carro }] } : {}),
    ...(whereProduto ? { itens: { some: { produto: whereProduto } } } : {}),
  };
  const [ts, depositos] = await Promise.all([
    prisma.transferenciaEstoque.findMany({
      where, orderBy: [{ createdAt: "desc" }, { numero: "desc" }], take: 2000,
      include: { itens: { where: whereProduto ? { produto: whereProduto } : undefined, orderBy: { ordem: "asc" }, include: { produto: { select: { codigo: true, nome: true, unidade: true } } } } },
    }),
    // nomes de origem/destino (uma transferência entre lojas aponta para o depósito da outra)
    todasAsLojas(() => prisma.deposito.findMany({ select: { id: true, nome: true, equipeId: true } })),
  ]);
  const dep = new Map(depositos.map((d) => [d.id, d]));
  const linhas: LinhaTransferencia[] = ts.flatMap((t) => t.itens.map((i) => {
    const q = Number(i.quantidade), c = Number(i.custoUnit);
    return {
      transferenciaId: t.id, numero: t.numero, data: t.createdAt,
      origem: dep.get(t.origemDepositoId)?.nome ?? "—", destino: dep.get(t.destinoDepositoId)?.nome ?? "—",
      origemCarro: !!dep.get(t.origemDepositoId)?.equipeId, destinoCarro: !!dep.get(t.destinoDepositoId)?.equipeId,
      produtoId: i.produtoId, codigo: i.produto.codigo, produto: i.produto.nome, unidade: i.produto.unidade,
      quantidade: q, custoUnit: c, total: Math.round(q * c * 100) / 100, usuario: t.criadoPorNome ?? "", observacoes: t.observacoes ?? "",
    };
  }));
  const porProduto = new Map<string, ResumoProdutoTransf & { docs: Set<string> }>();
  for (const l of linhas) {
    const p = porProduto.get(l.produtoId) ?? { produtoId: l.produtoId, codigo: l.codigo, produto: l.produto, unidade: l.unidade, quantidade: 0, total: 0, transferencias: 0, docs: new Set<string>() };
    p.quantidade = Math.round((p.quantidade + l.quantidade) * 10000) / 10000;
    p.total = Math.round((p.total + l.total) * 100) / 100;
    p.docs.add(l.transferenciaId);
    porProduto.set(l.produtoId, p);
  }
  const produtos: ResumoProdutoTransf[] = [...porProduto.values()]
    .map(({ docs, ...p }) => ({ ...p, transferencias: docs.size }))
    .sort((a, b) => b.total - a.total || a.produto.localeCompare(b.produto));
  return {
    linhas, produtos,
    resumo: {
      transferencias: ts.length, itens: linhas.length,
      quantidade: Math.round(linhas.reduce((s, l) => s + l.quantidade, 0) * 10000) / 10000,
      total: Math.round(linhas.reduce((s, l) => s + l.total, 0) * 100) / 100,
      paraCarros: ts.filter((t) => dep.get(t.destinoDepositoId)?.equipeId).length,
      dosCarros: ts.filter((t) => dep.get(t.origemDepositoId)?.equipeId).length,
    },
    limitado: ts.length >= 2000,
  };
}

/** Depósitos da empresa atual para os filtros (carros por último). */
export async function depositosParaFiltro() {
  const ds = await prisma.deposito.findMany({ select: { id: true, nome: true, equipeId: true, ativo: true }, orderBy: { nome: "asc" } });
  return ds.sort((a, b) => Number(!!a.equipeId) - Number(!!b.equipeId));
}
