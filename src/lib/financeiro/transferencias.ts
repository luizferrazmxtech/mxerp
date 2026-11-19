import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { categoria, garantirPadroes } from "./padroes";

const D = (v: number) => new Prisma.Decimal(v.toFixed(2));

/**
 * Transferência entre contas (ex.: Caixa → Inter, ou aplicação): o valor sai da origem como pagamento e entra no
 * destino como recebimento, os dois já baixados na data, no plano "Transferência entre contas" (fora da DRE).
 * As duas pernas ficam ligadas por `transferenciaId` e só são excluídas juntas.
 */
export async function transferirEntreContas(
  tx: Tx,
  d: { origemId: string; destinoId: string; valor: number; data: Date; descricao?: string; observacao?: string | null },
) {
  if (!d.origemId || !d.destinoId) throw new Error("Escolha a conta de origem e a de destino");
  if (d.origemId === d.destinoId) throw new Error("A conta de destino precisa ser diferente da origem");
  if (!(d.valor > 0)) throw new Error("Informe um valor maior que zero");
  await garantirPadroes(tx);
  const [origem, destino] = await Promise.all([
    tx.contaBancaria.findUniqueOrThrow({ where: { id: d.origemId } }),
    tx.contaBancaria.findUniqueOrThrow({ where: { id: d.destinoId } }),
  ]);
  const [catSai, catEntra] = await Promise.all([
    categoria(tx, "Transferência entre contas", "PAGAR"),
    categoria(tx, "Transferência entre contas", "RECEBER"),
  ]);
  const id = randomUUID();
  const desc = d.descricao?.trim() || `Transferência ${origem.nome} → ${destino.nome}`;
  const base = { valor: D(d.valor), valorPago: D(d.valor), vencimento: d.data, competencia: d.data, pagoEm: d.data, transferenciaId: id, observacao: d.observacao || null };
  const saida = await tx.lancamento.create({ data: { ...base, tipo: "PAGAR", descricao: desc, categoriaId: catSai.id, contaBancariaId: origem.id } });
  const entrada = await tx.lancamento.create({ data: { ...base, tipo: "RECEBER", descricao: desc, categoriaId: catEntra.id, contaBancariaId: destino.id } });
  return { id, saida, entrada };
}

export async function excluirTransferencia(tx: Tx, transferenciaId: string) {
  const pernas = await tx.lancamento.findMany({ where: { transferenciaId } });
  if (!pernas.length) throw new Error("Transferência não encontrada");
  if (pernas.some((l) => l.transacaoId)) throw new Error("Esta transferência já foi conciliada com o extrato: desfaça a conciliação antes");
  await tx.lancamento.deleteMany({ where: { transferenciaId } });
}

/** Lista de transferências (uma linha por par), mais recentes primeiro. */
export async function listarTransferencias(tx: Tx, filtro: { de?: Date; ate?: Date; take?: number } = {}) {
  const saidas = await tx.lancamento.findMany({
    where: { transferenciaId: { not: null }, tipo: "PAGAR", ...(filtro.de || filtro.ate ? { pagoEm: { ...(filtro.de ? { gte: filtro.de } : {}), ...(filtro.ate ? { lte: filtro.ate } : {}) } } : {}) },
    include: { contaBancaria: true },
    orderBy: [{ pagoEm: "desc" }, { createdAt: "desc" }],
    take: filtro.take ?? 200,
  });
  const entradas = await tx.lancamento.findMany({ where: { transferenciaId: { in: saidas.map((s) => s.transferenciaId!) }, tipo: "RECEBER" }, include: { contaBancaria: true } });
  return saidas.map((s) => {
    const e = entradas.find((x) => x.transferenciaId === s.transferenciaId);
    return { id: s.transferenciaId!, data: s.pagoEm!, descricao: s.descricao, valor: Number(s.valor), origem: s.contaBancaria?.nome ?? "", destino: e?.contaBancaria?.nome ?? "", observacao: s.observacao };
  });
}
