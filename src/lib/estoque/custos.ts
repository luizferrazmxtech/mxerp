import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseDia } from "@/lib/datas";
import { textoConversao } from "@/lib/itens/unidades";

/**
 * Relatório de custos: para cada produto, o custo do cadastro comparado com o que as compras mostram
 * (última, média ponderada, menor e maior, sempre por unidade de venda, já com a conversão CX → MT),
 * a margem sobre o preço de venda pela base escolhida, a visão por fornecedor e a lista das compras.
 */

export type ParamsCustos = Record<string, string | undefined>;
export type BaseMargem = "ULTIMA" | "MEDIA" | "MENOR" | "MAIOR" | "CADASTRO";
export const BASES_MARGEM: [BaseMargem, string][] = [
  ["CADASTRO", "Custo do cadastro"], ["ULTIMA", "Último custo de compra"], ["MEDIA", "Custo médio das compras"], ["MENOR", "Menor custo de compra"], ["MAIOR", "Maior custo de compra"],
];
export const FILTROS_CUSTO: [string, string][] = [
  ["", "Todos os produtos"], ["comCompras", "Só com compras no período"], ["conversao", "Só com conversão de unidade"], ["semCusto", "Custo zerado no cadastro"],
  ["margemBaixa", "Margem abaixo do limite"], ["negativa", "Margem negativa (vende abaixo do custo)"], ["divergente", "Cadastro diferente da última compra"], ["subiu", "Última compra acima da média"],
];

export type CompraCusto = {
  compraId: string; numero: number; data: Date; fornecedorId: string; fornecedor: string; produtoId: string;
  quantidadeNota: number; unidadeNota: string; fator: number; quantidade: number; precoNota: number; custo: number; custoSemRateio: number;
};
export type LinhaCusto = {
  id: string; codigo: string; nome: string; grupo: string | null; unidade: string; conversao: string | null;
  custoCadastro: number; preco: number; estoque: number;
  ultima: CompraCusto | null; media: number | null; menor: number | null; maior: number | null; qtdComprada: number; nCompras: number; nFornecedores: number;
  base: number | null; margem: number | null; markup: number | null; variacao: number | null; divergencia: number | null; valorEstoque: number;
};
export type LinhaFornecedor = {
  produtoId: string; codigo: string; nome: string; unidade: string; fornecedorId: string; fornecedor: string;
  ultima: number; ultimaData: Date; media: number; menor: number; nCompras: number; qtd: number; melhor: boolean; acimaDoMelhor: number;
};

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const pct = (a: number, b: number) => (b ? r4(((a - b) / b) * 100) : null);

export function periodoCustos(sp: ParamsCustos) {
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const umAno = new Date(Date.now() - 3 * 3600_000 - 365 * 86400_000).toISOString().slice(0, 10);
  return { de: sp.de || umAno, ate: sp.ate || hoje };
}

export async function relatorioCustos(sp: ParamsCustos) {
  const { de, ate } = periodoCustos(sp);
  const base = (BASES_MARGEM.some(([b]) => b === sp.base) ? sp.base : "ULTIMA") as BaseMargem;
  const rateio = sp.rateio !== "0";
  const margemMax = Number((sp.margemMax ?? "20").replace(",", ".")) || 20;
  const q = (sp.q ?? "").trim();

  const wProd: Prisma.ProdutoWhereInput[] = [{ possuiComposicao: false }];
  if (sp.inativos !== "1") wProd.push({ ativo: true });
  if (q) wProd.push({ OR: [{ nome: { contains: q, mode: "insensitive" } }, { codigo: { contains: q, mode: "insensitive" } }, { gtin: q }] });
  if (sp.grupo) wProd.push({ OR: [{ grupoId: sp.grupo }, { grupo: { paiId: sp.grupo } }] });
  if (sp.filtro === "conversao") wProd.push({ unidadeCompra: { not: null } });
  if (sp.filtro === "semCusto") wProd.push({ custo: { lte: 0 } });

  const produtos = await prisma.produto.findMany({
    where: { AND: wProd }, orderBy: { nome: "asc" },
    select: { id: true, codigo: true, nome: true, unidade: true, unidadeCompra: true, fatorConversao: true, custo: true, precoVenda: true, controlaEstoque: true, grupo: { select: { nome: true } } },
  });
  const ids = produtos.map((p) => p.id);
  const itens = ids.length ? await prisma.compraItem.findMany({
    where: {
      produtoId: { in: ids },
      compra: { recebida: true, tipo: "PRODUTO", data: { gte: parseDia(de), lte: parseDia(ate) }, ...(sp.forn ? { fornecedorId: sp.forn } : {}) },
    },
    include: { compra: { select: { id: true, numero: true, data: true, createdAt: true, frete: true, impostos: true, desconto: true, totalProdutos: true, fornecedorId: true, fornecedor: { select: { nome: true, fantasia: true } } } } },
  }) : [];

  // custo de cada linha por unidade de venda; com rateio, frete e impostos da nota (menos o desconto geral) na proporção do valor da linha
  const compras: CompraCusto[] = itens.map((i) => {
    const fator = Number(i.fator) > 0 ? Number(i.fator) : 1;
    const qtd = Number(i.quantidade) * fator;
    const sub = Number(i.subtotal);
    const tp = Number(i.compra.totalProdutos);
    const extra = tp > 0 ? (sub / tp) * (Number(i.compra.frete) + Number(i.compra.impostos) - Number(i.compra.desconto)) : 0;
    return {
      compraId: i.compraId, numero: i.compra.numero, data: i.compra.data, fornecedorId: i.compra.fornecedorId, fornecedor: i.compra.fornecedor.fantasia || i.compra.fornecedor.nome,
      produtoId: i.produtoId, quantidadeNota: Number(i.quantidade), unidadeNota: i.unidadeCompra ?? "", fator, quantidade: qtd,
      precoNota: Number(i.quantidade) > 0 ? sub / Number(i.quantidade) : Number(i.custoUnit),
      custo: qtd > 0 ? r4((sub + (rateio ? extra : 0)) / qtd) : 0, custoSemRateio: qtd > 0 ? r4(sub / qtd) : 0,
    };
  }).sort((a, b) => b.data.getTime() - a.data.getTime() || b.numero - a.numero);
  const porProduto = new Map<string, CompraCusto[]>();
  for (const c of compras) porProduto.set(c.produtoId, [...(porProduto.get(c.produtoId) ?? []), c]);

  const est = new Map<string, number>();
  if (ids.length) for (const s of await prisma.saldo.groupBy({ by: ["produtoId"], where: { produtoId: { in: ids } }, _sum: { quantidade: true } })) est.set(s.produtoId, Number(s._sum.quantidade ?? 0));

  let linhas: LinhaCusto[] = produtos.map((p) => {
    const cs = (porProduto.get(p.id) ?? []).filter((c) => c.quantidade > 0);
    const qt = cs.reduce((s, c) => s + c.quantidade, 0);
    const media = qt > 0 ? r4(cs.reduce((s, c) => s + c.custo * c.quantidade, 0) / qt) : null;
    const custos = cs.map((c) => c.custo);
    const ultima = cs[0] ?? null;
    const custoCadastro = Number(p.custo), preco = Number(p.precoVenda);
    const menor = custos.length ? Math.min(...custos) : null, maior = custos.length ? Math.max(...custos) : null;
    const b = { CADASTRO: custoCadastro || null, ULTIMA: ultima?.custo ?? null, MEDIA: media, MENOR: menor, MAIOR: maior }[base];
    const estoque = p.controlaEstoque ? est.get(p.id) ?? 0 : 0;
    return {
      id: p.id, codigo: p.codigo, nome: p.nome, grupo: p.grupo?.nome ?? null, unidade: p.unidade,
      conversao: p.unidadeCompra ? textoConversao(p.unidadeCompra, Number(p.fatorConversao), p.unidade) : null,
      custoCadastro, preco, estoque, ultima, media, menor, maior, qtdComprada: r4(qt), nCompras: new Set(cs.map((c) => c.compraId)).size, nFornecedores: new Set(cs.map((c) => c.fornecedorId)).size,
      base: b, margem: b != null && preco > 0 ? r4(((preco - b) / preco) * 100) : null, markup: b ? pct(preco, b) : null,
      variacao: ultima && media ? pct(ultima.custo, media) : null, divergencia: ultima && custoCadastro > 0 ? pct(custoCadastro, ultima.custo) : ultima ? -100 : null,
      valorEstoque: Math.max(0, estoque) * (b ?? custoCadastro),
    };
  });

  const f = sp.filtro;
  if (f === "comCompras" || sp.forn) linhas = linhas.filter((l) => l.nCompras > 0);
  if (f === "margemBaixa") linhas = linhas.filter((l) => l.margem != null && l.margem < margemMax);
  if (f === "negativa") linhas = linhas.filter((l) => l.margem != null && l.margem < 0);
  if (f === "divergente") linhas = linhas.filter((l) => l.divergencia != null && Math.abs(l.divergencia) > 15);
  if (f === "subiu") linhas = linhas.filter((l) => l.variacao != null && l.variacao > 0.5);

  const ord = (sp.o ?? "nome").replace(/^-/, ""), dir = sp.o?.startsWith("-") ? -1 : 1;
  const chave: Record<string, (l: LinhaCusto) => number | string> = {
    nome: (l) => l.nome, codigo: (l) => l.codigo, custo: (l) => l.custoCadastro, ultima: (l) => l.ultima?.custo ?? -1, media: (l) => l.media ?? -1,
    margem: (l) => l.margem ?? 9e9, variacao: (l) => l.variacao ?? -9e9, divergencia: (l) => Math.abs(l.divergencia ?? 0), estoque: (l) => l.valorEstoque, compras: (l) => l.nCompras,
  };
  const k = chave[ord] ?? chave.nome;
  linhas.sort((a, b) => { const x = k(a), y = k(b); return (typeof x === "string" ? x.localeCompare(y as string, "pt-BR") : x - (y as number)) * dir; });

  // visão por fornecedor: cada produto × fornecedor, marcando o de menor custo médio
  const visiveis = new Set(linhas.map((l) => l.id));
  const grupos = new Map<string, CompraCusto[]>();
  for (const c of compras) if (visiveis.has(c.produtoId) && c.quantidade > 0) grupos.set(`${c.produtoId}|${c.fornecedorId}`, [...(grupos.get(`${c.produtoId}|${c.fornecedorId}`) ?? []), c]);
  const prodPorId = new Map(linhas.map((l) => [l.id, l]));
  const fornecedores: LinhaFornecedor[] = [...grupos.values()].map((cs) => {
    const qt = cs.reduce((s, c) => s + c.quantidade, 0);
    const p = prodPorId.get(cs[0].produtoId)!;
    return {
      produtoId: p.id, codigo: p.codigo, nome: p.nome, unidade: p.unidade, fornecedorId: cs[0].fornecedorId, fornecedor: cs[0].fornecedor,
      ultima: cs[0].custo, ultimaData: cs[0].data, media: r4(cs.reduce((s, c) => s + c.custo * c.quantidade, 0) / qt), menor: Math.min(...cs.map((c) => c.custo)),
      nCompras: new Set(cs.map((c) => c.compraId)).size, qtd: r4(qt), melhor: false, acimaDoMelhor: 0,
    };
  });
  const melhorPorProduto = new Map<string, number>();
  for (const l of fornecedores) melhorPorProduto.set(l.produtoId, Math.min(melhorPorProduto.get(l.produtoId) ?? Infinity, l.media));
  for (const l of fornecedores) {
    const m = melhorPorProduto.get(l.produtoId)!;
    l.melhor = l.media === m;
    l.acimaDoMelhor = m > 0 ? r4(((l.media - m) / m) * 100) : 0;
  }
  const ordemProd = new Map(linhas.map((l, i) => [l.id, i]));
  fornecedores.sort((a, b) => ordemProd.get(a.produtoId)! - ordemProd.get(b.produtoId)! || a.media - b.media);

  const comMargem = linhas.filter((l) => l.margem != null);
  const resumo = {
    produtos: linhas.length, comCompras: linhas.filter((l) => l.nCompras > 0).length, semCusto: linhas.filter((l) => l.custoCadastro <= 0).length,
    negativos: linhas.filter((l) => l.margem != null && l.margem < 0).length, margemBaixa: linhas.filter((l) => l.margem != null && l.margem < margemMax).length,
    margemMedia: comMargem.length ? r4(comMargem.reduce((s, l) => s + l.margem!, 0) / comMargem.length) : null,
    valorEstoque: linhas.reduce((s, l) => s + l.valorEstoque, 0), totalComprado: compras.filter((c) => visiveis.has(c.produtoId)).reduce((s, c) => s + c.custo * c.quantidade, 0),
  };
  return { de, ate, base, rateio, margemMax, linhas, fornecedores, compras: compras.filter((c) => visiveis.has(c.produtoId)), produtos: prodPorId, resumo };
}

/** CSV (separador ;, vírgula decimal) da visão aberta, para abrir no Excel. */
export async function csvCustos(sp: ParamsCustos) {
  const r = await relatorioCustos(sp);
  const n = (v: number | null | undefined, c = 4) => (v == null ? "" : v.toFixed(c).replace(".", ","));
  const d = (x: Date) => x.toISOString().slice(0, 10).split("-").reverse().join("/");
  const esc = (s: string | null | undefined) => `"${(s ?? "").replace(/"/g, '""')}"`;
  let linhas: string[][];
  if (sp.visao === "fornecedores") {
    linhas = [["Código", "Produto", "Unidade", "Fornecedor", "Último custo", "Data", "Custo médio", "Menor custo", "Compras", "Quantidade", "Melhor preço", "% acima do melhor"],
      ...r.fornecedores.map((l) => [l.codigo, l.nome, l.unidade, l.fornecedor, n(l.ultima), d(l.ultimaData), n(l.media), n(l.menor), String(l.nCompras), n(l.qtd), l.melhor ? "sim" : "", n(l.acimaDoMelhor, 2)])];
  } else if (sp.visao === "compras") {
    linhas = [["Data", "Compra", "Fornecedor", "Código", "Produto", "Qtd. na nota", "Unid. nota", "Fator", "Qtd. convertida", "Unidade", "Preço na nota", "Custo por unidade", "Custo sem rateio"],
      ...r.compras.map((c) => { const p = r.produtos.get(c.produtoId)!; return [d(c.data), String(c.numero), c.fornecedor, p.codigo, p.nome, n(c.quantidadeNota), c.unidadeNota || p.unidade, n(c.fator), n(c.quantidade), p.unidade, n(c.precoNota), n(c.custo), n(c.custoSemRateio)]; })];
  } else {
    linhas = [["Código", "Produto", "Grupo", "Unidade", "Conversão", "Custo cadastro", "Último custo", "Data última", "Fornecedor última", "Custo médio", "Menor", "Maior", "Qtd. comprada", "Compras", "Preço de venda", "Margem %", "Markup %", "Última x média %", "Cadastro x última %", "Estoque", "Valor do estoque"],
      ...r.linhas.map((l) => [l.codigo, l.nome, l.grupo ?? "", l.unidade, l.conversao ?? "", n(l.custoCadastro), n(l.ultima?.custo), l.ultima ? d(l.ultima.data) : "", l.ultima?.fornecedor ?? "", n(l.media), n(l.menor), n(l.maior), n(l.qtdComprada), String(l.nCompras), n(l.preco, 2), n(l.margem, 2), n(l.markup, 2), n(l.variacao, 2), n(l.divergencia, 2), n(l.estoque), n(l.valorEstoque, 2)])];
  }
  return "﻿" + linhas.map((l) => l.map(esc).join(";")).join("\r\n");
}
