import { Prisma, type SituacaoVenda, type TipoVenda } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { EstoqueError, liberarItem, reservarItem } from "@/lib/estoque/estoque";
import { transicionarEstoque, type EstadoEstoque } from "@/lib/estoque/transicao";
import { cancelarRecebimentos, gerarRecebimentos, type Pagamento } from "@/lib/financeiro/lancamentos";
import { categoria, garantirPadroes } from "@/lib/financeiro/padroes";
import { proximoNumero } from "@/lib/sequencia";

export function estadoEstoqueVenda(s: SituacaoVenda): EstadoEstoque {
  return s === "ABERTA" ? "RESERVADO" : s === "CONCLUIDA" ? "BAIXADO" : "LIVRE";
}

export const SITUACOES_VENDA: { valor: SituacaoVenda; rotulo: string; cor: string }[] = [
  { valor: "ORCAMENTO", rotulo: "Orçamento", cor: "bg-sky-200 text-sky-900" },
  { valor: "ABERTA", rotulo: "Em aberto (reservada)", cor: "bg-amber-200 text-amber-900" },
  { valor: "CONCLUIDA", rotulo: "Concluída", cor: "bg-emerald-200 text-emerald-900" },
  { valor: "CANCELADA", rotulo: "Cancelada", cor: "bg-red-200 text-red-900" },
];

const D = (v: number) => new Prisma.Decimal(v.toFixed(2));
const itensDaVenda = (tx: Tx, vendaId: string) => async () =>
  (await tx.vendaItem.findMany({ where: { vendaId } })).map((i) => ({ id: i.id, produtoId: i.produtoId, quantidade: Number(i.quantidade) }));

async function travarVenda(tx: Tx, vendaId: string) {
  const [v] = await tx.$queryRaw<{ id: string; situacao: SituacaoVenda }[]>`
    SELECT id, situacao FROM "Venda" WHERE id = ${vendaId} FOR NO KEY UPDATE`;
  if (!v) throw new EstoqueError("Venda não encontrada");
  return v;
}

export async function criarVenda(dados: { tipo?: TipoVenda; clienteId?: string; situacao?: SituacaoVenda; vendedorId?: string }) {
  return prisma.$transaction(async (tx) => {
    const numero = await proximoNumero(tx, "VENDA");
    return tx.venda.create({ data: { numero, ...dados } });
  });
}

async function adicionarItemTx(tx: Tx, vendaId: string, item: { produtoId: string; quantidade: number; valorUnit?: number; desconto?: number }) {
  const v = await travarVenda(tx, vendaId);
  const estado = estadoEstoqueVenda(v.situacao);
  if (estado === "BAIXADO" || v.situacao === "CANCELADA") throw new EstoqueError("Venda já concluída ou cancelada");
  const p = await tx.produto.findUniqueOrThrow({ where: { id: item.produtoId } });
  const valorUnit = item.valorUnit ?? Number(p.precoVenda);
  const desconto = item.desconto ?? 0;
  const criado = await tx.vendaItem.create({
    data: {
      vendaId, produtoId: p.id, quantidade: item.quantidade, valorUnit: D(valorUnit), custoUnit: p.custo,
      desconto: D(desconto), subtotal: D(valorUnit * item.quantidade - desconto),
    },
  });
  const alocacoes = estado === "RESERVADO"
    ? await reservarItem(tx, { produtoId: p.id, quantidade: item.quantidade, origemTipo: "VENDA", origemId: vendaId, origemItemId: criado.id })
    : [];
  await recalcular(tx, vendaId);
  return { item: criado, alocacoes };
}

export const adicionarItem = (vendaId: string, item: Parameters<typeof adicionarItemTx>[2]) =>
  prisma.$transaction((tx) => adicionarItemTx(tx, vendaId, item));

export async function removerItem(vendaId: string, itemId: string) {
  return prisma.$transaction(async (tx) => {
    const v = await travarVenda(tx, vendaId);
    if (estadoEstoqueVenda(v.situacao) === "BAIXADO") throw new EstoqueError("Venda já concluída");
    await liberarItem(tx, itemId);
    await tx.vendaItem.deleteMany({ where: { id: itemId, vendaId } });
    await recalcular(tx, vendaId);
  });
}

async function recalcular(tx: Tx, vendaId: string) {
  const [p, s, v] = await Promise.all([
    tx.vendaItem.aggregate({ where: { vendaId }, _sum: { subtotal: true } }),
    tx.vendaItemServico.aggregate({ where: { vendaId }, _sum: { subtotal: true } }),
    tx.venda.findUniqueOrThrow({ where: { id: vendaId }, select: { desconto: true, frete: true } }),
  ]);
  const total = Number(p._sum.subtotal ?? 0) + Number(s._sum.subtotal ?? 0) - Number(v.desconto) + Number(v.frete);
  await tx.venda.update({ where: { id: vendaId }, data: { total: D(total) } });
  return total;
}

/**
 * Conclui a venda: baixa estoque, registra pagamentos e gera contas a receber.
 * A soma dos pagamentos precisa fechar com o total.
 */
async function concluirTx(tx: Tx, vendaId: string, pagamentos: Pagamento[], opts: { permitirNegativo?: boolean; usuarioId?: string } = {}) {
  const v = await travarVenda(tx, vendaId);
  if (v.situacao === "CONCLUIDA") throw new EstoqueError("Venda já concluída");
  if (v.situacao === "CANCELADA") throw new EstoqueError("Venda cancelada");
  const total = await recalcular(tx, vendaId);
  const pago = pagamentos.reduce((s, p) => s + p.valor, 0);
  if (Math.abs(pago - total) > 0.005)
    throw new EstoqueError(`Pagamentos (${pago.toFixed(2)}) não fecham com o total (${total.toFixed(2)})`);

  await transicionarEstoque(tx, "VENDA", vendaId, estadoEstoqueVenda(v.situacao), "BAIXADO", itensDaVenda(tx, vendaId), opts);
  await tx.vendaPagamento.deleteMany({ where: { vendaId } });
  await tx.vendaPagamento.createMany({
    data: pagamentos.map((p) => ({ vendaId, formaPagamentoId: p.formaPagamentoId, valor: D(p.valor), parcelas: p.parcelas ?? 1 })),
  });
  const venda = await tx.venda.update({ where: { id: vendaId }, data: { situacao: "CONCLUIDA" } });
  await garantirPadroes(tx);
  await gerarRecebimentos(tx, {
    origemTipo: "VENDA",
    origemId: vendaId,
    pessoaId: venda.clienteId,
    descricao: `Venda ${venda.numero}`,
    categoriaId: (await categoria(tx, "Venda de produtos", "RECEBER")).id,
    pagamentos,
  });
  return venda;
}

export const concluirVenda = (vendaId: string, pagamentos: Pagamento[], opts?: { permitirNegativo?: boolean; usuarioId?: string }) =>
  prisma.$transaction((tx) => concluirTx(tx, vendaId, pagamentos, opts));

/** Troca entre orçamento / aberta / cancelada (concluir é por concluirVenda). */
export async function alterarSituacaoVenda(vendaId: string, nova: Exclude<SituacaoVenda, "CONCLUIDA">, opts: { usuarioId?: string; forcar?: boolean } = {}) {
  return prisma.$transaction(async (tx) => {
    const v = await travarVenda(tx, vendaId);
    if (v.situacao === "CONCLUIDA") await cancelarRecebimentos(tx, "VENDA", vendaId, opts.forcar);
    await transicionarEstoque(tx, "VENDA", vendaId, estadoEstoqueVenda(v.situacao), estadoEstoqueVenda(nova), itensDaVenda(tx, vendaId), opts);
    return tx.venda.update({ where: { id: vendaId }, data: { situacao: nova } });
  });
}

/** PDV: cria, adiciona itens e conclui numa única transação. */
export async function vendaBalcao(args: {
  clienteId?: string;
  itens: { produtoId: string; quantidade: number; valorUnit?: number; desconto?: number }[];
  pagamentos: Pagamento[];
  desconto?: number;
  usuarioId?: string;
}) {
  if (!args.itens.length) throw new EstoqueError("Nenhum item");
  return prisma.$transaction(async (tx) => {
    const numero = await proximoNumero(tx, "VENDA");
    const venda = await tx.venda.create({
      data: { numero, tipo: "BALCAO", situacao: "ABERTA", clienteId: args.clienteId, desconto: D(args.desconto ?? 0), vendedorId: args.usuarioId },
    });
    for (const i of args.itens) await adicionarItemTx(tx, venda.id, i);
    // no balcão a peça já está na mão do cliente: não bloqueia por falta de saldo
    return concluirTx(tx, venda.id, args.pagamentos, { permitirNegativo: true, usuarioId: args.usuarioId });
  });
}
