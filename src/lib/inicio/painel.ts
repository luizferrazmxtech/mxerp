/**
 * Números da tela inicial (dashboard). Cada bloco só é calculado se a pessoa pode ver a área:
 * financeiro e vendas ficam com quem tem acesso a essas telas.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { lojaAtualId, sqlDaLoja } from "@/lib/empresa/loja";
import { sqlServicosFora } from "@/lib/os/faturamento";
import { diaSP, mesesRecentes, rotuloMesCurto, somarDias } from "@/lib/datas";
import { saldosContas } from "@/lib/financeiro/lancamentos";

const FUSO = "America/Sao_Paulo";
const ABERTAS = ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_PECA", "AGUARDANDO_APROVACAO"];
/** Situações em que a OS saiu do fluxo (não aparecem em "OS por situação"). */
const ENCERRADAS = ["FATURADA", "CANCELADA", "DEVOLVIDA_SEM_REPARO"];

export type Mes = { chave: string; rotulo: string };
export type OpcoesPainel = { financeiro: boolean; vendas: boolean; meses?: number; agora?: Date };

/** Os últimos n meses, do mais antigo para o atual. */
export function mesesDoPainel(n = 6): Mes[] {
  return mesesRecentes(n).reverse().map((m) => ({ chave: m.chave, rotulo: rotuloMesCurto(m.chave).slice(0, 3).toLowerCase() }));
}

const porChave = <T extends { m: string }>(rows: T[]) => new Map(rows.map((r) => [r.m, r]));

async function financeiro(meses: Mes[], hoje: Date) {
  const ini = new Date(`${meses[0].chave}-01T00:00:00Z`);
  const mesAtual = meses[meses.length - 1].chave;
  const iniMes = new Date(`${mesAtual}-01T00:00:00Z`);
  const fimMes = new Date(Date.UTC(iniMes.getUTCFullYear(), iniMes.getUTCMonth() + 1, 1));

  const fl = await sqlDaLoja(`"empresaId"`);
  const [fluxo, dia, mes, contas] = await Promise.all([
    prisma.$queryRaw<{ m: string; rec: number; pag: number }[]>`
      SELECT to_char("pagoEm", 'YYYY-MM') m,
             COALESCE(SUM(COALESCE("valorPago", valor)) FILTER (WHERE tipo = 'RECEBER'), 0)::float rec,
             COALESCE(SUM(COALESCE("valorPago", valor)) FILTER (WHERE tipo = 'PAGAR'), 0)::float pag
        FROM "Lancamento" WHERE "pagoEm" >= ${ini} ${fl} GROUP BY 1`,
    prisma.$queryRaw<{ tipo: string; hoje: number; nHoje: number; vencido: number; nVencido: number; semana: number }[]>`
      SELECT tipo::text,
             COALESCE(SUM(valor) FILTER (WHERE vencimento = ${hoje}), 0)::float hoje,
             COUNT(*) FILTER (WHERE vencimento = ${hoje})::int "nHoje",
             COALESCE(SUM(valor) FILTER (WHERE vencimento < ${hoje}), 0)::float vencido,
             COUNT(*) FILTER (WHERE vencimento < ${hoje})::int "nVencido",
             COALESCE(SUM(valor) FILTER (WHERE vencimento > ${hoje} AND vencimento <= ${somarDias(hoje, 7)}), 0)::float semana
        FROM "Lancamento" WHERE "pagoEm" IS NULL ${fl} GROUP BY 1`,
    prisma.$queryRaw<{ tipo: string; feito: number; previsto: number }[]>`
      SELECT tipo::text,
             COALESCE(SUM(COALESCE("valorPago", valor)) FILTER (WHERE "pagoEm" >= ${iniMes} AND "pagoEm" < ${fimMes}), 0)::float feito,
             COALESCE(SUM(valor) FILTER (WHERE vencimento >= ${iniMes} AND vencimento < ${fimMes}), 0)::float previsto
        FROM "Lancamento" WHERE true ${fl} GROUP BY 1`,
    prisma.$transaction((tx) => saldosContas(tx)),
  ]);
  const f = porChave(fluxo);
  const serie = meses.map((m) => {
    const r = f.get(m.chave);
    const rec = r?.rec ?? 0, pag = r?.pag ?? 0;
    return { ...m, recebimentos: rec, pagamentos: pag, saldo: rec - pag };
  });
  const d = (t: string) => dia.find((x) => x.tipo === t) ?? { hoje: 0, nHoje: 0, vencido: 0, nVencido: 0, semana: 0 };
  const ms = (t: string) => mes.find((x) => x.tipo === t) ?? { feito: 0, previsto: 0 };
  return {
    fluxo: serie,
    receber: { ...d("RECEBER"), mes: ms("RECEBER") },
    pagar: { ...d("PAGAR"), mes: ms("PAGAR") },
    contas,
    saldoTotal: contas.reduce((s, c) => s + c.saldo, 0),
  };
}

async function vendas(meses: Mes[]) {
  const ini = new Date(`${meses[0].chave}-01T00:00:00-03:00`);
  const fl = await sqlDaLoja(`"empresaId"`), flo = await sqlDaLoja(`o."empresaId"`);
  const loja = await lojaAtualId();
  const daLojaServ = loja ? Prisma.sql` AND o."empresaServicosId" = ${loja}` : Prisma.empty;
  const [v, o] = await Promise.all([
    prisma.$queryRaw<{ m: string; total: number; n: number }[]>`
      SELECT to_char(data AT TIME ZONE 'UTC' AT TIME ZONE ${FUSO}, 'YYYY-MM') m, SUM(total)::float total, COUNT(*)::int n
        FROM "Venda" WHERE situacao = 'CONCLUIDA' AND data >= ${ini} ${fl} GROUP BY 1`,
    // serviços faturados por outra empresa (ex.: VFX): saem do total da empresa da OS e entram no da empresa dos serviços
    prisma.$queryRaw<{ m: string; total: number; n: number }[]>`
      SELECT m, SUM(v)::float total, COUNT(*)::int n FROM (
        SELECT to_char(COALESCE(o.saida, o.entrada) AT TIME ZONE 'UTC' AT TIME ZONE ${FUSO}, 'YYYY-MM') m, o.total - ${sqlServicosFora()} v
          FROM "OrdemServico" o WHERE o.situacao IN ('CONCLUIDA', 'FATURADA') AND COALESCE(o.saida, o.entrada) >= ${ini} ${flo}
        UNION ALL
        SELECT to_char(COALESCE(o.saida, o.entrada) AT TIME ZONE 'UTC' AT TIME ZONE ${FUSO}, 'YYYY-MM'), ${sqlServicosFora()}
          FROM "OrdemServico" o WHERE o.situacao IN ('CONCLUIDA', 'FATURADA') AND COALESCE(o.saida, o.entrada) >= ${ini} AND ${sqlServicosFora()} > 0 ${daLojaServ}
      ) x GROUP BY 1`,
  ]);
  const pv = porChave(v), po = porChave(o);
  return meses.map((m) => {
    const a = pv.get(m.chave), b = po.get(m.chave);
    return { ...m, vendas: a?.total ?? 0, nVendas: a?.n ?? 0, os: b?.total ?? 0, nOs: b?.n ?? 0 };
  });
}

async function ordens(meses: Mes[], agora: Date) {
  const ini = new Date(`${meses[0].chave}-01T00:00:00-03:00`);
  const fl = await sqlDaLoja(`"empresaId"`), flo = await sqlDaLoja(`o."empresaId"`);
  const [porMes, situacoes, abertas, falta] = await Promise.all([
    prisma.$queryRaw<{ m: string; entradas: number; concluidas: number }[]>`
      SELECT m, SUM(e)::int entradas, SUM(c)::int concluidas FROM (
        SELECT to_char(entrada AT TIME ZONE 'UTC' AT TIME ZONE ${FUSO}, 'YYYY-MM') m, 1 e, 0 c
          FROM "OrdemServico" WHERE entrada >= ${ini} ${fl}
        UNION ALL
        SELECT to_char(COALESCE(saida, entrada) AT TIME ZONE 'UTC' AT TIME ZONE ${FUSO}, 'YYYY-MM'), 0, 1
          FROM "OrdemServico" WHERE situacao IN ('CONCLUIDA', 'FATURADA') AND COALESCE(saida, entrada) >= ${ini} ${fl}
      ) x GROUP BY m`,
    prisma.$queryRaw<{ id: string | null; nome: string; cor: string; n: number; total: number }[]>`
      SELECT s.id, COALESCE(s.nome, o.situacao::text) nome, COALESCE(s.cor, 'cinza') cor, COUNT(*)::int n, SUM(o.total)::float total
        FROM "OrdemServico" o LEFT JOIN "SituacaoOsConfig" s ON s.id = o."situacaoId"
       WHERE o.situacao::text NOT IN (${ENCERRADAS[0]}, ${ENCERRADAS[1]}, ${ENCERRADAS[2]}) ${flo}
       GROUP BY 1, 2, 3, s.ordem ORDER BY s.ordem NULLS LAST, 2`,
    prisma.ordemServico.findMany({ where: { situacao: { in: ABERTAS as never } }, select: { previsao: true, total: true } }),
    prisma.reserva.findMany({ where: { origemTipo: "OS", status: "ATIVA", localId: null }, select: { origemId: true }, distinct: ["origemId"] }),
  ]);
  const pm = porChave(porMes);
  return {
    porMes: meses.map((m) => ({ ...m, entradas: pm.get(m.chave)?.entradas ?? 0, concluidas: pm.get(m.chave)?.concluidas ?? 0 })),
    situacoes,
    abertas: abertas.length,
    valorAbertas: abertas.reduce((s, o) => s + Number(o.total), 0),
    atrasadas: abertas.filter((o) => o.previsao && o.previsao < agora).length,
    comFalta: falta.length,
  };
}

async function estoque() {
  const [falta, baixo] = await Promise.all([
    prisma.$queryRaw<{ id: string; codigo: string; nome: string; unidade: string; falta: number; docs: number }[]>`
      SELECT p.id, p.codigo, p.nome, p.unidade, SUM(r.quantidade)::float falta, COUNT(DISTINCT r."origemId")::int docs
        FROM "Reserva" r JOIN "Produto" p ON p.id = r."produtoId"
       WHERE r.status = 'ATIVA' AND r."localId" IS NULL
       GROUP BY p.id ORDER BY docs DESC, falta DESC, p.nome`,
    prisma.$queryRaw<{ id: string; codigo: string; nome: string; unidade: string; saldo: number; minimo: number }[]>`
      SELECT p.id, p.codigo, p.nome, p.unidade, COALESCE(s.q, 0)::float saldo, p."estoqueMinimo"::float minimo
        FROM "Produto" p LEFT JOIN (SELECT "produtoId", SUM(quantidade) q FROM "Saldo" GROUP BY 1) s ON s."produtoId" = p.id
       WHERE p.ativo AND p."controlaEstoque" AND p."estoqueMinimo" > 0 AND COALESCE(s.q, 0) < p."estoqueMinimo"
       ORDER BY COALESCE(s.q, 0) / p."estoqueMinimo", p.nome`,
  ]);
  return { falta, baixo };
}

/** Orçamento em aberto: ainda não virou venda/OS e a situação não é de fechamento (concretizado, cancelado, recusado…). */
async function orcamentos(agora: Date) {
  const where = {
    vendaId: null, osId: null,
    situacao: { geraVenda: false, NOT: [{ nome: { contains: "cancel", mode: "insensitive" as const } }, { nome: { contains: "recus", mode: "insensitive" as const } }, { nome: { contains: "perd", mode: "insensitive" as const } }] },
  };
  const ini30 = somarDias(diaSP(agora), -30);
  const [todos, recentes, ultimos] = await Promise.all([
    prisma.orcamento.aggregate({ where, _count: true, _sum: { total: true } }),
    prisma.orcamento.aggregate({ where: { ...where, data: { gte: ini30 } }, _count: true, _sum: { total: true } }),
    prisma.orcamento.findMany({
      where, orderBy: [{ data: "desc" }, { numero: "desc" }], take: 6,
      select: { id: true, numero: true, data: true, total: true, tipo: true, cliente: { select: { nome: true, fantasia: true } }, situacao: { select: { nome: true, cor: true } } },
    }),
  ]);
  return {
    n: todos._count, total: Number(todos._sum.total ?? 0),
    n30: recentes._count, total30: Number(recentes._sum.total ?? 0),
    ultimos,
  };
}

export async function dadosPainel(op: OpcoesPainel) {
  const agora = op.agora ?? new Date();
  const meses = mesesDoPainel(op.meses ?? 6);
  const hoje = diaSP(agora);
  const [fin, ven, os, est, orc] = await Promise.all([
    op.financeiro ? financeiro(meses, hoje) : null,
    op.vendas ? vendas(meses) : null,
    ordens(meses, agora),
    estoque(),
    orcamentos(agora),
  ]);
  return { meses, financeiro: fin, vendas: ven, os, estoque: est, orcamentos: orc };
}

export type DadosPainel = Awaited<ReturnType<typeof dadosPainel>>;
