import { prisma } from "@/lib/db";
import { planoDeContas } from "./plano";

/** Listas dos selects do formulário de conta (plano de contas, formas, contas bancárias e centros de custo). */
export async function opcoesConta(tipo: "PAGAR" | "RECEBER") {
  const [categorias, formas, contas, centros] = await Promise.all([
    prisma.$transaction((tx) => planoDeContas(tx, { tipo, ativas: true })),
    prisma.formaPagamento.findMany({ where: { ativa: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.contaBancaria.findMany({ where: { ativa: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.centroCusto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  // as categorias de transferência entre contas não são escolhidas à mão
  return { categorias: categorias.filter((c) => c.grupoDre !== "NAO_OPERACIONAL" || !c.nome.startsWith("Transferência")), formas, contas, centros };
}
