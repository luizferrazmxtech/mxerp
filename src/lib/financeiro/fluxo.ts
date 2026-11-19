import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { somarDias } from "@/lib/datas";

/**
 * Fluxo de caixa (como o do Gestão Click): o realizado vem dos lançamentos baixados (data do pagamento e valor
 * pago, na conta onde caiu), o previsto vem das contas em aberto pelo vencimento. Transferências entre contas
 * entram quando o filtro é uma conta só (dinheiro saindo/entrando dela) e somem no total de todas as contas.
 */
export type LinhaFluxo = {
  id: string; data: Date; tipo: "RECEBER" | "PAGAR"; descricao: string; pessoa: string | null; categoria: string; centro: string | null;
  conta: string | null; valor: number; realizado: boolean; vencido: boolean; transferencia: boolean;
};

export type FiltroFluxo = { de: Date; ate: Date; contaId?: string; centroCustoId?: string; hoje: Date };

const fim = (d: Date) => somarDias(d, 1);

export async function fluxoCaixa(f: FiltroFluxo) {
  const todasContas = !f.contaId;
  // nas visões de todas as contas a transferência não é entrada nem saída de dinheiro da empresa
  const semTransf = todasContas ? Prisma.sql`AND l."transferenciaId" IS NULL` : Prisma.empty;
  const daConta = f.contaId ? Prisma.sql`AND l."contaBancariaId" = ${f.contaId}` : Prisma.empty;
  const doCentro = f.centroCustoId ? Prisma.sql`AND l."centroCustoId" = ${f.centroCustoId}` : Prisma.empty;

  // saldo anterior = saldo inicial das contas + tudo o que foi baixado antes do período (independe de centro de custo)
  const [ant] = await prisma.$queryRaw<{ saldo: number }[]>`
    SELECT (COALESCE((SELECT SUM("saldoInicial") FROM "ContaBancaria" c WHERE ${f.contaId ? Prisma.sql`c.id = ${f.contaId}` : Prisma.sql`c.ativa`}), 0)
          + COALESCE((SELECT SUM(CASE WHEN l.tipo = 'RECEBER' THEN l."valorPago" ELSE -l."valorPago" END)
                        FROM "Lancamento" l LEFT JOIN "ContaBancaria" c ON c.id = l."contaBancariaId"
                       WHERE l."pagoEm" IS NOT NULL AND l."pagoEm" < ${f.de} ${daConta}
                         ${f.contaId ? Prisma.empty : Prisma.sql`AND (c.id IS NULL OR c.ativa)`}), 0))::float saldo`;

  const where = (realizado: boolean): Prisma.LancamentoWhereInput => ({
    ...(realizado
      ? { pagoEm: { gte: f.de, lt: fim(f.ate) } }
      : { pagoEm: null, vencimento: { gte: f.de, lt: fim(f.ate) } }),
    ...(f.contaId ? { contaBancariaId: f.contaId } : { transferenciaId: null }),
    ...(f.centroCustoId ? { centroCustoId: f.centroCustoId } : {}),
  });
  const include = { pessoa: { select: { nome: true } }, categoria: { select: { nome: true } }, centroCusto: { select: { nome: true } }, contaBancaria: { select: { nome: true } } } as const;
  const [realizados, previstos] = await Promise.all([
    prisma.lancamento.findMany({ where: where(true), include, orderBy: [{ pagoEm: "asc" }, { createdAt: "asc" }] }),
    prisma.lancamento.findMany({ where: where(false), include, orderBy: [{ vencimento: "asc" }, { createdAt: "asc" }] }),
  ]);
  // contas vencidas antes do período e ainda em aberto (aviso à parte; não entram no previsto do período)
  const [atrasado] = await prisma.$queryRaw<{ receber: number; pagar: number }[]>`
    SELECT COALESCE(SUM(valor) FILTER (WHERE tipo = 'RECEBER'), 0)::float receber, COALESCE(SUM(valor) FILTER (WHERE tipo = 'PAGAR'), 0)::float pagar
      FROM "Lancamento" l WHERE l."pagoEm" IS NULL AND l.vencimento < ${f.de < f.hoje ? f.de : f.hoje} ${daConta} ${doCentro} ${semTransf}`;

  const linha = (l: (typeof realizados)[number], realizado: boolean): LinhaFluxo => ({
    id: l.id, data: realizado ? l.pagoEm! : l.vencimento, tipo: l.tipo, descricao: l.descricao, pessoa: l.pessoa?.nome ?? null,
    categoria: l.categoria.nome, centro: l.centroCusto?.nome ?? null, conta: l.contaBancaria?.nome ?? null,
    valor: Number(realizado ? l.valorPago ?? l.valor : l.valor), realizado, vencido: !realizado && l.vencimento < f.hoje, transferencia: !!l.transferenciaId,
  });
  const linhas = [...realizados.map((l) => linha(l, true)), ...previstos.map((l) => linha(l, false))]
    .sort((a, b) => a.data.getTime() - b.data.getTime() || Number(b.realizado) - Number(a.realizado));

  const soma = (ls: LinhaFluxo[], tipo: "RECEBER" | "PAGAR") => Math.round(ls.filter((l) => l.tipo === tipo).reduce((s, l) => s + l.valor, 0) * 100) / 100;
  const real = linhas.filter((l) => l.realizado), prev = linhas.filter((l) => !l.realizado);
  const recebido = soma(real, "RECEBER"), pago = soma(real, "PAGAR"), aReceber = soma(prev, "RECEBER"), aPagar = soma(prev, "PAGAR");
  // por centro de custo não existe "saldo de banco": o fluxo mostra só o resultado do centro a partir de zero
  const saldoAnterior = f.centroCustoId ? 0 : Math.round(ant.saldo * 100) / 100;
  const saldo = Math.round((saldoAnterior + recebido - pago) * 100) / 100;

  // dia a dia: saldo realizado no fim de cada dia e saldo previsto (realizado + em aberto até o dia)
  const dias: { dia: Date; entradas: number; saidas: number; saldo: number; previsto: number; linhas: LinhaFluxo[] }[] = [];
  let sr = saldoAnterior, sp = saldoAnterior;
  for (let d = f.de; d <= f.ate; d = somarDias(d, 1)) {
    const doDia = linhas.filter((l) => l.data.getTime() === d.getTime());
    const ent = doDia.filter((l) => l.tipo === "RECEBER"), sai = doDia.filter((l) => l.tipo === "PAGAR");
    const delta = (ls: LinhaFluxo[]) => ls.reduce((s, l) => s + (l.tipo === "RECEBER" ? l.valor : -l.valor), 0);
    sr += delta(doDia.filter((l) => l.realizado));
    sp += delta(doDia);
    dias.push({ dia: d, entradas: soma(ent, "RECEBER"), saidas: soma(sai, "PAGAR"), saldo: Math.round(sr * 100) / 100, previsto: Math.round(sp * 100) / 100, linhas: doDia });
    if (dias.length > 400) break;
  }

  return {
    saldoAnterior, recebido, pago, aReceber, aPagar, saldo,
    saldoPrevisto: Math.round((saldo + aReceber - aPagar) * 100) / 100,
    atrasadoReceber: atrasado.receber, atrasadoPagar: atrasado.pagar,
    linhas, dias,
  };
}

/** Recebido e pago por mês (realizado) nos últimos `meses` meses até `ate`, e o movimento por conta bancária. */
export async function fluxoMensal(ate: Date, meses = 12, f: { contaId?: string; centroCustoId?: string } = {}) {
  const ini = new Date(Date.UTC(ate.getUTCFullYear(), ate.getUTCMonth() - meses + 1, 1));
  const fimMes = new Date(Date.UTC(ate.getUTCFullYear(), ate.getUTCMonth() + 1, 1));
  const filtros = Prisma.sql`${f.contaId ? Prisma.sql`AND l."contaBancariaId" = ${f.contaId}` : Prisma.sql`AND l."transferenciaId" IS NULL`}
                             ${f.centroCustoId ? Prisma.sql`AND l."centroCustoId" = ${f.centroCustoId}` : Prisma.empty}`;
  const rows = await prisma.$queryRaw<{ mes: string; receber: number; pagar: number }[]>`
    SELECT to_char(l."pagoEm", 'YYYY-MM') mes,
           COALESCE(SUM(l."valorPago") FILTER (WHERE l.tipo = 'RECEBER'), 0)::float receber,
           COALESCE(SUM(l."valorPago") FILTER (WHERE l.tipo = 'PAGAR'), 0)::float pagar
      FROM "Lancamento" l
     WHERE l."pagoEm" >= ${ini} AND l."pagoEm" < ${fimMes} ${filtros}
     GROUP BY 1`;
  const chaves: string[] = [];
  for (let i = 0; i < meses; i++) {
    const d = new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth() + i, 1));
    chaves.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const porMes = chaves.map((c) => {
    const r = rows.find((x) => x.mes === c);
    return { mes: c, receber: r?.receber ?? 0, pagar: r?.pagar ?? 0, saldo: Math.round(((r?.receber ?? 0) - (r?.pagar ?? 0)) * 100) / 100 };
  });
  const porConta = await prisma.$queryRaw<{ conta: string; receber: number; pagar: number }[]>`
    SELECT COALESCE(c.nome, 'Sem conta') conta,
           COALESCE(SUM(l."valorPago") FILTER (WHERE l.tipo = 'RECEBER'), 0)::float receber,
           COALESCE(SUM(l."valorPago") FILTER (WHERE l.tipo = 'PAGAR'), 0)::float pagar
      FROM "Lancamento" l LEFT JOIN "ContaBancaria" c ON c.id = l."contaBancariaId"
     WHERE l."pagoEm" >= ${ini} AND l."pagoEm" < ${fimMes}
       ${f.centroCustoId ? Prisma.sql`AND l."centroCustoId" = ${f.centroCustoId}` : Prisma.empty}
     GROUP BY 1 ORDER BY 2 + 3 DESC`;
  return { porMes, porConta };
}
