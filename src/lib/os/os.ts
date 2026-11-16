import { Prisma, SituacaoOs, type PrioridadeOs } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { liberarItem, reservarItem, EstoqueError } from "@/lib/estoque/estoque";
import { transicionarEstoque, type EstadoEstoque } from "@/lib/estoque/transicao";
import { proximoNumero } from "@/lib/sequencia";
import { cancelarRecebimentos, gerarRecebimentos, type Pagamento } from "@/lib/financeiro/lancamentos";
import { categoria, garantirPadroes } from "@/lib/financeiro/padroes";

/** Em que "estado de estoque" cada situação deixa a OS. */
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

export const PRIORIDADES_OS: { valor: PrioridadeOs; rotulo: string }[] = [
  { valor: "MUITO_URGENTE", rotulo: "Muito urgente" },
  { valor: "URGENTE", rotulo: "Urgente" },
  { valor: "ALTA", rotulo: "Alta" },
  { valor: "MEDIA", rotulo: "Média" },
  { valor: "BAIXA", rotulo: "Baixa" },
];

export const SITUACOES_OS: { valor: SituacaoOs; rotulo: string; cor: string }[] = [
  { valor: "ABERTA", rotulo: "Em aberto", cor: "border-slate-300 bg-white text-slate-600" },
  { valor: "EM_ANDAMENTO", rotulo: "Em andamento", cor: "border-amber-300 bg-amber-50 text-amber-700" },
  { valor: "AGUARDANDO_PECA", rotulo: "Aguardando peça", cor: "border-orange-300 bg-orange-50 text-orange-700" },
  { valor: "AGUARDANDO_APROVACAO", rotulo: "Aguardando aprovação", cor: "border-sky-300 bg-sky-50 text-sky-700" },
  { valor: "CONCLUIDA", rotulo: "Concluída", cor: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  { valor: "FATURADA", rotulo: "Faturada", cor: "border-green-400 bg-green-50 text-green-700" },
  { valor: "CANCELADA", rotulo: "Cancelada", cor: "border-red-300 bg-red-50 text-red-700" },
  { valor: "DEVOLVIDA_SEM_REPARO", rotulo: "Devolvida sem reparo", cor: "border-purple-300 bg-purple-50 text-purple-700" },
];

const D = (v: number) => new Prisma.Decimal(v.toFixed(2));

export type EquipamentoOs = {
  equipamento: string; marca?: string | null; modelo?: string | null; serie?: string | null;
  condicoes?: string | null; defeitos?: string | null; acessorios?: string | null;
  solucao?: string | null; laudo?: string | null; garantia?: string | null;
};

/** Cabeçalho da OS (bloco "dados", responsáveis, equipamentos, totais e observações). */
export type CabecalhoOs = {
  clienteId: string;
  tecnicoId?: string | null;
  vendedorId?: string | null;
  entrada?: Date;
  previsao?: Date | null;
  saida?: Date | null;
  canal?: string;
  prioridade?: PrioridadeOs | null;
  observacoes?: string | null;
  observacaoInterna?: string | null;
  desconto?: number;
  frete?: number;
  outros?: number;
  equipamentos?: EquipamentoOs[];
};

const equipamentosData = (eqs: EquipamentoOs[] = []) =>
  eqs.filter((e) => e.equipamento?.trim()).map((e, i) => ({ ...e, equipamento: e.equipamento.trim(), ordem: i + 1 }));

function cabecalhoData(d: CabecalhoOs) {
  const { equipamentos: _eq, desconto, frete, outros, ...resto } = d;
  void _eq;
  return {
    ...resto,
    ...(desconto !== undefined ? { desconto: D(desconto) } : {}),
    ...(frete !== undefined ? { frete: D(frete) } : {}),
    ...(outros !== undefined ? { outros: D(outros) } : {}),
  };
}

/** Situação configurável que corresponde ao estado antigo (o formulário novo usa as situações configuráveis). */
const CFG_OS: Record<SituacaoOs, string> = { ABERTA: "so_aberto", EM_ANDAMENTO: "so_andamento", AGUARDANDO_PECA: "so_andamento", AGUARDANDO_APROVACAO: "so_andamento", CONCLUIDA: "so_faturar", FATURADA: "so_concretizada", CANCELADA: "so_cancelada", DEVOLVIDA_SEM_REPARO: "so_devolvido" };
async function cfgOs(tx: Tx, s: SituacaoOs) {
  return (await tx.situacaoOsConfig.findUnique({ where: { id: CFG_OS[s] }, select: { id: true } }))?.id ?? null;
}

export async function criarOsTx(tx: Tx, dados: CabecalhoOs) {
  const numero = await proximoNumero(tx, "OS");
  const os = await tx.ordemServico.create({
    data: { numero, situacaoId: await cfgOs(tx, "ABERTA"), ...cabecalhoData(dados), equipamentos: { create: equipamentosData(dados.equipamentos) } },
  });
  await recalcularTotais(tx, os.id);
  return os;
}

export async function criarOs(dados: CabecalhoOs) {
  return prisma.$transaction((tx) => criarOsTx(tx, dados));
}

export async function atualizarCabecalhoTx(tx: Tx, osId: string, dados: CabecalhoOs) {
  await tx.ordemServico.update({ where: { id: osId }, data: cabecalhoData(dados) });
  if (dados.equipamentos) {
    await tx.osEquipamento.deleteMany({ where: { osId } });
    await tx.osEquipamento.createMany({ data: equipamentosData(dados.equipamentos).map((e) => ({ ...e, osId })) });
  }
  await recalcularTotais(tx, osId);
}

async function osEditavel(tx: Tx, osId: string) {
  const [os] = await tx.$queryRaw<{ id: string; situacao: SituacaoOs }[]>`
    SELECT id, situacao FROM "OrdemServico" WHERE id = ${osId} FOR NO KEY UPDATE`;
  if (!os) throw new EstoqueError("OS não encontrada");
  if (estadoEstoque(os.situacao) !== "RESERVADO")
    throw new EstoqueError("Reabra a OS para alterar os produtos");
  return os;
}

type ItemProdutoNovo = { produtoId: string; quantidade: number; valorUnit?: number; desconto?: number };

async function adicionarProdutoTx(tx: Tx, osId: string, item: ItemProdutoNovo) {
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
}

/** Adiciona produto à OS e já reserva no estoque. Retorna onde pegar. */
export async function adicionarProduto(osId: string, item: ItemProdutoNovo) {
  return prisma.$transaction((tx) => adicionarProdutoTx(tx, osId, item));
}

async function alterarItemProdutoTx(tx: Tx, osId: string, itemId: string, mudar: { quantidade?: number; valorUnit?: number }) {
  await osEditavel(tx, osId);
  const item = await tx.osItemProduto.findFirstOrThrow({ where: { id: itemId, osId } });
  const quantidade = mudar.quantidade ?? Number(item.quantidade);
  const valor = mudar.valorUnit ?? Number(item.valorUnit);
  const mudouQtd = quantidade !== Number(item.quantidade);
  if (mudouQtd) await liberarItem(tx, itemId);
  await tx.osItemProduto.update({
    where: { id: itemId },
    data: { quantidade, valorUnit: D(valor), subtotal: D(valor * quantidade - Number(item.desconto)) },
  });
  const alocacoes = mudouQtd
    ? await reservarItem(tx, { produtoId: item.produtoId, quantidade, origemTipo: "OS", origemId: osId, origemItemId: itemId })
    : [];
  await recalcularTotais(tx, osId);
  return alocacoes;
}

export async function alterarQuantidade(osId: string, itemId: string, quantidade: number) {
  return prisma.$transaction((tx) => alterarItemProdutoTx(tx, osId, itemId, { quantidade }));
}

async function removerProdutoTx(tx: Tx, osId: string, itemId: string) {
  await osEditavel(tx, osId);
  await tx.osItemProduto.findFirstOrThrow({ where: { id: itemId, osId } });
  await liberarItem(tx, itemId);
  await tx.osItemProduto.delete({ where: { id: itemId } });
  await recalcularTotais(tx, osId);
}

export async function removerProduto(osId: string, itemId: string) {
  return prisma.$transaction((tx) => removerProdutoTx(tx, osId, itemId));
}

async function adicionarServicoTx(tx: Tx, osId: string, item: { servicoId: string; quantidade?: number; valorUnit?: number }) {
  const s = await tx.servico.findUniqueOrThrow({ where: { id: item.servicoId } });
  const q = item.quantidade ?? 1;
  const v = item.valorUnit ?? Number(s.preco);
  await tx.osItemServico.create({
    data: { osId, servicoId: s.id, quantidade: q, valorUnit: D(v), subtotal: D(v * q) },
  });
  await recalcularTotais(tx, osId);
}

export async function adicionarServico(osId: string, item: { servicoId: string; quantidade?: number; valorUnit?: number }) {
  return prisma.$transaction((tx) => adicionarServicoTx(tx, osId, item));
}

export async function removerServico(osId: string, itemId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.osItemServico.deleteMany({ where: { id: itemId, osId } });
    await recalcularTotais(tx, osId);
  });
}

export type ItemFormProduto = { id?: string; produtoId: string; quantidade: number; valorUnit: number };
export type ItemFormServico = { id?: string; servicoId: string; quantidade: number; valorUnit: number };

/**
 * Salva a OS inteira vinda do formulário (cadastrar ou editar), numa transação só:
 * cabeçalho, equipamentos, produtos (reservando no estoque), serviços e situação.
 */
export async function salvarOs(args: {
  osId?: string;
  cabecalho: CabecalhoOs;
  situacao: SituacaoOs;
  produtos: ItemFormProduto[];
  servicos: ItemFormServico[];
  usuarioId?: string;
  permitirNegativo?: boolean;
  forcar?: boolean;
}) {
  if (args.situacao === "FATURADA" && !args.osId) throw new EstoqueError("Cadastre a OS e depois use \"Faturar\"");
  return prisma.$transaction(async (tx) => {
    let osId = args.osId;
    let situacaoAtual: SituacaoOs = "ABERTA";
    if (osId) {
      const atual = await tx.ordemServico.findUniqueOrThrow({ where: { id: osId }, select: { situacao: true } });
      situacaoAtual = atual.situacao;
      if (args.situacao === "FATURADA" && situacaoAtual !== "FATURADA") throw new EstoqueError("Use \"Faturar\" informando as formas de pagamento");
      await atualizarCabecalhoTx(tx, osId, args.cabecalho);
    } else {
      osId = (await criarOsTx(tx, args.cabecalho)).id;
    }
    const opts = { permitirNegativo: args.permitirNegativo, usuarioId: args.usuarioId, forcar: args.forcar };
    // reabrindo: primeiro volta a situação (estorna a baixa), depois mexe nos produtos
    const reabre = estadoEstoque(args.situacao) === "RESERVADO" && estadoEstoque(situacaoAtual) !== "RESERVADO";
    if (reabre) await alterarSituacaoTx(tx, osId, args.situacao, opts);

    const existentes = await tx.osItemProduto.findMany({ where: { osId } });
    const mudaProdutos =
      existentes.length !== args.produtos.length ||
      args.produtos.some((p) => {
        const e = existentes.find((x) => x.id === p.id);
        return !e || Number(e.quantidade) !== p.quantidade || Number(e.valorUnit) !== p.valorUnit;
      });
    const alocacoes: Awaited<ReturnType<typeof reservarItem>> = [];
    if (mudaProdutos) {
      for (const e of existentes) if (!args.produtos.some((p) => p.id === e.id)) await removerProdutoTx(tx, osId, e.id);
      for (const p of args.produtos) {
        if (!(p.quantidade > 0)) throw new EstoqueError("Informe a quantidade de todos os produtos");
        const e = p.id ? existentes.find((x) => x.id === p.id) : undefined;
        if (!e) alocacoes.push(...(await adicionarProdutoTx(tx, osId, p)).alocacoes);
        else if (Number(e.quantidade) !== p.quantidade || Number(e.valorUnit) !== p.valorUnit)
          alocacoes.push(...(await alterarItemProdutoTx(tx, osId, e.id, p)));
      }
    }

    const servAtuais = await tx.osItemServico.findMany({ where: { osId } });
    for (const e of servAtuais) if (!args.servicos.some((s) => s.id === e.id)) await tx.osItemServico.delete({ where: { id: e.id } });
    for (const s of args.servicos) {
      const e = s.id ? servAtuais.find((x) => x.id === s.id) : undefined;
      if (!e) await adicionarServicoTx(tx, osId, s);
      else if (Number(e.quantidade) !== s.quantidade || Number(e.valorUnit) !== s.valorUnit)
        await tx.osItemServico.update({ where: { id: e.id }, data: { quantidade: s.quantidade, valorUnit: D(s.valorUnit), subtotal: D(s.quantidade * s.valorUnit) } });
    }
    await recalcularTotais(tx, osId);

    if (!reabre && args.situacao !== situacaoAtual) await alterarSituacaoTx(tx, osId, args.situacao, opts);
    if (!args.osId) await tx.osHistorico.create({ data: { osId, descricao: "OS cadastrada", usuarioId: args.usuarioId } });
    return { osId, alocacoes };
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
  opts: { permitirNegativo?: boolean; usuarioId?: string; forcar?: boolean } = {},
) {
  if (nova === "FATURADA") throw new EstoqueError("Use \"Faturar\" informando as formas de pagamento");
  return prisma.$transaction((tx) => alterarSituacaoTx(tx, osId, nova, opts));
}

export async function alterarSituacaoTx(
  tx: Tx,
  osId: string,
  nova: SituacaoOs,
  opts: { permitirNegativo?: boolean; usuarioId?: string; forcar?: boolean } = {},
) {
  const [os] = await tx.$queryRaw<{ id: string; situacao: SituacaoOs }[]>`
    SELECT id, situacao FROM "OrdemServico" WHERE id = ${osId} FOR NO KEY UPDATE`;
  if (!os) throw new EstoqueError("OS não encontrada");
  if (os.situacao === "FATURADA" && nova !== "FATURADA") await cancelarRecebimentos(tx, "OS", osId, opts.forcar);
  const de = estadoEstoque(os.situacao);
  const para = estadoEstoque(nova);
  await transicionarEstoque(tx, "OS", osId, de, para, async () =>
    (await tx.osItemProduto.findMany({ where: { osId } })).map((i) => ({ id: i.id, produtoId: i.produtoId, quantidade: Number(i.quantidade) })),
    opts,
  );

  const rotulo = (s: SituacaoOs) => SITUACOES_OS.find((x) => x.valor === s)?.rotulo ?? s;
  await tx.osHistorico.create({
    data: { osId, descricao: `Situação: ${rotulo(os.situacao)} → ${rotulo(nova)}`, usuarioId: opts.usuarioId },
  });
  return tx.ordemServico.update({
    where: { id: osId },
    data: { situacao: nova, situacaoId: await cfgOs(tx, nova), saida: para === "BAIXADO" ? new Date() : para === "RESERVADO" ? null : undefined },
  });
}

/** Fatura a OS: baixa o estoque (se ainda não baixou) e gera as contas a receber. */
export async function faturarOs(
  osId: string,
  pagamentos: Pagamento[],
  opts: { permitirNegativo?: boolean; usuarioId?: string } = {},
) {
  return prisma.$transaction(async (tx) => {
    const os = await tx.ordemServico.findUniqueOrThrow({ where: { id: osId } });
    if (os.situacao === "FATURADA") throw new EstoqueError("OS já faturada");
    if (os.situacao === "CANCELADA" || os.situacao === "DEVOLVIDA_SEM_REPARO") throw new EstoqueError("OS cancelada/devolvida");
    const total = Number(os.total);
    const pago = pagamentos.reduce((s, p) => s + p.valor, 0);
    if (Math.abs(pago - total) > 0.005)
      throw new EstoqueError(`Pagamentos (${pago.toFixed(2)}) não fecham com o total (${total.toFixed(2)})`);
    await alterarSituacaoTx(tx, osId, "FATURADA", opts);
    await garantirPadroes(tx);
    if (total > 0)
      await gerarRecebimentos(tx, {
        origemTipo: "OS",
        origemId: osId,
        pessoaId: os.clienteId,
        descricao: `OS ${os.numero}`,
        categoriaId: (await categoria(tx, "Prestação de serviços", "RECEBER")).id,
        pagamentos,
      });
  });
}

export async function recalcularTotais(tx: Tx, osId: string) {
  const [p, s, os] = await Promise.all([
    tx.osItemProduto.aggregate({ where: { osId }, _sum: { subtotal: true } }),
    tx.osItemServico.aggregate({ where: { osId }, _sum: { subtotal: true } }),
    tx.ordemServico.findUniqueOrThrow({ where: { id: osId }, select: { desconto: true, frete: true, outros: true } }),
  ]);
  const tp = Number(p._sum.subtotal ?? 0);
  const ts = Number(s._sum.subtotal ?? 0);
  await tx.ordemServico.update({
    where: { id: osId },
    data: { totalProdutos: D(tp), totalServicos: D(ts), total: D(tp + ts + Number(os.frete) + Number(os.outros) - Number(os.desconto)) },
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
