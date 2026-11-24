import type { OrigemDocumento } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Documento de onde a mercadoria veio ou para onde foi, com o link para abrir. */
export type DocumentoOrigem = { rotulo: string; href: string; pessoa?: string };

type Mov = { origemTipo: OrigemDocumento; origemId: string | null; observacao?: string | null; id?: string; produtoId?: string; createdAt?: Date };

export const chaveOrigem = (m: Mov) => `${m.origemTipo}:${m.origemId ?? ""}`;

/** "OS 6444: peça já baixada" → 6444 (movimentos de implantação da migração citam a OS só na observação). */
const osNaObservacao = (obs?: string | null) => {
  const m = obs?.match(/\bOS\s*n?º?\s*(\d+)/i);
  return m ? Number(m[1]) : null;
};

/**
 * Resolve os documentos dos movimentos do kardex (venda, OS, compra, ajuste, inventário, devolução) de uma vez,
 * para mostrar "Venda #8698" com link em vez de só "Venda".
 */
export async function documentosDosMovimentos(movs: Mov[]): Promise<Map<string, DocumentoOrigem>> {
  const ids = (t: OrigemDocumento) => [...new Set(movs.filter((m) => m.origemTipo === t && m.origemId).map((m) => m.origemId!))];
  const ajustes = ids("AJUSTE");
  const numerosOs = [...new Set(movs.filter((m) => !m.origemId).map((m) => osNaObservacao(m.observacao)).filter((n): n is number => !!n))];
  const nome = (p?: { nome: string; fantasia?: string | null } | null) => p ? (p.fantasia || p.nome) : undefined;
  const pessoa = { select: { nome: true, fantasia: true } } as const;

  const [vendas, oss, osPorNumero, compras, devolucoes, ajs, invs, vendasAjuste, transfs] = await Promise.all([
    prisma.venda.findMany({ where: { id: { in: ids("VENDA") } }, select: { id: true, numero: true, cliente: pessoa } }),
    prisma.ordemServico.findMany({ where: { id: { in: ids("OS") } }, select: { id: true, numero: true, cliente: pessoa } }),
    numerosOs.length ? prisma.ordemServico.findMany({ where: { numero: { in: numerosOs } }, select: { id: true, numero: true, cliente: pessoa } }) : [],
    prisma.compra.findMany({ where: { id: { in: ids("COMPRA") } }, select: { id: true, numero: true, fornecedor: pessoa } }),
    prisma.devolucao.findMany({ where: { id: { in: ids("DEVOLUCAO") } }, select: { id: true, numero: true, tipo: true, venda: { select: { id: true, numero: true } } } }),
    prisma.ajusteEstoque.findMany({ where: { id: { in: ajustes } }, select: { id: true, numero: true } }),
    prisma.inventario.findMany({ where: { id: { in: ajustes } }, select: { id: true, numero: true } }),
    prisma.venda.findMany({ where: { id: { in: ajustes } }, select: { id: true, numero: true, cliente: pessoa } }),
    prisma.transferenciaEstoque.findMany({ where: { id: { in: ids("TRANSFERENCIA") } }, select: { id: true, numero: true } }),
  ]);

  // transferências antigas: os movimentos não guardavam o documento; acha pela hora e pelo produto
  const semDoc = movs.filter((m) => m.origemTipo === "TRANSFERENCIA" && !m.origemId && m.id && m.produtoId && m.createdAt);
  const tAntigas = semDoc.length ? await transferenciasPorHora(semDoc.map((m) => m.createdAt!)) : [];

  const mapa = new Map<string, DocumentoOrigem>();
  for (const m of semDoc) {
    const t = transferenciaDoMovimento(tAntigas, m);
    if (t) mapa.set(`TRANSFERENCIA:#mov:${m.id}`, { rotulo: `Transferência #${t.numero}`, href: `/estoque/transferencias/${t.id}` });
  }
  for (const v of vendas) mapa.set(`VENDA:${v.id}`, { rotulo: `Venda #${v.numero}`, href: `/vendas/${v.id}`, pessoa: nome(v.cliente) });
  for (const o of oss) mapa.set(`OS:${o.id}`, { rotulo: `OS #${o.numero}`, href: `/os/${o.id}`, pessoa: nome(o.cliente) });
  for (const c of compras) mapa.set(`COMPRA:${c.id}`, { rotulo: `Compra #${c.numero}`, href: `/compras/${c.id}`, pessoa: nome(c.fornecedor) });
  for (const d of devolucoes) mapa.set(`DEVOLUCAO:${d.id}`, { rotulo: `${d.tipo === "TROCA" ? "Troca" : "Devolução"} #${d.numero} · Venda #${d.venda.numero}`, href: `/vendas/${d.venda.id}` });
  for (const a of ajs) mapa.set(`AJUSTE:${a.id}`, { rotulo: `Ajuste #${a.numero}`, href: `/estoque/ajustes/${a.id}` });
  for (const i of invs) mapa.set(`AJUSTE:${i.id}`, { rotulo: `Inventário #${i.numero}`, href: `/estoque/inventarios/${i.id}` });
  for (const v of vendasAjuste) mapa.set(`AJUSTE:${v.id}`, { rotulo: `Venda #${v.numero}`, href: `/vendas/${v.id}`, pessoa: nome(v.cliente) });
  for (const t of transfs) mapa.set(`TRANSFERENCIA:${t.id}`, { rotulo: `Transferência #${t.numero}`, href: `/estoque/transferencias/${t.id}` });
  // movimentos sem documento (implantação) que citam a OS na observação
  for (const m of movs) {
    if (m.origemId) continue;
    const n = osNaObservacao(m.observacao);
    const o = n ? osPorNumero.find((x) => x.numero === n) : undefined;
    if (o) mapa.set(`${chaveOrigem(m)}#${n}`, { rotulo: `OS #${o.numero}`, href: `/os/${o.id}`, pessoa: nome(o.cliente) });
  }
  return mapa;
}

/** Documento de um movimento já resolvido por documentosDosMovimentos. */
export function documentoDe(mapa: Map<string, DocumentoOrigem>, m: Mov): DocumentoOrigem | undefined {
  if (m.origemId) return mapa.get(chaveOrigem(m));
  if (m.origemTipo === "TRANSFERENCIA") return m.id ? mapa.get(`TRANSFERENCIA:#mov:${m.id}`) : undefined;
  const n = osNaObservacao(m.observacao);
  return n ? mapa.get(`${chaveOrigem(m)}#${n}`) : undefined;
}

type TransfHora = { id: string; numero: number; createdAt: Date; produtos: Set<string> };

/** Transferências gravadas logo depois dos movimentos (até 2 minutos), para ligar os movimentos antigos sem documento. */
async function transferenciasPorHora(horas: Date[]): Promise<TransfHora[]> {
  const min = Math.min(...horas.map((h) => h.getTime())), max = Math.max(...horas.map((h) => h.getTime()));
  const ts = await prisma.transferenciaEstoque.findMany({
    where: { createdAt: { gte: new Date(min), lte: new Date(max + 120_000) } },
    select: { id: true, numero: true, createdAt: true, itens: { select: { produtoId: true } } }, orderBy: { createdAt: "asc" },
  });
  return ts.map((t) => ({ id: t.id, numero: t.numero, createdAt: t.createdAt, produtos: new Set(t.itens.map((i) => i.produtoId)) }));
}

/** A primeira transferência com o produto gravada até 2 minutos depois do movimento (o documento era criado no fim). */
export function transferenciaDoMovimento(ts: TransfHora[], m: { produtoId?: string; createdAt?: Date }) {
  if (!m.produtoId || !m.createdAt) return undefined;
  const h = m.createdAt.getTime();
  return ts.find((t) => t.produtos.has(m.produtoId!) && t.createdAt.getTime() >= h && t.createdAt.getTime() - h <= 120_000);
}
