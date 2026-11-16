import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { EstoqueError } from "@/lib/estoque/estoque";
import { categoria, garantirPadroes } from "@/lib/financeiro/padroes";
import { criarLancamentos } from "@/lib/financeiro/lancamentos";
import { diaSP } from "@/lib/datas";

const D = (v: number) => new Prisma.Decimal(v.toFixed(2));

/** Caixa do PDV aberto por este usuário (cada operador tem o seu). */
export function caixaAberto(usuarioId: string) {
  return prisma.caixaPdv.findFirst({ where: { usuarioId, fechadoEm: null }, orderBy: { abertoEm: "desc" } });
}

/** Abre o caixa com o dinheiro inicial; opcionalmente lança a abertura como recebimento no financeiro (conta Caixa). */
export async function abrirCaixa(usuarioId: string, valor: number, gerarRecebimento = false) {
  if (!(valor >= 0)) throw new EstoqueError("Valor de abertura inválido");
  return prisma.$transaction(async (tx) => {
    const ja = await tx.caixaPdv.findFirst({ where: { usuarioId, fechadoEm: null } });
    if (ja) return ja;
    const caixa = await tx.caixaPdv.create({ data: { usuarioId, valorAbertura: D(valor) } });
    if (gerarRecebimento && valor > 0) {
      await garantirPadroes(tx);
      const conta = await tx.contaBancaria.findUniqueOrThrow({ where: { nome: "Caixa" } });
      await criarLancamentos(tx, {
        tipo: "RECEBER", descricao: "Abertura de caixa do PDV", valorTotal: valor, primeiroVencimento: diaSP(),
        categoriaId: (await categoria(tx, "Transferência entre contas", "RECEBER")).id, contaBancariaId: conta.id, pago: true,
      });
    }
    return caixa;
  });
}

/** Resumo do caixa: vendas concretizadas por forma de pagamento e dinheiro esperado na gaveta. */
export async function resumoCaixa(caixaId: string) {
  const caixa = await prisma.caixaPdv.findUniqueOrThrow({ where: { id: caixaId } });
  const pags = await prisma.vendaPagamento.findMany({
    where: { venda: { caixaId, situacao: "CONCLUIDA" } },
    include: { formaPagamento: { select: { nome: true } } },
  });
  const porForma = new Map<string, number>();
  for (const p of pags) porForma.set(p.formaPagamento.nome, (porForma.get(p.formaPagamento.nome) ?? 0) + Number(p.valor));
  const vendas = await prisma.venda.count({ where: { caixaId, situacao: "CONCLUIDA" } });
  const total = [...porForma.values()].reduce((s, v) => s + v, 0);
  const dinheiro = Number(caixa.valorAbertura) + (porForma.get("Dinheiro") ?? 0);
  return { caixa, vendas, total, porForma: [...porForma].sort((a, b) => b[1] - a[1]), dinheiroEsperado: Math.round(dinheiro * 100) / 100 };
}

export async function fecharCaixa(caixaId: string, usuarioId: string, valorContado: number, observacao?: string) {
  const c = await prisma.caixaPdv.findFirst({ where: { id: caixaId, usuarioId, fechadoEm: null } });
  if (!c) throw new EstoqueError("Caixa não está aberto");
  return prisma.caixaPdv.update({ where: { id: caixaId }, data: { fechadoEm: new Date(), valorFechamento: D(valorContado), observacao: observacao || null } });
}
