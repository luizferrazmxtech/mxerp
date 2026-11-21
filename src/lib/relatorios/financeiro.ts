import { prisma } from "@/lib/db";
import { diaSP, somarDias } from "@/lib/datas";
import { fluxoCaixa } from "@/lib/financeiro/fluxo";
import { painelMaoDeObra } from "@/lib/financeiro/maoDeObra";
import type { Periodo } from "./relatorios";

/**
 * Painel financeiro dos relatórios: saldo projetado, inadimplência por faixa de atraso,
 * despesas por categoria e mão de obra sobre a receita.
 */
const r2 = (v: number) => Math.round(v * 100) / 100;

export const FAIXAS_ATRASO = [
  { chave: "1-30", rotulo: "1 a 30 dias", de: 1, ate: 30 },
  { chave: "31-60", rotulo: "31 a 60 dias", de: 31, ate: 60 },
  { chave: "61-90", rotulo: "61 a 90 dias", de: 61, ate: 90 },
  { chave: "90+", rotulo: "Mais de 90 dias", de: 91, ate: 100000 },
] as const;

/** Contas a receber vencidas e em aberto, por faixa de atraso, e os maiores devedores. */
export async function inadimplencia(hoje = diaSP()) {
  const ls = await prisma.lancamento.findMany({
    where: { tipo: "RECEBER", pagoEm: null, vencimento: { lt: hoje }, transferenciaId: null },
    select: { valor: true, vencimento: true, pessoaId: true, pessoa: { select: { nome: true } } },
  });
  const faixas = FAIXAS_ATRASO.map((f) => ({
    ...f, valor: 0, contas: 0,
    // período de vencimento da faixa (para abrir a lista de contas já filtrada)
    vencDe: somarDias(hoje, -f.ate), vencAte: somarDias(hoje, -f.de),
  }));
  const devedores = new Map<string, { id: string | null; nome: string; valor: number; contas: number; maisAntigo: Date }>();
  for (const l of ls) {
    const dias = Math.round((hoje.getTime() - l.vencimento.getTime()) / 86400000);
    const f = faixas.find((x) => dias >= x.de && dias <= x.ate) ?? faixas[faixas.length - 1];
    f.valor += Number(l.valor); f.contas += 1;
    const k = l.pessoaId ?? "-";
    const d = devedores.get(k) ?? { id: l.pessoaId, nome: l.pessoa?.nome ?? "Sem cliente", valor: 0, contas: 0, maisAntigo: l.vencimento };
    d.valor += Number(l.valor); d.contas += 1; if (l.vencimento < d.maisAntigo) d.maisAntigo = l.vencimento;
    devedores.set(k, d);
  }
  return {
    total: r2(faixas.reduce((s, f) => s + f.valor, 0)),
    contas: ls.length,
    faixas: faixas.map((f) => ({ ...f, valor: r2(f.valor) })),
    devedores: [...devedores.values()].sort((a, b) => b.valor - a.valor).slice(0, 8).map((d) => ({ ...d, valor: r2(d.valor) })),
  };
}

/** Despesas (contas a pagar) do período pelo vencimento, agrupadas na categoria principal (a "mãe"). */
export async function despesasPorCategoria(p: Periodo) {
  const grupos = await prisma.lancamento.groupBy({
    by: ["categoriaId"], _sum: { valor: true }, _count: true,
    where: { tipo: "PAGAR", transferenciaId: null, vencimento: { gte: p.de, lt: somarDias(p.ate, 1) } },
  });
  const cats = await prisma.categoriaFinanceira.findMany({
    where: { id: { in: grupos.map((g) => g.categoriaId) } }, select: { id: true, nome: true, pai: { select: { id: true, nome: true } } },
  });
  const m = new Map<string, { id: string; nome: string; valor: number; contas: number }>();
  for (const g of grupos) {
    const c = cats.find((x) => x.id === g.categoriaId);
    const raiz = c?.pai ?? c ?? { id: g.categoriaId, nome: "Sem categoria" };
    const x = m.get(raiz.id) ?? { id: raiz.id, nome: raiz.nome, valor: 0, contas: 0 };
    x.valor += Number(g._sum.valor ?? 0); x.contas += g._count;
    m.set(raiz.id, x);
  }
  const linhas = [...m.values()].map((x) => ({ ...x, valor: r2(x.valor) })).sort((a, b) => b.valor - a.valor);
  return { linhas, total: r2(linhas.reduce((s, l) => s + l.valor, 0)) };
}

/** Saldo de todas as contas dia a dia nos próximos `dias`: o que já está no banco + contas em aberto pelo vencimento. */
export async function saldoProjetado(dias = 90, hoje = diaSP()) {
  const f = await fluxoCaixa({ de: hoje, ate: somarDias(hoje, dias - 1), hoje });
  const pontos = f.dias.map((d) => ({ dia: d.dia, saldo: d.previsto, entradas: d.entradas, saidas: d.saidas }));
  const menor = pontos.reduce((m, p) => (p.saldo < m.saldo ? p : m), pontos[0] ?? { dia: hoje, saldo: 0, entradas: 0, saidas: 0 });
  return {
    hoje: r2(f.saldoAnterior + f.recebido - f.pago), // saldo atual (já recebido hoje entra)
    final: pontos.at(-1)?.saldo ?? 0,
    menor,
    primeiroNegativo: pontos.find((p) => p.saldo < 0) ?? null,
    atrasadoReceber: r2(f.atrasadoReceber), atrasadoPagar: r2(f.atrasadoPagar),
    pontos,
  };
}

/** Mão de obra (folha + encargos) sobre a receita, mês a mês (competência). */
export async function maoDeObraSobreReceita(mes: string, meses = 12) {
  const { meses: ms } = await painelMaoDeObra(mes, meses);
  return ms.map((m) => ({ mes: m.mes, maoDeObra: m.total, receita: m.receita, pct: m.receita > 0 ? m.total / m.receita : null }));
}
