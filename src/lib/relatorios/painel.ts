import { prisma } from "@/lib/db";
import { sqlDaLoja } from "@/lib/empresa/loja";
import { diaSP, rotuloMesCurto, somarDias } from "@/lib/datas";
import { itensVendidos, type FiltroVendas, type ItemVendido, type Periodo } from "./relatorios";

/**
 * Painel da tela de Relatórios: totais do período comparados com o período anterior,
 * faturamento e lucro dos últimos 12 meses (com o mesmo mês do ano anterior) e os maiores
 * clientes e produtos. Mesma base do relatório de Lucro (vendas concretizadas + OS concluídas/faturadas).
 */
const r2 = (v: number) => Math.round(v * 100) / 100;
const DIA = 86400000;

export type Totais = { receita: number; custo: number; lucro: number; margem: number; documentos: number; ticket: number; vendas: number; os: number };

export function totais(itens: ItemVendido[]): Totais {
  const docs = new Set(itens.map((i) => `${i.origem}:${i.docId}`));
  const receita = r2(itens.reduce((s, i) => s + i.receita, 0));
  const custo = r2(itens.reduce((s, i) => s + i.custo, 0));
  const os = r2(itens.filter((i) => i.origem === "OS").reduce((s, i) => s + i.receita, 0));
  return {
    receita, custo, lucro: r2(receita - custo), margem: receita > 0 ? (receita - custo) / receita : 0,
    documentos: docs.size, ticket: docs.size ? r2(receita / docs.size) : 0, os, vendas: r2(receita - os),
  };
}

const ehMesCheio = (p: Periodo) => p.de.getUTCDate() === 1 && new Date(p.ate.getTime() + DIA).getUTCDate() === 1;

/** Período anterior de mesmo tamanho. Mês cheio (ou vários meses cheios) compara com os meses imediatamente antes. */
export function periodoAnterior(p: Periodo): Periodo {
  if (ehMesCheio(p)) {
    const meses = (p.ate.getUTCFullYear() - p.de.getUTCFullYear()) * 12 + p.ate.getUTCMonth() - p.de.getUTCMonth() + 1;
    const de = new Date(Date.UTC(p.de.getUTCFullYear(), p.de.getUTCMonth() - meses, 1));
    return { de, ate: somarDias(p.de, -1) };
  }
  const dias = Math.round((p.ate.getTime() - p.de.getTime()) / DIA) + 1;
  return { de: somarDias(p.de, -dias), ate: somarDias(p.de, -1) };
}

/** Variação relativa (0.12 = +12%). null quando não há base para comparar. */
export const variacao = (atual: number, antes: number) => (antes ? (atual - antes) / Math.abs(antes) : null);

const chaveMes = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** Os 12 meses que terminam no mês de `ref`. */
export function ultimos12(ref: Date) {
  return Array.from({ length: 12 }, (_, k) => {
    const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - 11 + k, 1));
    return { chave: chaveMes(d), rotulo: rotuloMesCurto(chaveMes(d)) };
  });
}

function ranking(itens: ItemVendido[], chave: (i: ItemVendido) => [string, string] | null, n = 5) {
  const m = new Map<string, { chave: string; rotulo: string; receita: number; lucro: number }>();
  for (const i of itens) {
    const k = chave(i);
    if (!k) continue;
    const g = m.get(k[0]) ?? { chave: k[0], rotulo: k[1], receita: 0, lucro: 0 };
    g.receita += i.receita; g.lucro += i.receita - i.custo;
    m.set(k[0], g);
  }
  const todos = [...m.values()].sort((a, b) => b.receita - a.receita);
  const top = todos.slice(0, n).map((g) => ({ ...g, receita: r2(g.receita), lucro: r2(g.lucro) }));
  const resto = todos.slice(n).reduce((s, g) => s + g.receita, 0);
  return { top, outros: r2(resto), qtdOutros: Math.max(todos.length - n, 0) };
}

export async function painelRelatorios(per: Periodo, f: FiltroVendas = {}, hoje = diaSP()) {
  const ant = periodoAnterior(per);
  const ref = per.ate < hoje ? per.ate : hoje;
  const meses = ultimos12(ref);
  const ini24 = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - 23, 1));
  const fim24 = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0));
  const [atual, anterior, historico] = await Promise.all([itensVendidos(per, f), itensVendidos(ant, f), itensVendidos({ de: ini24, ate: fim24 }, f)]);

  const porMes = new Map<string, ItemVendido[]>();
  for (const i of historico) {
    const k = chaveMes(new Date(i.data));
    porMes.set(k, [...(porMes.get(k) ?? []), i]);
  }
  const anoAntes = (c: string) => `${Number(c.slice(0, 4)) - 1}${c.slice(4)}`;
  const mensal = meses.map((m) => {
    const t = totais(porMes.get(m.chave) ?? []);
    return { ...m, receita: t.receita, lucro: t.lucro, margem: t.margem, anoAnterior: totais(porMes.get(anoAntes(m.chave)) ?? []).receita };
  });

  const vendedores = await vendedoresComVenda(ini24);

  return {
    atual: totais(atual),
    anterior: totais(anterior),
    periodoAnterior: ant,
    mensal,
    clientes: ranking(atual, (i) => [i.clienteId ?? "-", i.cliente ?? "Sem cliente"]),
    produtos: ranking(atual, (i) => (i.tipo === "PRODUTO" ? [i.itemId, i.nome] : null)),
    servicos: ranking(atual, (i) => (i.tipo === "SERVICO" ? [i.itemId, i.nome] : null)),
    vendedores,
  };
}
export type PainelRelatorios = Awaited<ReturnType<typeof painelRelatorios>>;

/** Vendedores que aparecem em vendas ou OS da loja desde `desde` (para o filtro do painel). */
async function vendedoresComVenda(desde: Date) {
  const lv = await sqlDaLoja(`v."empresaId"`), lo = await sqlDaLoja(`o."empresaId"`);
  return prisma.$queryRaw<{ id: string; nome: string }[]>`
    SELECT u.id, u.nome FROM "Usuario" u WHERE u.id IN (
      SELECT v."vendedorId" FROM "Venda" v WHERE v.data >= ${desde}${lv}
      UNION SELECT o."vendedorId" FROM "OrdemServico" o WHERE o.entrada >= ${desde}${lo}
    ) ORDER BY u.nome`;
}

/** Linhas "A × B" de um agrupamento: valor em cada período, ordenadas pelo maior dos dois. */
function lado(a: ItemVendido[], b: ItemVendido[], chave: (i: ItemVendido) => [string, string] | null, n = 10) {
  const m = new Map<string, { chave: string; rotulo: string; a: number; b: number }>();
  const somar = (itens: ItemVendido[], k: "a" | "b") => {
    for (const i of itens) {
      const c = chave(i);
      if (!c) continue;
      const g = m.get(c[0]) ?? { chave: c[0], rotulo: c[1], a: 0, b: 0 };
      g[k] += i.receita;
      m.set(c[0], g);
    }
  };
  somar(a, "a"); somar(b, "b");
  return [...m.values()].map((g) => ({ ...g, a: r2(g.a), b: r2(g.b) })).sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b)).slice(0, n);
}

/** Compara dois períodos lado a lado (ex.: dois meses): totais, canais, clientes, produtos e vendedores. */
export async function compararPeriodos(pa: Periodo, pb: Periodo, f: FiltroVendas = {}) {
  const [a, b] = await Promise.all([itensVendidos(pa, f), itensVendidos(pb, f)]);
  return {
    a: totais(a), b: totais(b),
    canais: lado(a, b, (i) => [i.canal?.trim() || "Sem canal", i.canal?.trim() || "Sem canal"]),
    clientes: lado(a, b, (i) => [i.clienteId ?? "-", i.cliente ?? "Sem cliente"]),
    produtos: lado(a, b, (i) => (i.tipo === "PRODUTO" ? [i.itemId, i.nome] : null)),
    servicos: lado(a, b, (i) => (i.tipo === "SERVICO" ? [i.itemId, i.nome] : null)),
    vendedores: lado(a, b, (i) => [i.vendedorId ?? "-", i.vendedor ?? "Sem vendedor"]),
  };
}
