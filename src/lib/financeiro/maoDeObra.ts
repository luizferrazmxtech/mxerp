import { prisma } from "@/lib/db";
import { todasAsLojas, LOJA_ATUAL } from "@/lib/empresa/loja";
import { diaSP } from "@/lib/datas";
import { CATEGORIAS_PESSOAL, garantirCategoriasPessoal, type TipoPagamentoPessoal } from "./padroes";

/**
 * Folha e gasto com mão de obra, pela competência: pagamentos a funcionários (as subcategorias de "Salários e
 * encargos" que a conciliação usa) e as demais contas do grupo (encargos, benefícios). Cada pagamento é ligado ao
 * funcionário pelo cadastro (lançado pela conciliação) ou pelo nome no fim da descrição ("Salário 10/2026 - FULANO").
 */

export type TipoMaoDeObra = TipoPagamentoPessoal | "ENCARGOS";
export const TIPOS_MAO_DE_OBRA: { tipo: TipoMaoDeObra; rotulo: string }[] = [
  { tipo: "SALARIO", rotulo: "Salário" },
  { tipo: "ADIANTAMENTO", rotulo: "Adiantamento" },
  { tipo: "FERIAS", rotulo: "Férias" },
  { tipo: "DECIMO", rotulo: "13º" },
  { tipo: "OUTROS", rotulo: "Outros pagamentos" },
  { tipo: "ENCARGOS", rotulo: "Encargos e benefícios" },
];
const vazio = (): Record<TipoMaoDeObra, number> => ({ SALARIO: 0, ADIANTAMENTO: 0, FERIAS: 0, DECIMO: 0, OUTROS: 0, ENCARGOS: 0 });
const r2 = (v: number) => Math.round(v * 100) / 100;
const mesDe = (d: Date) => d.toISOString().slice(0, 7);

export type PagamentoFolha = { id: string; tipo: TipoMaoDeObra; valor: number; competencia: Date; pagoEm: Date | null; descricao: string; funcionarioId: string | null };
export type FuncionarioFolha = { id: string; nome: string; salario: number | null; ativo: boolean };

export type LinhaFolha = {
  id: string; nome: string; salario: number | null; salarioOrigem: "cadastro" | "último pago" | null;
  porTipo: Record<TipoMaoDeObra, number>; total: number; pagamentos: number; alertas: string[];
};

/** Nome do funcionário no fim da descrição: "Salário 10/2026 - FULANO DE TAL" → "FULANO DE TAL". */
export const nomeNaDescricao = (d: string) => (d.includes(" - ") ? d.split(" - ").slice(1).join(" - ").trim().toUpperCase() : "");

/**
 * Pura: folha do mês por funcionário, com os alertas. `hoje` decide se o salário do mês já devia ter sido pago
 * (até o dia 10 do mês seguinte).
 */
export function montarFolha(mes: string, pagamentos: PagamentoFolha[], funcionarios: FuncionarioFolha[], hoje: Date, salarioRef: Map<string, number> = new Map()): { linhas: LinhaFolha[]; semFuncionario: number } {
  const porNome = new Map(funcionarios.map((f) => [f.nome.toUpperCase(), f.id]));
  const linhas = new Map<string, LinhaFolha>();
  let semFuncionario = 0;
  const contagem = new Map<string, Record<TipoMaoDeObra, number>>();
  for (const p of pagamentos) {
    if (mesDe(p.competencia) !== mes || p.tipo === "ENCARGOS") continue;
    const fid = p.funcionarioId ?? porNome.get(nomeNaDescricao(p.descricao)) ?? null;
    const f = fid ? funcionarios.find((x) => x.id === fid) : null;
    if (!f) { semFuncionario = r2(semFuncionario + p.valor); continue; }
    const l = linhas.get(f.id) ?? novaLinha(f, salarioRef);
    l.porTipo[p.tipo] = r2(l.porTipo[p.tipo] + p.valor);
    l.total = r2(l.total + p.valor);
    l.pagamentos++;
    linhas.set(f.id, l);
    const c = contagem.get(f.id) ?? vazio();
    c[p.tipo]++;
    contagem.set(f.id, c);
  }
  // quem está ativo e não recebeu nada aparece também (para o alerta de salário faltando)
  for (const f of funcionarios) if (f.ativo && !linhas.has(f.id) && (f.salario || salarioRef.has(f.id))) linhas.set(f.id, novaLinha(f, salarioRef));

  const [a, m] = mes.split("-").map(Number);
  const prazoSalario = new Date(Date.UTC(a, m, 10)); // dia 10 do mês seguinte
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  for (const l of linhas.values()) {
    const c = contagem.get(l.id) ?? vazio();
    if (c.SALARIO >= 2) l.alertas.push(`${c.SALARIO} pagamentos de salário no mês: confira se não pagou em dobro`);
    if (!c.SALARIO && hoje > prazoSalario && (l.salario || l.total)) l.alertas.push("salário do mês não foi pago (ou não foi conciliado)");
    if (c.ADIANTAMENTO && !c.SALARIO && hoje > prazoSalario) l.alertas.push("teve adiantamento mas não teve salário");
    const pago = l.porTipo.SALARIO + l.porTipo.ADIANTAMENTO;
    if (l.salario && pago > l.salario * 1.05 + 0.01) l.alertas.push(`salário + adiantamento (${fmt(pago)}) passam do salário de ${fmt(l.salario)}`);
    if (l.salario && c.SALARIO && hoje > prazoSalario && pago < l.salario * 0.95 - 0.01) l.alertas.push(`pago ${fmt(pago)}, abaixo do salário de ${fmt(l.salario)}`);
  }
  return { linhas: [...linhas.values()].sort((x, y) => y.total - x.total || x.nome.localeCompare(y.nome)), semFuncionario };
}

function novaLinha(f: FuncionarioFolha, ref: Map<string, number>): LinhaFolha {
  const salario = f.salario ?? ref.get(f.id) ?? null;
  return { id: f.id, nome: f.nome, salario, salarioOrigem: f.salario != null ? "cadastro" : ref.has(f.id) ? "último pago" : null, porTipo: vazio(), total: 0, pagamentos: 0, alertas: [] };
}

/** Painel: últimos `meses` meses até `mes` (AAAA-MM) e a folha de `mes`. */
export async function painelMaoDeObra(mes: string, meses = 12) {
  const [a, m] = mes.split("-").map(Number);
  const inicio = new Date(Date.UTC(a, m - meses, 1));
  const fim = new Date(Date.UTC(a, m, 0));
  const cats = await prisma.$transaction((tx) => garantirCategoriasPessoal(tx));
  const tipoPorCat = new Map<string, TipoMaoDeObra>(Object.entries(cats).map(([t, id]) => [id, t as TipoMaoDeObra]));
  // demais contas do grupo "Salários e encargos" (FGTS, INSS, vale-transporte...)
  const pai = await prisma.categoriaFinanceira.findUnique({ where: { empresaId_nome_tipo: { empresaId: LOJA_ATUAL, nome: "Salários e encargos", tipo: "PAGAR" } } });
  if (pai) {
    const filhos = await prisma.categoriaFinanceira.findMany({ where: { OR: [{ id: pai.id }, { paiId: pai.id }] }, select: { id: true } });
    for (const f of filhos) if (!tipoPorCat.has(f.id)) tipoPorCat.set(f.id, "ENCARGOS");
  }
  const [ls, receitas, funcs] = await todasAsLojas(() => Promise.all([
    prisma.lancamento.findMany({
      where: { tipo: "PAGAR", categoriaId: { in: [...tipoPorCat.keys()] }, competencia: { gte: inicio, lte: fim }, transferenciaId: null },
      select: { id: true, categoriaId: true, valor: true, valorPago: true, competencia: true, pagoEm: true, descricao: true, funcionarioId: true },
    }),
    prisma.lancamento.groupBy({ by: ["competencia"], where: { tipo: "RECEBER", competencia: { gte: inicio, lte: fim }, transferenciaId: null }, _sum: { valor: true } }),
    prisma.usuario.findMany({ select: { id: true, nome: true, salario: true, ativo: true }, orderBy: { nome: "asc" } }),
  ]));
  const pagamentos: PagamentoFolha[] = ls.map((l) => ({
    id: l.id, tipo: tipoPorCat.get(l.categoriaId)!, valor: Number(l.valorPago ?? l.valor), competencia: l.competencia, pagoEm: l.pagoEm, descricao: l.descricao, funcionarioId: l.funcionarioId,
  }));
  const porMes = new Map<string, { porTipo: Record<TipoMaoDeObra, number>; total: number; receita: number }>();
  for (let i = 0; i < meses; i++) porMes.set(mesDe(new Date(Date.UTC(a, m - meses + i, 1))), { porTipo: vazio(), total: 0, receita: 0 });
  for (const p of pagamentos) {
    const x = porMes.get(mesDe(p.competencia));
    if (!x) continue;
    x.porTipo[p.tipo] = r2(x.porTipo[p.tipo] + p.valor);
    x.total = r2(x.total + p.valor);
  }
  for (const r of receitas) { const x = porMes.get(mesDe(r.competencia)); if (x) x.receita = r2(x.receita + Number(r._sum.valor ?? 0)); }
  // salário de referência quando o cadastro não tem: o último salário lançado de cada um
  const ref = new Map<string, number>();
  const porNome = new Map(funcs.map((f) => [f.nome.toUpperCase(), f.id]));
  for (const p of [...pagamentos].filter((p) => p.tipo === "SALARIO").sort((x, y) => y.competencia.getTime() - x.competencia.getTime())) {
    const fid = p.funcionarioId ?? porNome.get(nomeNaDescricao(p.descricao));
    if (fid && !ref.has(fid)) ref.set(fid, p.valor);
  }
  const folha = montarFolha(mes, pagamentos, funcs.map((f) => ({ id: f.id, nome: f.nome, salario: f.salario != null ? Number(f.salario) : null, ativo: f.ativo })), diaSP(), ref);
  return { meses: [...porMes].map(([mes, v]) => ({ mes, ...v })), folha, rotulos: CATEGORIAS_PESSOAL };
}
