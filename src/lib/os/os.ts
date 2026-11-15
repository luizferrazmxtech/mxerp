import { Prisma, SituacaoOs } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import {
  baixarDocumento,
  cobrirFaltas,
  estornarBaixa,
  liberarDocumento,
  liberarItem,
  reservarItem,
  EstoqueError,
} from "@/lib/estoque/estoque";
import { proximoNumero } from "@/lib/sequencia";

/** Em que "estado de estoque" cada situação deixa a OS. */
export type EstadoEstoque = "RESERVADO" | "BAIXADO" | "LIVRE";

export function estadoEstoque(s: SituacaoOs): EstadoEstoque {
  switch (s) {
    case "CONCLUIDA":
    case "FATURADA":
      return "BAIXADO";
    case "CANCELADA":
    case "DEVOLVIDA_SEM_REPARO":
      return "LIVRE";
    default:
      return "RESERVADO";
  }
}

export const SITUACOES_OS: { valor: SituacaoOs; rotulo: string; cor: string }[] = [
  { valor: "ABERTA", rotulo: "Em aberto", cor: "bg-slate-200 text-slate-800" },
  { valor: "EM_ANDAMENTO", rotulo: "Em andamento", cor: "bg-amber-200 text-amber-900" },
  { valor: "AGUARDANDO_PECA", rotulo: "Aguardando peça", cor: "bg-orange-200 text-orange-900" },
  { valor: "AGUARDANDO_APROVACAO", rotulo: "Aguardando aprovação", cor: "bg-sky-200 text-sky-900" },
  { valor: "CONCLUIDA", rotulo: "Concluída", cor: "bg-emerald-200 text-emerald-900" },
  { valor: "FATURADA", rotulo: "Faturada", cor: "bg-violet-200 text-violet-900" },
  { valor: "CANCELADA", rotulo: "Cancelada", cor: "bg-red-200 text-red-900" },
  { valor: "DEVOLVIDA_SEM_REPARO", rotulo: "Devolvida sem reparo", cor: "bg-purple-200 text-purple-900" },
];

const D = (v: number) => new Prisma.Decimal(v.toFixed(2));

export async function criarOs(dados: {
  clienteId: string;
  tecnicoId?: string;
  equipamento?: string;
  defeito?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const numero = await proximoNumero(tx, "OS");
    return tx.ordemServico.create({ data: { numero, ...dados } });
  });
}

async function osEditavel(tx: Tx, osId: string) {
  const [os] = await tx.$queryRaw<{ id: string; situacao: SituacaoOs }[]>`
    SELECT id, situacao FROM "OrdemServico" WHERE id = ${osId} FOR NO KEY UPDATE`;
  if (!os) throw new EstoqueError("OS não encontrada");
  if (estadoEstoque(os.situacao) !== "RESERVADO")
    throw new EstoqueError("Reabra a OS para alterar os produtos");
  return os;
}

/** Adiciona produto à OS e já reserva no estoque. Retorna onde pegar. */
export async function adicionarProduto(
  osId: string,
  item: { produtoId: string; quantidade: number; valorUnit?: number; desconto?: number },
) {
  return prisma.$transaction(async (tx) => {
    await osEditavel(tx, osId);
    const produto = await tx.produto.findUniqueOrThrow({ where: { id: item.produtoId } });
    const valorUnit = item.valorUnit ?? Number(produto.precoVenda);
    const desconto = item.desconto ?? 0;
    const criado = await tx.osItemProduto.create({
      data: {
        osId,
        produtoId: produto.id,
        quantidade: item.quantidade,
        valorUnit: D(valorUnit),
        custoUnit: produto.custo,
        desconto: D(desconto),
        subtotal: D(valorUnit * item.quantidade - desconto),
      },
    });
    const alocacoes = await reservarItem(tx, {
      produtoId: produto.id,
      quantidade: item.quantidade,
      origemTipo: "OS",
      origemId: osId,
      origemItemId: criado.id,
    });
    await recalcularTotais(tx, osId);
    return { item: criado, alocacoes };
  });
}

export async function alterarQuantidade(osId: string, itemId: string, quantidade: number) {
  return prisma.$transaction(async (tx) => {
    await osEditavel(tx, osId);
    const item = await tx.osItemProduto.findFirstOrThrow({ where: { id: itemId, osId } });
    await liberarItem(tx, itemId);
    const valor = Number(item.valorUnit);
    await tx.osItemProduto.update({
      where: { id: itemId },
      data: { quantidade, subtotal: D(valor * quantidade - Number(item.desconto)) },
    });
    const alocacoes = await reservarItem(tx, {
      produtoId: item.produtoId,
      quantidade,
      origemTipo: "OS",
      origemId: osId,
      origemItemId: itemId,
    });
    await recalcularTotais(tx, osId);
    return alocacoes;
  });
}

export async function removerProduto(osId: string, itemId: string) {
  return prisma.$transaction(async (tx) => {
    await osEditavel(tx, osId);
    await tx.osItemProduto.findFirstOrThrow({ where: { id: itemId, osId } });
    await liberarItem(tx, itemId);
    await tx.osItemProduto.delete({ where: { id: itemId } });
    await recalcularTotais(tx, osId);
  });
}

export async function adicionarServico(osId: string, item: { servicoId: string; quantidade?: number; valorUnit?: number }) {
  return prisma.$transaction(async (tx) => {
    const s = await tx.servico.findUniqueOrThrow({ where: { id: item.servicoId } });
    const q = item.quantidade ?? 1;
    const v = item.valorUnit ?? Number(s.preco);
    await tx.osItemServico.create({
      data: { osId, servicoId: s.id, quantidade: q, valorUnit: D(v), subtotal: D(v * q) },
    });
    await recalcularTotais(tx, osId);
  });
}

export async function removerServico(osId: string, itemId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.osItemServico.deleteMany({ where: { id: itemId, osId } });
    await recalcularTotais(tx, osId);
  });
}

/**
 * Troca a situação aplicando as regras de estoque:
 *  reservado → baixado : baixa (sai das prateleiras reservadas)
 *  reservado → livre   : libera as reservas
 *  baixado   → reservado: estorna e reserva de novo
 *  baixado   → livre   : estorna
 *  livre     → reservado: reserva de novo
 */
export async function alterarSituacao(
  osId: string,
  nova: SituacaoOs,
  opts: { permitirNegativo?: boolean; usuarioId?: string } = {},
) {
  return prisma.$transaction(async (tx) => {
    const [os] = await tx.$queryRaw<{ id: string; situacao: SituacaoOs }[]>`
      SELECT id, situacao FROM "OrdemServico" WHERE id = ${osId} FOR NO KEY UPDATE`;
    if (!os) throw new EstoqueError("OS não encontrada");
    const de = estadoEstoque(os.situacao);
    const para = estadoEstoque(nova);

    if (de === "RESERVADO" && para === "BAIXADO") {
      await baixarDocumento(tx, "OS", osId, opts);
    } else if (de === "RESERVADO" && para === "LIVRE") {
      await liberarDocumento(tx, "OS", osId);
    } else if (de === "BAIXADO" && para === "RESERVADO") {
      const afetados = await estornarBaixa(tx, "OS", osId, { usuarioId: opts.usuarioId, cobrirFaltas: false });
      await reservarTodos(tx, osId);
      for (const p of afetados) await cobrirFaltas(tx, p);
    } else if (de === "BAIXADO" && para === "LIVRE") {
      await estornarBaixa(tx, "OS", osId, { usuarioId: opts.usuarioId });
    } else if (de === "LIVRE" && para === "RESERVADO") {
      await reservarTodos(tx, osId);
    }

    const rotulo = (s: SituacaoOs) => SITUACOES_OS.find((x) => x.valor === s)?.rotulo ?? s;
    await tx.osHistorico.create({
      data: { osId, descricao: `Situação: ${rotulo(os.situacao)} → ${rotulo(nova)}`, usuarioId: opts.usuarioId },
    });
    return tx.ordemServico.update({
      where: { id: osId },
      data: { situacao: nova, saida: para === "BAIXADO" ? new Date() : para === "RESERVADO" ? null : undefined },
    });
  });
}

async function reservarTodos(tx: Tx, osId: string) {
  const itens = await tx.osItemProduto.findMany({ where: { osId } });
  for (const i of itens) {
    await reservarItem(tx, {
      produtoId: i.produtoId,
      quantidade: Number(i.quantidade),
      origemTipo: "OS",
      origemId: osId,
      origemItemId: i.id,
    });
  }
}

async function recalcularTotais(tx: Tx, osId: string) {
  const [p, s, os] = await Promise.all([
    tx.osItemProduto.aggregate({ where: { osId }, _sum: { subtotal: true } }),
    tx.osItemServico.aggregate({ where: { osId }, _sum: { subtotal: true } }),
    tx.ordemServico.findUniqueOrThrow({ where: { id: osId }, select: { desconto: true } }),
  ]);
  const tp = Number(p._sum.subtotal ?? 0);
  const ts = Number(s._sum.subtotal ?? 0);
  await tx.ordemServico.update({
    where: { id: osId },
    data: { totalProdutos: D(tp), totalServicos: D(ts), total: D(tp + ts - Number(os.desconto)) },
  });
}

/** Lista de separação: o que pegar, de onde, para a OS. */
export async function listaSeparacao(osId: string) {
  const reservas = await prisma.reserva.findMany({
    where: { origemTipo: "OS", origemId: osId, status: "ATIVA" },
    include: {
      produto: { select: { codigo: true, nome: true, unidade: true } },
      local: { include: { deposito: true } },
    },
  });
  return reservas.sort((a, b) => (a.local?.codigo ?? "~").localeCompare(b.local?.codigo ?? "~"));
}
