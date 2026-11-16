import { Prisma, type PapelUsuario } from "@prisma/client";
import { prisma } from "@/lib/db";
import { proximoNumero } from "@/lib/sequencia";
import { parseDia } from "@/lib/datas";
import { lerNumero } from "@/lib/itens/tipos";
import type { DadosCompra } from "./tipos";

/**
 * Cotação de preços (Gestão Click): cada fornecedor recebe um link próprio, responde os valores
 * e a melhor resposta vira uma compra num clique.
 */

type Usuario = { id: string; nome: string; papel?: PapelUsuario };
export class CotacaoError extends Error {}

const t = (s: string | undefined | null) => (s ?? "").trim() || null;
const n = (s: string) => lerNumero(s) ?? 0;

export type FornecedorCotacaoForm = { id?: string; fornecedorId: string; nome: string; email: string; celular: string };
export type ItemCotacaoForm = { id?: string; produtoId: string; servicoId: string; nome: string; codigo?: string; detalhes: string; quantidade: string; unidade: string };
export type DadosCotacao = { data: string; prazo: string; observacoes: string; observacaoInterna: string; fornecedores: FornecedorCotacaoForm[]; itens: ItemCotacaoForm[] };

export async function salvarCotacao(d: DadosCotacao, u: Usuario, id?: string) {
  if (!t(d.data)) throw new CotacaoError("Informe a data");
  const fornecedores = d.fornecedores.filter((f) => f.fornecedorId);
  if (!fornecedores.length) throw new CotacaoError("Adicione ao menos um fornecedor");
  for (const f of fornecedores) if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) throw new CotacaoError(`Informe o e-mail de ${f.nome || "todos os fornecedores"}`);
  if (new Set(fornecedores.map((f) => f.fornecedorId)).size !== fornecedores.length) throw new CotacaoError("Há fornecedor repetido na cotação");
  const itens = d.itens.filter((i) => i.produtoId || i.servicoId || i.nome.trim());
  if (!itens.length) throw new CotacaoError("Adicione ao menos um item a cotar");
  for (const i of itens) {
    if (!i.nome.trim()) throw new CotacaoError("Informe o item");
    if (!(n(i.quantidade) > 0)) throw new CotacaoError(`Informe a quantidade de ${i.nome}`);
    if (!t(i.unidade)) throw new CotacaoError(`Informe a unidade de ${i.nome}`);
  }
  const base = { data: parseDia(d.data), prazo: t(d.prazo) ? parseDia(d.prazo) : null, observacoes: t(d.observacoes), observacaoInterna: t(d.observacaoInterna) };
  return prisma.$transaction(async (tx) => {
    let cotacaoId = id;
    if (id) {
      const c = await tx.cotacao.findUniqueOrThrow({ where: { id } });
      if (c.situacao !== "ABERTA") throw new CotacaoError("Só cotações em aberto podem ser editadas");
      await tx.cotacao.update({ where: { id }, data: base });
    } else {
      const numero = await proximoNumero(tx, "COTACAO");
      cotacaoId = (await tx.cotacao.create({ data: { ...base, numero, criadoPorId: u.id, criadoPorNome: u.nome } })).id;
    }
    // fornecedores: mantém o link (token) e as respostas de quem continua
    const atuais = await tx.cotacaoFornecedor.findMany({ where: { cotacaoId } });
    const manter = new Set(fornecedores.map((f) => f.fornecedorId));
    await tx.cotacaoFornecedor.deleteMany({ where: { cotacaoId, fornecedorId: { notIn: [...manter] } } });
    for (const f of fornecedores) {
      const a = atuais.find((x) => x.fornecedorId === f.fornecedorId);
      if (a) await tx.cotacaoFornecedor.update({ where: { id: a.id }, data: { email: f.email.trim(), celular: t(f.celular) } });
      else await tx.cotacaoFornecedor.create({ data: { cotacaoId: cotacaoId!, fornecedorId: f.fornecedorId, email: f.email.trim(), celular: t(f.celular) } });
    }
    const idsItens = itens.map((i) => i.id).filter(Boolean) as string[];
    await tx.cotacaoItem.deleteMany({ where: { cotacaoId, id: { notIn: idsItens } } });
    for (const [ordem, i] of itens.entries()) {
      const data = { ordem, produtoId: t(i.produtoId), servicoId: t(i.servicoId), nome: i.nome.trim(), detalhes: t(i.detalhes), quantidade: new Prisma.Decimal(n(i.quantidade)), unidade: i.unidade.trim().toUpperCase() };
      if (i.id) await tx.cotacaoItem.update({ where: { id: i.id }, data });
      else await tx.cotacaoItem.create({ data: { ...data, cotacaoId: cotacaoId! } });
    }
    return tx.cotacao.findUniqueOrThrow({ where: { id: cotacaoId } });
  });
}

/** Resposta do fornecedor pela página pública do link. */
export async function responderCotacao(token: string, r: { valores: Record<string, string>; frete: string; prazoEntrega: string; condicao: string; observacao: string }) {
  return prisma.$transaction(async (tx) => {
    const f = await tx.cotacaoFornecedor.findUnique({ where: { token }, include: { cotacao: { include: { itens: true } } } });
    if (!f) throw new CotacaoError("Cotação não encontrada");
    if (f.cotacao.situacao !== "ABERTA") throw new CotacaoError("Esta cotação já foi encerrada");
    if (!f.cotacao.itens.some((i) => n(r.valores[i.id] ?? "") > 0)) throw new CotacaoError("Informe o valor de ao menos um item");
    for (const i of f.cotacao.itens) {
      const v = (r.valores[i.id] ?? "").trim();
      await tx.cotacaoResposta.upsert({
        where: { fornecedorId_itemId: { fornecedorId: f.id, itemId: i.id } },
        create: { fornecedorId: f.id, itemId: i.id, valorUnit: v ? n(v) : null },
        update: { valorUnit: v ? n(v) : null },
      });
    }
    await tx.cotacaoFornecedor.update({ where: { id: f.id }, data: { respondidoEm: new Date(), frete: t(r.frete) ? n(r.frete) : null, prazoEntrega: t(r.prazoEntrega), condicao: t(r.condicao), observacao: t(r.observacao) } });
  });
}

/** Comparativo: total de cada fornecedor e o menor preço de cada item. */
export async function comparativo(cotacaoId: string) {
  const c = await prisma.cotacao.findUniqueOrThrow({
    where: { id: cotacaoId },
    include: { itens: { orderBy: { ordem: "asc" } }, fornecedores: { include: { fornecedor: { select: { nome: true, fantasia: true, celular: true } }, respostas: true }, orderBy: { fornecedor: { nome: "asc" } } } },
  });
  const melhor = new Map<string, { fornecedorId: string; valor: number }>();
  for (const f of c.fornecedores)
    for (const r of f.respostas) {
      const v = Number(r.valorUnit ?? 0);
      if (!(v > 0)) continue;
      const m = melhor.get(r.itemId);
      if (!m || v < m.valor) melhor.set(r.itemId, { fornecedorId: f.id, valor: v });
    }
  const totais = new Map(c.fornecedores.map((f) => {
    const itens = f.respostas.reduce((s, r) => s + Number(r.valorUnit ?? 0) * Number(c.itens.find((i) => i.id === r.itemId)?.quantidade ?? 0), 0);
    return [f.id, { itens, total: itens + Number(f.frete ?? 0), completos: f.respostas.filter((r) => Number(r.valorUnit ?? 0) > 0).length }];
  }));
  return { cotacao: c, melhor, totais };
}

/** "Gerar compra": a compra já vem com o fornecedor escolhido e os valores que ele respondeu. */
export async function compraDaCotacao(cotacaoId: string, fornecedorCotacaoId: string): Promise<Partial<DadosCompra>> {
  const f = await prisma.cotacaoFornecedor.findUniqueOrThrow({
    where: { id: fornecedorCotacaoId },
    include: { fornecedor: true, respostas: true, cotacao: { include: { itens: { orderBy: { ordem: "asc" } } } } },
  });
  if (f.cotacaoId !== cotacaoId) throw new CotacaoError("Fornecedor não pertence a esta cotação");
  const valor = (itemId: string) => Number(f.respostas.find((r) => r.itemId === itemId)?.valorUnit ?? 0);
  const fmt = (v: number) => v.toFixed(2).replace(".", ",");
  const produtos = await prisma.produto.findMany({ where: { id: { in: f.cotacao.itens.map((i) => i.produtoId).filter(Boolean) as string[] } }, select: { id: true, codigo: true, nome: true, unidade: true } });
  const servicos = await prisma.servico.findMany({ where: { id: { in: f.cotacao.itens.map((i) => i.servicoId).filter(Boolean) as string[] } }, select: { id: true, codigo: true, nome: true } });
  return {
    fornecedorId: f.fornecedorId, fornecedorNome: f.fornecedor.nome, cotacaoId,
    frete: fmt(Number(f.frete ?? 0)),
    produtos: f.cotacao.itens.filter((i) => i.produtoId).map((i) => {
      const p = produtos.find((x) => x.id === i.produtoId)!;
      return { produtoId: p.id, nome: p.nome, codigo: p.codigo, unidade: p.unidade, detalhes: i.detalhes ?? "", quantidade: String(Number(i.quantidade)).replace(".", ","), valorUnit: fmt(valor(i.id)), desconto: "", descontoPct: false };
    }),
    servicos: f.cotacao.itens.filter((i) => i.servicoId).map((i) => {
      const s = servicos.find((x) => x.id === i.servicoId)!;
      return { servicoId: s.id, nome: s.nome, codigo: s.codigo, detalhes: i.detalhes ?? "", quantidade: String(Number(i.quantidade)).replace(".", ","), valorUnit: fmt(valor(i.id)), desconto: "", descontoPct: false };
    }),
    observacaoInterna: `Gerada da cotação nº ${f.cotacao.numero}`,
  };
}

/** "Carregar itens": produtos vinculados ao fornecedor no cadastro. */
export async function itensDoFornecedor(fornecedorId: string): Promise<ItemCotacaoForm[]> {
  const v = await prisma.itemFornecedor.findMany({ where: { fornecedorId }, include: { produto: { select: { id: true, codigo: true, nome: true, unidade: true, ativo: true } }, servico: { select: { id: true, codigo: true, nome: true } } } });
  return v.flatMap((x) =>
    x.produto?.ativo ? [{ produtoId: x.produto.id, servicoId: "", nome: x.produto.nome, codigo: x.produto.codigo, detalhes: "", quantidade: "1", unidade: x.produto.unidade }]
      : x.servico ? [{ produtoId: "", servicoId: x.servico.id, nome: x.servico.nome, codigo: x.servico.codigo, detalhes: "", quantidade: "1", unidade: "UN" }] : [],
  );
}
