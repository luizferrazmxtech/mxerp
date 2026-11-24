import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { periodoInstantes } from "@/lib/estoque/periodo";
import { DINHEIRO, diferencaTotal, lerConferencia, type Conferencia } from "./caixa";

export type ParamsCaixas = Record<string, string | undefined>;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Caixas que o usuário sem a permissão pdv.caixas vê: o aberto, os que ele abriu e aqueles em que vendeu ou mexeu. */
export const caixasDoUsuario = (usuarioId: string): Prisma.CaixaPdvWhereInput => ({
  OR: [{ fechadoEm: null }, { usuarioId }, { fechadoPorId: usuarioId }, { vendas: { some: { vendedorId: usuarioId } } }, { movimentos: { some: { usuarioId } } }],
});

/** Filtro da lista de caixas: período de abertura, operador e situação. Sem `todos`, só os caixas do usuário (caixasDoUsuario). */
export function whereCaixas(sp: ParamsCaixas, usuario: { id: string; todos: boolean }) {
  const per = periodoInstantes(sp.periodo, sp.pde, sp.pate);
  const w: Prisma.CaixaPdvWhereInput[] = [];
  if (per.filtro) w.push({ abertoEm: per.filtro });
  if (!usuario.todos) w.push(caixasDoUsuario(usuario.id));
  if (usuario.todos && sp.op) w.push({ usuarioId: sp.op });
  if (sp.sit === "aberto") w.push({ fechadoEm: null });
  if (sp.sit === "fechado") w.push({ fechadoEm: { not: null } });
  if (sp.q && /^\d+$/.test(sp.q.trim())) w.push({ numero: Number(sp.q.trim()) });
  return { where: { AND: w } satisfies Prisma.CaixaPdvWhereInput, rotulo: per.rotulo };
}

export type LinhaCaixa = Awaited<ReturnType<typeof linhasCaixas>>[number];

/**
 * Totais de cada caixa (vendas concretizadas por forma, sangrias, reforços, dinheiro esperado, contado e diferença),
 * com poucas consultas para a lista inteira. Caixa fechado usa a conferência gravada no fechamento.
 */
export async function linhasCaixas(where: Prisma.CaixaPdvWhereInput) {
  const caixas = await prisma.caixaPdv.findMany({
    where, orderBy: [{ abertoEm: "desc" }],
    include: { usuario: { select: { id: true, nome: true } }, fechadoPor: { select: { nome: true } } },
  });
  const ids = caixas.map((c) => c.id);
  if (!ids.length) return [];
  const [pags, qtd, movs] = await Promise.all([
    prisma.vendaPagamento.findMany({ where: { venda: { caixaId: { in: ids }, situacao: "CONCLUIDA" } }, select: { valor: true, formaPagamento: { select: { nome: true } }, venda: { select: { caixaId: true } } } }),
    prisma.venda.groupBy({ by: ["caixaId"], where: { caixaId: { in: ids }, situacao: "CONCLUIDA" }, _count: true }),
    prisma.movimentoCaixa.groupBy({ by: ["caixaId", "tipo"], where: { caixaId: { in: ids } }, _sum: { valor: true } }),
  ]);
  const formas = new Map<string, Map<string, number>>();
  for (const p of pags) {
    const m = formas.get(p.venda.caixaId!) ?? new Map<string, number>();
    m.set(p.formaPagamento.nome, (m.get(p.formaPagamento.nome) ?? 0) + Number(p.valor));
    formas.set(p.venda.caixaId!, m);
  }
  return caixas.map((c) => {
    const pf = formas.get(c.id) ?? new Map<string, number>();
    const mov = (t: "SANGRIA" | "SUPRIMENTO") => Number(movs.find((m) => m.caixaId === c.id && m.tipo === t)?._sum.valor ?? 0);
    const sangrias = r2(mov("SANGRIA")), reforcos = r2(mov("SUPRIMENTO"));
    const vendido = r2([...pf.values()].reduce((s, v) => s + v, 0));
    const esperadoAgora = r2(Number(c.valorAbertura) + (pf.get(DINHEIRO) ?? 0) + reforcos - sangrias);
    const conferencia = lerConferencia(c.conferencia);
    const aberto = !c.fechadoEm;
    // fechado antes da conferência por forma: só o dinheiro contado
    const esperado = aberto ? esperadoAgora : c.valorEsperado != null ? Number(c.valorEsperado) : esperadoAgora;
    const contado = c.valorFechamento != null ? Number(c.valorFechamento) : null;
    const diferenca = aberto ? null : conferencia ? diferencaTotal(conferencia) : contado != null ? r2(contado - esperado) : null;
    return {
      id: c.id, numero: c.numero, operador: c.usuario, fechadoPor: c.fechadoPor?.nome ?? null, abertoEm: c.abertoEm, fechadoEm: c.fechadoEm,
      abertura: Number(c.valorAbertura), vendas: qtd.find((q) => q.caixaId === c.id)?._count ?? 0, vendido,
      porForma: [...pf].map(([f, v]) => [f, r2(v)] as [string, number]).sort((a, b) => b[1] - a[1]),
      sangrias, reforcos, esperado, contado, diferenca, conferencia, aberto, observacao: c.observacao,
    };
  });
}

/** Conferência para mostrar: a gravada ou, num caixa aberto/antigo, a esperada com o dinheiro contado (se houver). */
export function conferenciaDe(l: LinhaCaixa): Conferencia[] {
  if (l.conferencia) return l.conferencia;
  const din: Conferencia = { forma: DINHEIRO, esperado: l.esperado, contado: l.contado ?? l.esperado };
  return [din, ...l.porForma.filter(([f]) => f !== DINHEIRO).map(([forma, v]) => ({ forma, esperado: v, contado: v }))];
}
