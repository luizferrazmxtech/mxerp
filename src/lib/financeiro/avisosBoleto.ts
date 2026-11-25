import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { baixarLancamento, criarLancamentos } from "./lancamentos";
import { contaDoInter } from "./boletos";
import { lerConfigInter } from "./inter";
import { ordenarCandidatas, resolverAvisosJaLancados } from "./avisoJaLancado";

/**
 * Avisos de boleto pago no Inter sem conta no sistema (ver registrarAviso em boletos.ts). Cada aviso é resolvido
 * de um jeito: lançando o recebimento, baixando a conta em aberto certa, ou só explicando (ex.: devolvido).
 */

const D = (v: number) => new Prisma.Decimal(v.toFixed(2));

/** Quantos avisos faltam resolver (antes, encerra os que já têm o recebimento lançado). */
export async function avisosPendentes() {
  await resolverAvisosJaLancados().catch(() => 0);
  return prisma.avisoBoleto.count({ where: { resolvidoEm: null } });
}

async function pendente(id: string) {
  const a = await prisma.avisoBoleto.findUniqueOrThrow({ where: { id } });
  if (a.resolvidoEm) throw new Error("Este aviso já foi resolvido");
  if (!a.pagoEm) throw new Error("O aviso não tem a data do pagamento");
  return a;
}

const contaInter = async () => (await contaDoInter(await lerConfigInter().catch(() => null))).id;
const recebido = (a: { valorRecebido: Prisma.Decimal | null; valor: Prisma.Decimal | null }) => Number(a.valorRecebido ?? a.valor ?? 0);

/** Lança o valor recebido como conta a receber já paga, na conta do Inter, na data do pagamento. */
export async function lancarRecebimentoDoAviso(id: string, d: { categoriaId: string; pessoaId?: string | null; descricao?: string }, usuario: string) {
  const a = await pendente(id);
  if (!d.categoriaId) throw new Error("Escolha a categoria do recebimento");
  const valor = recebido(a);
  const conta = await contaInter();
  const pessoaId = d.pessoaId || (a.pagadorDocumento ? (await prisma.pessoa.findFirst({ where: { documento: a.pagadorDocumento }, select: { id: true } }))?.id : null) || null;
  return prisma.$transaction(async (tx) => {
    const [l] = await criarLancamentos(tx, {
      tipo: "RECEBER", descricao: d.descricao?.trim() || `Boleto pago${a.pagadorNome ? ` por ${a.pagadorNome}` : ""}${a.seuNumero ? ` (nº ${a.seuNumero})` : ""}`,
      categoriaId: d.categoriaId, pessoaId, valorTotal: valor, primeiroVencimento: a.pagoEm!, competencia: a.pagoEm!, contaBancariaId: conta,
      observacao: `Boleto do Inter ${a.nossoNumero ?? a.codigoSolicitacao}`,
    });
    await baixarLancamento(tx, l.id, { data: a.pagoEm!, contaBancariaId: conta, valorPago: valor });
    return tx.avisoBoleto.update({ where: { id }, data: { lancamentoId: l.id, resolvidoEm: new Date(), resolvidoPor: usuario, resolucao: "Recebimento lançado" } });
  });
}

/** Baixa uma conta a receber em aberto com o pagamento do boleto (diferença vira juros/desconto). */
export async function baixarContaDoAviso(id: string, lancamentoId: string, usuario: string) {
  const a = await pendente(id);
  const conta = await contaInter();
  return prisma.$transaction(async (tx) => {
    const l = await tx.lancamento.findUniqueOrThrow({ where: { id: lancamentoId } });
    if (l.tipo !== "RECEBER") throw new Error("Escolha uma conta a receber");
    if (l.pagoEm) throw new Error("Essa conta já está baixada");
    const valor = recebido(a);
    const dif = Math.round((valor - Number(l.valor)) * 100) / 100;
    await baixarLancamento(tx, l.id, { data: a.pagoEm!, contaBancariaId: conta, juros: Math.max(0, dif), desconto: Math.max(0, -dif), valorPago: valor });
    return tx.avisoBoleto.update({ where: { id }, data: { lancamentoId: l.id, resolvidoEm: new Date(), resolvidoPor: usuario, resolucao: `Baixou a conta "${l.descricao}"` } });
  });
}

/** Encerra o aviso só com uma explicação (pagamento devolvido, já tratado à mão etc.). */
export async function encerrarAviso(id: string, explicacao: string, usuario: string) {
  await prisma.avisoBoleto.findUniqueOrThrow({ where: { id } });
  if (explicacao.trim().length < 5) throw new Error("Escreva o que foi feito (pelo menos 5 letras)");
  return prisma.avisoBoleto.update({ where: { id }, data: { resolvidoEm: new Date(), resolvidoPor: usuario, resolucao: explicacao.trim().slice(0, 500) } });
}

/** Contas a receber em aberto que podem ser deste pagamento: mesmo pagador (CPF/CNPJ) ou valor parecido, a mais provável primeiro. */
export async function candidatasDoAviso(a: { pagadorDocumento: string | null; valor: Prisma.Decimal | null; valorRecebido: Prisma.Decimal | null; pagoEm: Date | null }) {
  const v = recebido(a);
  const ls = await prisma.lancamento.findMany({
    where: {
      tipo: "RECEBER", pagoEm: null,
      OR: [
        ...(a.pagadorDocumento ? [{ pessoa: { documento: a.pagadorDocumento } }] : []),
        { valor: { gte: D(v * 0.9), lte: D(v * 1.1) } },
      ],
    },
    include: { pessoa: { select: { nome: true, documento: true } } }, orderBy: { vencimento: "asc" }, take: 30,
  });
  // a mais provável (mesmo pagador, mesmo valor, vencimento perto do pagamento) primeiro
  return ordenarCandidatas(a, ls);
}
