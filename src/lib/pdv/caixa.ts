import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { EstoqueError } from "@/lib/estoque/estoque";
import { categoria, garantirPadroes } from "@/lib/financeiro/padroes";
import { criarLancamentos } from "@/lib/financeiro/lancamentos";
import { diaSP } from "@/lib/datas";
import { transferirEntreContas } from "@/lib/financeiro/transferencias";
import { LOJA_ATUAL } from "@/lib/empresa/loja";

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
      const conta = await tx.contaBancaria.findUniqueOrThrow({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: "Caixa" } } });
      await criarLancamentos(tx, {
        tipo: "RECEBER", descricao: "Abertura de caixa do PDV", valorTotal: valor, primeiroVencimento: diaSP(),
        categoriaId: (await categoria(tx, "Transferência entre contas", "RECEBER")).id, contaBancariaId: conta.id, pago: true,
      });
    }
    return caixa;
  });
}

/** Resumo do caixa: vendas concretizadas por forma de pagamento, sangrias/suprimentos e dinheiro esperado na gaveta. */
export async function resumoCaixa(caixaId: string) {
  const caixa = await prisma.caixaPdv.findUniqueOrThrow({ where: { id: caixaId } });
  const pags = await prisma.vendaPagamento.findMany({
    where: { venda: { caixaId, situacao: "CONCLUIDA" } },
    include: { formaPagamento: { select: { nome: true } } },
  });
  const porForma = new Map<string, number>();
  for (const p of pags) porForma.set(p.formaPagamento.nome, (porForma.get(p.formaPagamento.nome) ?? 0) + Number(p.valor));
  const vendas = await prisma.venda.count({ where: { caixaId, situacao: "CONCLUIDA" } });
  const movimentos = await prisma.movimentoCaixa.findMany({ where: { caixaId }, orderBy: { createdAt: "asc" }, include: { usuario: { select: { nome: true } } } });
  const soma = (t: "SANGRIA" | "SUPRIMENTO") => movimentos.filter((m) => m.tipo === t).reduce((s, m) => s + Number(m.valor), 0);
  const sangrias = soma("SANGRIA"), suprimentos = soma("SUPRIMENTO");
  const total = [...porForma.values()].reduce((s, v) => s + v, 0);
  const dinheiro = Number(caixa.valorAbertura) + (porForma.get("Dinheiro") ?? 0) + suprimentos - sangrias;
  return {
    caixa, vendas, total, porForma: [...porForma].sort((a, b) => b[1] - a[1]), movimentos,
    sangrias: Math.round(sangrias * 100) / 100, suprimentos: Math.round(suprimentos * 100) / 100,
    dinheiroEsperado: Math.round(dinheiro * 100) / 100,
  };
}

/**
 * Sangria (retira dinheiro da gaveta) ou suprimento (coloca troco). Com `contaId`, o valor também vira uma
 * transferência no financeiro: sangria = Caixa → conta (cofre, banco); suprimento = conta → Caixa.
 */
export async function movimentarCaixa(
  caixaId: string, usuarioId: string,
  d: { tipo: "SANGRIA" | "SUPRIMENTO"; valor: number; motivo?: string | null; contaId?: string | null },
) {
  const c = await prisma.caixaPdv.findFirst({ where: { id: caixaId, usuarioId, fechadoEm: null } });
  if (!c) throw new EstoqueError("Caixa não está aberto");
  if (!(d.valor > 0)) throw new EstoqueError("Informe um valor maior que zero");
  const valor = Math.round(d.valor * 100) / 100;
  if (d.tipo === "SANGRIA") {
    const { dinheiroEsperado } = await resumoCaixa(caixaId);
    if (valor > dinheiroEsperado + 0.001) throw new EstoqueError(`A gaveta tem só ${dinheiroEsperado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em dinheiro`);
  }
  return prisma.$transaction(async (tx) => {
    let transferenciaId: string | null = null;
    if (d.contaId) {
      await garantirPadroes(tx);
      const caixaConta = await tx.contaBancaria.findUniqueOrThrow({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: "Caixa" } } });
      const t = await transferirEntreContas(tx, {
        origemId: d.tipo === "SANGRIA" ? caixaConta.id : d.contaId,
        destinoId: d.tipo === "SANGRIA" ? d.contaId : caixaConta.id,
        valor, data: diaSP(),
        descricao: `${d.tipo === "SANGRIA" ? "Sangria" : "Suprimento"} do caixa do PDV`, observacao: d.motivo || null,
      });
      transferenciaId = t.id;
    }
    return tx.movimentoCaixa.create({ data: { caixaId, usuarioId, tipo: d.tipo, valor: D(valor), motivo: d.motivo?.trim() || null, transferenciaId } });
  });
}

export async function fecharCaixa(caixaId: string, usuarioId: string, valorContado: number, observacao?: string) {
  const c = await prisma.caixaPdv.findFirst({ where: { id: caixaId, usuarioId, fechadoEm: null } });
  if (!c) throw new EstoqueError("Caixa não está aberto");
  return prisma.caixaPdv.update({ where: { id: caixaId }, data: { fechadoEm: new Date(), valorFechamento: D(valorContado), observacao: observacao || null } });
}
