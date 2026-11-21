import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { diaSP } from "@/lib/datas";

/**
 * Conferência de saldo: o saldo que o banco informa (o Inter manda na sincronização; ou digitado) contra o saldo do
 * sistema (saldo inicial da conta + contas recebidas − pagas nela). Com um saldo do banco conhecido, o saldo dos outros
 * dias sai do próprio extrato (saldo informado menos o que entrou/saiu depois), então dá para ver em que dia a
 * diferença apareceu. Diferença costuma ser linha do extrato ainda não conciliada, baixa feita à mão na conta errada
 * ou com data diferente, ou extrato incompleto.
 */

const DIA = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const r2 = (v: number) => Math.round(v * 100) / 100;

export async function registrarSaldo(contaBancariaId: string, data: Date, saldo: number, origem: "INTER" | "MANUAL") {
  if (!Number.isFinite(saldo)) throw new Error("Saldo inválido");
  const d = new Date(`${iso(data)}T00:00:00Z`);
  return prisma.saldoBancario.upsert({
    where: { contaBancariaId_data_origem: { contaBancariaId, data: d, origem } },
    create: { contaBancariaId, data: d, saldo: new Prisma.Decimal(saldo.toFixed(2)), origem },
    update: { saldo: new Prisma.Decimal(saldo.toFixed(2)) },
  });
}

export type DiaConferencia = {
  data: string;
  movExtrato: number; // entradas − saídas do extrato no dia
  movSistema: number; // recebido − pago no sistema nesta conta no dia
  saldoSistema: number;
  saldoBanco: number | null; // informado (real) ou calculado a partir do informado pelo extrato
  bancoInformado: boolean;
  diferenca: number | null; // banco − sistema
  pendentes: number; // linhas do extrato ainda não conciliadas no dia
  valorPendente: number;
};

/** Pura: monta os dias a partir dos movimentos (testável). `saldos` = saldo do banco informado em alguns dias. */
export function montarConferencia(a: {
  inicio: Date; fim: Date; saldoSistemaAntes: number;
  sistema: Map<string, number>; extrato: Map<string, number>; pendentes: Map<string, { n: number; v: number }>;
  saldos: Map<string, number>;
}): DiaConferencia[] {
  const dias: DiaConferencia[] = [];
  let saldo = a.saldoSistemaAntes;
  for (let t = a.inicio.getTime(); t <= a.fim.getTime(); t += DIA) {
    const d = iso(new Date(t));
    const movSistema = r2(a.sistema.get(d) ?? 0);
    saldo = r2(saldo + movSistema);
    const p = a.pendentes.get(d);
    dias.push({ data: d, movExtrato: r2(a.extrato.get(d) ?? 0), movSistema, saldoSistema: saldo, saldoBanco: null, bancoInformado: false, diferenca: null, pendentes: p?.n ?? 0, valorPendente: r2(p?.v ?? 0) });
  }
  // âncora: o saldo informado mais recente; para trás e para frente, pelo movimento do extrato
  const ancoras = dias.map((d, i) => [i, a.saldos.get(d.data)] as const).filter((x): x is readonly [number, number] => x[1] != null);
  if (ancoras.length) {
    const [ia, va] = ancoras[ancoras.length - 1];
    dias[ia].saldoBanco = r2(va);
    for (let i = ia - 1; i >= 0; i--) dias[i].saldoBanco = r2(dias[i + 1].saldoBanco! - dias[i + 1].movExtrato);
    for (let i = ia + 1; i < dias.length; i++) dias[i].saldoBanco = r2(dias[i - 1].saldoBanco! + dias[i].movExtrato);
    // dias com saldo informado mostram o informado (se o extrato estiver incompleto, a conta não fecha e aparece)
    for (const [i, v] of ancoras) { dias[i].saldoBanco = r2(v); dias[i].bancoInformado = true; }
    for (const d of dias) d.diferenca = r2(d.saldoBanco! - d.saldoSistema);
  }
  return dias;
}

export async function conferenciaSaldo(contaBancariaId: string, dias = 30, fim: Date = diaSP()) {
  const conta = await prisma.contaBancaria.findUniqueOrThrow({ where: { id: contaBancariaId } });
  const inicio = new Date(fim.getTime() - (dias - 1) * DIA);
  const [antes] = await prisma.$queryRaw<{ v: number }[]>`
    SELECT COALESCE(SUM(CASE WHEN tipo = 'RECEBER' THEN "valorPago" ELSE -"valorPago" END), 0)::float v
      FROM "Lancamento" WHERE "contaBancariaId" = ${contaBancariaId} AND "pagoEm" IS NOT NULL AND "pagoEm" < ${inicio}`;
  const sis = await prisma.$queryRaw<{ d: Date; v: number }[]>`
    SELECT "pagoEm" d, SUM(CASE WHEN tipo = 'RECEBER' THEN "valorPago" ELSE -"valorPago" END)::float v
      FROM "Lancamento" WHERE "contaBancariaId" = ${contaBancariaId} AND "pagoEm" BETWEEN ${inicio} AND ${fim} GROUP BY 1`;
  const ext = await prisma.$queryRaw<{ d: Date; v: number; n: number; pv: number }[]>`
    SELECT data d, SUM(valor)::float v, COUNT(*) FILTER (WHERE situacao = 'PENDENTE')::int n,
           COALESCE(SUM(ABS(valor)) FILTER (WHERE situacao = 'PENDENTE'), 0)::float pv
      FROM "TransacaoBancaria" WHERE "contaBancariaId" = ${contaBancariaId} AND data BETWEEN ${inicio} AND ${fim} GROUP BY 1`;
  const saldos = await prisma.saldoBancario.findMany({ where: { contaBancariaId, data: { gte: inicio, lte: fim } }, orderBy: { updatedAt: "asc" } });
  const mapaSaldos = new Map<string, number>();
  // digitado vale mais que o do Inter no mesmo dia
  for (const s of saldos.sort((a, b) => Number(a.origem === "MANUAL") - Number(b.origem === "MANUAL"))) mapaSaldos.set(iso(s.data), Number(s.saldo));
  const linhas = montarConferencia({
    inicio, fim, saldoSistemaAntes: Number(conta.saldoInicial) + antes.v,
    sistema: new Map(sis.map((x) => [iso(x.d), x.v])),
    extrato: new Map(ext.map((x) => [iso(x.d), x.v])),
    pendentes: new Map(ext.filter((x) => x.n).map((x) => [iso(x.d), { n: x.n, v: x.pv }])),
    saldos: mapaSaldos,
  });
  return { conta: { id: conta.id, nome: conta.nome }, linhas, informados: saldos.map((s) => ({ data: iso(s.data), saldo: Number(s.saldo), origem: s.origem })) };
}

/** Para o aviso diário: contas com saldo do banco dos últimos 2 dias, comparado com o sistema na mesma data. */
export async function saldosParaAviso() {
  const desde = new Date(diaSP().getTime() - 2 * DIA);
  const ultimos = await prisma.saldoBancario.findMany({ where: { data: { gte: desde } }, orderBy: [{ data: "desc" }, { updatedAt: "desc" }], include: { contaBancaria: true } });
  const vistos = new Set<string>();
  const out: { conta: string; banco: number; sistema: number }[] = [];
  for (const s of ultimos) {
    if (vistos.has(s.contaBancariaId)) continue;
    vistos.add(s.contaBancariaId);
    const [r] = await prisma.$queryRaw<{ v: number }[]>`
      SELECT COALESCE(SUM(CASE WHEN tipo = 'RECEBER' THEN "valorPago" ELSE -"valorPago" END), 0)::float v
        FROM "Lancamento" WHERE "contaBancariaId" = ${s.contaBancariaId} AND "pagoEm" IS NOT NULL AND "pagoEm" <= ${s.data}`;
    out.push({ conta: s.contaBancaria.nome, banco: Number(s.saldo), sistema: r2(Number(s.contaBancaria.saldoInicial) + r.v) });
  }
  return out;
}
