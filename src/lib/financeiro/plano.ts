import type { GrupoDre, TipoLancamento } from "@prisma/client";
import type { Tx } from "@/lib/db";

/** Ordena "1.2" antes de "1.10" (comparação por partes numéricas). */
export function compararCodigo(a?: string | null, b?: string | null) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const pa = a.split("."), pb = b.split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i], y = pb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = Number(x), ny = Number(y);
    const d = Number.isFinite(nx) && Number.isFinite(ny) ? nx - ny : x.localeCompare(y);
    if (d) return d;
  }
  return 0;
}

export type CategoriaArvore = { id: string; codigo: string | null; nome: string; tipo: TipoLancamento; grupoDre: GrupoDre; ativa: boolean; paiId: string | null; nivel: number; usos: number };

/** Plano de contas em ordem de árvore (mãe seguida das filhas), com o nível para recuo na tela. */
export async function planoDeContas(tx: Tx, filtro?: { tipo?: TipoLancamento; ativas?: boolean }) {
  const todas = await tx.categoriaFinanceira.findMany({
    where: { ...(filtro?.tipo ? { tipo: filtro.tipo } : {}), ...(filtro?.ativas ? { ativa: true } : {}) },
    include: { _count: { select: { lancamentos: true, rateios: true } } },
  });
  const ord = (a: (typeof todas)[number], b: (typeof todas)[number]) => compararCodigo(a.codigo, b.codigo) || a.nome.localeCompare(b.nome);
  const ids = new Set(todas.map((c) => c.id));
  const out: CategoriaArvore[] = [];
  const visitar = (paiId: string | null, nivel: number) => {
    for (const c of todas.filter((x) => (paiId === null ? !x.paiId || !ids.has(x.paiId) : x.paiId === paiId)).sort(ord)) {
      out.push({ id: c.id, codigo: c.codigo, nome: c.nome, tipo: c.tipo, grupoDre: c.grupoDre, ativa: c.ativa, paiId: c.paiId, nivel, usos: c._count.lancamentos + c._count.rateios });
      if (nivel < 8) visitar(c.id, nivel + 1);
    }
  };
  visitar(null, 0);
  return out;
}

export async function salvarCategoria(
  tx: Tx,
  d: { id?: string; nome: string; codigo?: string | null; tipo: TipoLancamento; grupoDre: GrupoDre; paiId?: string | null; ativa?: boolean },
) {
  const nome = d.nome.trim();
  if (!nome) throw new Error("Informe o nome do plano de contas");
  const codigo = d.codigo?.trim() || null;
  if (codigo && !/^\d+(\.\d+)*$/.test(codigo)) throw new Error("Classificação deve ser como 1, 1.2 ou 1.2.3");
  if (d.paiId) {
    if (d.paiId === d.id) throw new Error("O plano não pode ser mãe dele mesmo");
    // impede ciclo (mãe que é filha/neta do próprio plano)
    let atual: string | null = d.paiId;
    for (let i = 0; atual && i < 20; i++) {
      if (atual === d.id) throw new Error("A conta mãe escolhida está dentro deste plano");
      const p: { paiId: string | null; tipo: TipoLancamento } | null = await tx.categoriaFinanceira.findUnique({ where: { id: atual }, select: { paiId: true, tipo: true } });
      if (!p) throw new Error("Conta mãe não encontrada");
      if (i === 0 && p.tipo !== d.tipo) throw new Error("A conta mãe precisa ser do mesmo tipo (pagamentos ou recebimentos)");
      atual = p.paiId;
    }
  }
  const dup = await tx.categoriaFinanceira.findFirst({ where: { nome: { equals: nome, mode: "insensitive" }, tipo: d.tipo, NOT: d.id ? { id: d.id } : undefined } });
  if (dup) throw new Error(`Já existe "${dup.nome}" em ${d.tipo === "PAGAR" ? "pagamentos" : "recebimentos"}`);
  const data = { nome, codigo, tipo: d.tipo, grupoDre: d.grupoDre, paiId: d.paiId || null, ativa: d.ativa ?? true };
  if (d.id) {
    const antes = await tx.categoriaFinanceira.findUniqueOrThrow({ where: { id: d.id }, include: { _count: { select: { lancamentos: true } } } });
    if (antes.tipo !== d.tipo && antes._count.lancamentos) throw new Error("Este plano já tem lançamentos: não dá para trocar entre pagamentos e recebimentos");
    return tx.categoriaFinanceira.update({ where: { id: d.id }, data });
  }
  return tx.categoriaFinanceira.create({ data });
}

/** Exclui um plano sem uso; com lançamentos, só pode ser desativado (para não perder o histórico da DRE). */
export async function excluirCategoria(tx: Tx, id: string) {
  const c = await tx.categoriaFinanceira.findUniqueOrThrow({ where: { id }, include: { _count: { select: { lancamentos: true, rateios: true, filhas: true } } } });
  if (c._count.filhas) throw new Error("Este plano tem contas filhas: exclua ou mova as filhas antes");
  if (c._count.lancamentos || c._count.rateios) throw new Error("Este plano já tem lançamentos: desative em vez de excluir");
  await tx.categoriaFinanceira.delete({ where: { id } });
}

export async function salvarCentroCusto(tx: Tx, d: { id?: string; nome: string; ativo?: boolean }) {
  const nome = d.nome.trim();
  if (!nome) throw new Error("Informe o nome do centro de custo");
  const dup = await tx.centroCusto.findFirst({ where: { nome: { equals: nome, mode: "insensitive" }, NOT: d.id ? { id: d.id } : undefined } });
  if (dup) throw new Error(`Já existe o centro de custo "${dup.nome}"`);
  return d.id
    ? tx.centroCusto.update({ where: { id: d.id }, data: { nome, ativo: d.ativo ?? true } })
    : tx.centroCusto.create({ data: { nome, ativo: d.ativo ?? true } });
}

export async function excluirCentroCusto(tx: Tx, id: string) {
  const usos = await tx.lancamento.count({ where: { centroCustoId: id } });
  if (usos) throw new Error(`Este centro de custo tem ${usos} lançamento(s): desative em vez de excluir`);
  await tx.centroCusto.delete({ where: { id } });
}

/** Centro de custo pelo nome digitado num documento (venda/OS/compra guardam o nome); cria se não existir. */
export async function centroPorNome(tx: Tx, nome?: string | null) {
  const n = nome?.trim();
  if (!n) return null;
  const c = await tx.centroCusto.findFirst({ where: { nome: { equals: n, mode: "insensitive" } } });
  return (c ?? (await tx.centroCusto.create({ data: { nome: n } }))).id;
}
