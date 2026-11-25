import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Boleto pago no Inter que não foi emitido pelo MXERP (ex.: emitido no Gestão Click) muitas vezes já está lançado e
 * recebido aqui: a conta veio da migração ou alguém baixou à mão. Antes de avisar "sem conta no sistema", procura a
 * conta a receber já recebida do mesmo pagador (CPF/CNPJ), com o mesmo valor (até R$ 0,10 de diferença) e o
 * recebimento ou o vencimento perto da data do pagamento. Achando uma só melhor, o aviso é encerrado apontando para
 * ela. Conta em aberto nunca é baixada por aqui (regra do Luiz: recebimento só baixa pelo boleto/nosso número).
 */

const DIA = 86400000;
const JANELA = 7; // dias
const TOLERANCIA = 0.1; // R$

type Aviso = { pagadorDocumento: string | null; valor: Prisma.Decimal | null; valorRecebido: Prisma.Decimal | null; pagoEm: Date | null };

/** A conta já recebida que corresponde a este pagamento, ou null (nenhuma, ou duas igualmente boas). */
export async function contaJaRecebida(a: Aviso) {
  if (!a.pagadorDocumento || !a.pagoEm) return null;
  const valores = [a.valorRecebido, a.valor].filter((v): v is Prisma.Decimal => v != null).map(Number).filter((v) => v > 0);
  if (!valores.length) return null;
  const de = new Date(a.pagoEm.getTime() - 45 * DIA), ate = new Date(a.pagoEm.getTime() + 45 * DIA);
  const ls = await prisma.lancamento.findMany({
    where: {
      tipo: "RECEBER", pagoEm: { not: null }, pessoa: { documento: a.pagadorDocumento },
      OR: [{ pagoEm: { gte: de, lte: ate } }, { vencimento: { gte: de, lte: ate } }],
      // a conta não pode já ter sido usada por outro aviso nem ter sido paga por um boleto nosso
      avisosBoleto: { none: {} }, boletos: { none: { situacao: "RECEBIDO" } },
    },
    select: { id: true, descricao: true, valor: true, valorPago: true, vencimento: true, pagoEm: true },
  });
  const pago = a.pagoEm.getTime();
  const achadas = ls
    .filter((l) => [l.valor, l.valorPago].some((v) => v != null && valores.some((x) => Math.abs(Number(v) - x) <= TOLERANCIA + 1e-9)))
    .map((l) => ({ l, dist: Math.min(Math.abs(l.pagoEm!.getTime() - pago), Math.abs(l.vencimento.getTime() - pago)) / DIA }))
    .filter((x) => x.dist <= JANELA)
    .sort((x, y) => x.dist - y.dist);
  if (!achadas.length) return null;
  // duas contas igualmente próximas: não chuta
  if (achadas.length > 1 && achadas[1].dist === achadas[0].dist) return null;
  return achadas[0].l;
}

/** Encerra os avisos "não emitido pelo MXERP" cujo recebimento já está lançado. Devolve quantos encerrou. */
export async function resolverAvisosJaLancados(ids?: string[]) {
  const pendentes = await prisma.avisoBoleto.findMany({
    where: { resolvidoEm: null, motivo: "NAO_EMITIDO", lancamentoId: null, ...(ids ? { id: { in: ids } } : {}) },
  });
  let n = 0;
  for (const a of pendentes) {
    const l = await contaJaRecebida(a);
    if (!l) continue;
    const dia = l.pagoEm!.toLocaleDateString("pt-BR", { timeZone: "UTC" });
    const r = await prisma.avisoBoleto.updateMany({
      where: { id: a.id, resolvidoEm: null },
      data: { lancamentoId: l.id, resolvidoEm: new Date(), resolvidoPor: "MXERP (automático)", resolucao: `Já estava lançado: "${l.descricao}", recebido em ${dia}`.slice(0, 500) },
    });
    n += r.count;
  }
  return n;
}

/** Ordena as contas em aberto de um aviso: primeiro as do mesmo pagador e valor, depois pela data mais próxima. */
export function ordenarCandidatas<T extends { valor: Prisma.Decimal; vencimento: Date; pessoa?: { documento?: string | null } | null }>(a: Aviso, ls: T[]) {
  const v = Number(a.valorRecebido ?? a.valor ?? 0);
  const ref = a.pagoEm?.getTime() ?? Date.now();
  const nota = (l: T) => (l.pessoa?.documento && l.pessoa.documento === a.pagadorDocumento ? 0 : 2) + (Math.abs(Number(l.valor) - v) <= TOLERANCIA ? 0 : 1);
  return [...ls].sort((x, y) => nota(x) - nota(y) || Math.abs(x.vencimento.getTime() - ref) - Math.abs(y.vencimento.getTime() - ref));
}
