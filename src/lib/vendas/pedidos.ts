import { centroPorNome } from "@/lib/financeiro/plano";
import { Prisma, type EstoqueSituacao, type PapelUsuario, type SituacaoVenda, type SituacaoVendaConfig } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { entrada } from "@/lib/estoque/estoque";
import { transicionarEstoque, type EstadoEstoque } from "@/lib/estoque/transicao";
import { cancelarRecebimentos } from "@/lib/financeiro/lancamentos";
import { categoria, garantirPadroes, receitaDocumento } from "@/lib/financeiro/padroes";
import { proximoNumero } from "@/lib/sequencia";
import { diaSP, parseDia, periodoDia } from "@/lib/datas";
import { descontoLinha, lerNumero, subtotalProduto, subtotalServico, totais, type DadosOrcamento } from "@/lib/orcamentos/tipos";

/**
 * Pedido de venda completo (padrão Gestão Click). A situação configurável decide o que acontece:
 * estoque (reservar, lançar ou não mexer) e financeiro (lançar as parcelas em contas a receber).
 */

export type DadosPedido = DadosOrcamento;
type Usuario = { id: string; nome: string; papel?: PapelUsuario };

export class PedidoError extends Error {}

const t = (s: string | undefined | null) => (s ?? "").trim() || null;
const n = (s: string) => lerNumero(s) ?? 0;
const D = (v: number) => new Prisma.Decimal(v.toFixed(2));
const dia = (s: string) => (t(s) ? parseDia(s) : null);

export const estadoDe = (e: EstoqueSituacao): EstadoEstoque => (e === "LANCAR" ? "BAIXADO" : e === "RESERVAR" ? "RESERVADO" : "LIVRE");
/** A coluna antiga `situacao` continua sendo o "estado" usado pelo PDV, caixa, notas e relatórios. */
export const enumDe = (e: EstoqueSituacao): SituacaoVenda => (e === "LANCAR" ? "CONCLUIDA" : e === "RESERVAR" ? "ABERTA" : "CANCELADA");
const estadoDoEnum = (s: SituacaoVenda): EstadoEstoque => (s === "CONCLUIDA" ? "BAIXADO" : s === "ABERTA" ? "RESERVADO" : "LIVRE");

export async function situacaoPadraoVenda(tx: Tx | typeof prisma = prisma) {
  const s = (await tx.situacaoVendaConfig.findFirst({ where: { padrao: true } })) ?? (await tx.situacaoVendaConfig.findFirst({ orderBy: { ordem: "asc" } }));
  if (!s) throw new PedidoError("Cadastre ao menos uma situação de venda");
  return s;
}
/** Situação que corresponde a um estado antigo (PDV e funções antigas). */
export async function situacaoDoEstado(tx: Tx, s: SituacaoVenda) {
  if (s === "CONCLUIDA") {
    const p = await tx.situacaoVendaConfig.findFirst({ where: { padrao: true, estoque: "LANCAR" } });
    if (p) return p;
  }
  const estoque: EstoqueSituacao = s === "CONCLUIDA" ? "LANCAR" : s === "ABERTA" ? "RESERVAR" : "NAO";
  return tx.situacaoVendaConfig.findFirst({ where: { estoque, ...(s === "CONCLUIDA" ? { financeiro: true } : {}) }, orderBy: { ordem: "asc" } });
}

async function travar(tx: Tx, vendaId: string) {
  const [v] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Venda" WHERE id = ${vendaId} FOR NO KEY UPDATE`;
  if (!v) throw new PedidoError("Venda não encontrada");
  return tx.venda.findUniqueOrThrow({ where: { id: vendaId }, include: { situacaoCfg: true } });
}

const itensDoc = (tx: Tx, vendaId: string) => async () =>
  (await tx.vendaItem.findMany({ where: { vendaId } })).map((i) => ({ id: i.id, produtoId: i.produtoId, quantidade: Number(i.quantidade) }));

/** Lança as parcelas da venda em contas a receber (pendentes; a baixa é no financeiro ou na conciliação). */
async function lancarFinanceiro(tx: Tx, vendaId: string) {
  const v = await tx.venda.findUniqueOrThrow({ where: { id: vendaId }, include: { parcelas: { orderBy: { numero: "asc" } } } });
  if (!(Number(v.total) > 0)) return; // venda sem valor (garantia, cortesia) não gera conta a receber de R$ 0,00
  await garantirPadroes(tx);
  const centro = await centroPorNome(tx, v.centroCusto);
  const rec = await receitaDocumento(tx, Number(v.totalProdutos), Number(v.totalServicos));
  const parcelas = v.parcelas.length ? v.parcelas : [{ numero: 1, vencimento: v.data, valor: v.total, formaPagamentoId: v.formaPagamentoId }];
  for (const p of parcelas) {
    await tx.lancamento.create({
      data: {
        tipo: "RECEBER", descricao: parcelas.length > 1 ? `Venda de nº ${v.numero} (${p.numero}/${parcelas.length})` : `Venda de nº ${v.numero}`,
        pessoaId: v.clienteId, categoriaId: rec.categoriaId, formaPagamentoId: p.formaPagamentoId ?? v.formaPagamentoId, valor: p.valor,
        vencimento: p.vencimento, competencia: diaSP(v.data), parcela: p.numero, totalParcelas: parcelas.length, origemTipo: "VENDA", origemId: v.id, centroCustoId: centro,
        rateio: { create: rec.rateio },
      },
    });
  }
}

/**
 * Venda migrada do Gestão Click já concretizada: a baixa foi feita lá (o saldo do backup já vem descontado),
 * então aqui não há movimento para estornar. Ao sair do "lançado", devolve as peças com uma entrada de ajuste
 * e a venda passa a ser tratada como "livre". Retorna o estado efetivo.
 */
async function estadoEfetivo(tx: Tx, vendaId: string, estado: EstadoEstoque, usuarioId?: string): Promise<EstadoEstoque> {
  if (estado !== "BAIXADO") return estado;
  const v = await tx.venda.findUniqueOrThrow({ where: { id: vendaId }, select: { idLegado: true, numero: true, itens: { select: { produtoId: true, quantidade: true, custoUnit: true, produto: { select: { controlaEstoque: true, localPadraoId: true } } } } } });
  if (!v.idLegado) return estado;
  if (await tx.movimentoEstoque.count({ where: { origemTipo: "VENDA", origemId: vendaId } })) return estado;
  const local = (await tx.local.findFirst({ orderBy: { codigo: "asc" }, select: { id: true } }))?.id;
  for (const i of v.itens) {
    const localId = i.produto.localPadraoId ?? local;
    if (!i.produto.controlaEstoque || !localId) continue;
    await entrada(tx, { produtoId: i.produtoId, localId, quantidade: Number(i.quantidade), custoUnit: Number(i.custoUnit), origemTipo: "AJUSTE", origemId: vendaId, observacao: `Venda ${v.numero} migrada do Gestão Click: peças voltam ao estoque`, usuarioId });
  }
  return "LIVRE";
}

/**
 * Aplica a passagem de uma situação para outra: estoque (reserva/baixa/estorno) e financeiro.
 * `refazerItens` roda entre a liberação e a nova aplicação (edição dos produtos).
 */
async function aplicar(tx: Tx, vendaId: string, de: { estado: EstadoEstoque; financeiro: boolean }, para: SituacaoVendaConfig,
  opts: { refazerItens?: () => Promise<void>; refazerFinanceiro?: boolean; permitirNegativo?: boolean; forcar?: boolean; usuarioId?: string }) {
  const temLanc = (await tx.lancamento.count({ where: { origemTipo: "VENDA", origemId: vendaId } })) > 0;
  if (temLanc && (!para.financeiro || opts.refazerFinanceiro)) await cancelarRecebimentos(tx, "VENDA", vendaId, opts.forcar);
  const novo = estadoDe(para.estoque);
  if (opts.refazerItens || novo !== de.estado) de = { ...de, estado: await estadoEfetivo(tx, vendaId, de.estado, opts.usuarioId) };
  if (opts.refazerItens) {
    await transicionarEstoque(tx, "VENDA", vendaId, de.estado, "LIVRE", itensDoc(tx, vendaId), opts);
    await opts.refazerItens();
    await transicionarEstoque(tx, "VENDA", vendaId, "LIVRE", novo, itensDoc(tx, vendaId), opts);
  } else {
    await transicionarEstoque(tx, "VENDA", vendaId, de.estado, novo, itensDoc(tx, vendaId), opts);
  }
  const aindaTem = (await tx.lancamento.count({ where: { origemTipo: "VENDA", origemId: vendaId } })) > 0;
  if (para.financeiro && !aindaTem) await lancarFinanceiro(tx, vendaId);
  await tx.venda.update({ where: { id: vendaId }, data: { situacaoId: para.id, situacao: enumDe(para.estoque) } });
}

/** Cadastra ou altera o pedido inteiro (todos os blocos do formulário), numa transação. */
export async function salvarPedido(d: DadosPedido, u: Usuario, id?: string, opts: { permitirNegativo?: boolean; forcar?: boolean; orcamentoNumero?: number } = {}) {
  if (!t(d.clienteId)) throw new PedidoError("Informe o cliente");
  if (!t(d.data)) throw new PedidoError("Informe a data");
  if (!t(d.canal)) throw new PedidoError("Informe o canal de venda");
  const produtos = d.produtos.filter((l) => l.produtoId);
  const servicos = d.servicos.filter((l) => l.servicoId);
  if (!produtos.length && !servicos.length) throw new PedidoError("Adicione ao menos um produto ou serviço");
  for (const l of [...produtos, ...servicos]) if (!(n(l.quantidade) > 0)) throw new PedidoError(`Informe a quantidade de ${l.nome || "todos os itens"}`);
  const tot = totais({ ...d, produtos, servicos });
  if (tot.total < 0) throw new PedidoError("O desconto é maior que o valor da venda");

  let parcelas: { numero: number; vencimento: Date; valor: Prisma.Decimal; formaPagamentoId: string | null; observacao: string | null }[];
  if (d.condicao === "PARCELADO") {
    if (!d.parcelas.length) throw new PedidoError("Clique em Gerar parcelas");
    const soma = d.parcelas.reduce((s, p) => s + n(p.valor), 0);
    if (Math.abs(soma - tot.total) > 0.009) throw new PedidoError(`A soma das parcelas (${soma.toFixed(2)}) não fecha com o total (${tot.total.toFixed(2)}). Gere as parcelas de novo.`);
    parcelas = d.parcelas.map((p, i) => {
      if (!t(p.vencimento)) throw new PedidoError(`Informe o vencimento da parcela ${i + 1}`);
      return { numero: i + 1, vencimento: parseDia(p.vencimento), valor: D(n(p.valor)), formaPagamentoId: t(p.formaPagamentoId) ?? t(d.formaPagamentoId), observacao: t(p.observacao) };
    });
  } else {
    parcelas = [{ numero: 1, vencimento: dia(d.vencimento) ?? parseDia(d.data), valor: D(tot.total), formaPagamentoId: t(d.formaPagamentoId), observacao: null }];
  }

  const dados = {
    tipo: produtos.length ? ("PEDIDO" as const) : ("SERVICO" as const), clienteId: d.clienteId, vendedorId: t(d.vendedorId),
    data: new Date(`${d.data}T12:00:00-03:00`), prazoEntrega: dia(d.prazoEntrega), canal: d.canal, centroCusto: t(d.centroCusto),
    transportadoraId: t(d.transportadoraId), frete: D(tot.frete), mostrarEntrega: d.mostrarEntrega, enderecoEntregaId: d.mostrarEntrega ? t(d.enderecoEntregaId) : null,
    totalProdutos: D(tot.produtos), totalServicos: D(tot.servicos), desconto: D(tot.desconto), descontoPercentual: d.descontoPct ? new Prisma.Decimal(n(d.desconto)) : null,
    total: D(tot.total), condicao: d.condicao, formaPagamentoId: t(d.formaPagamentoId), intervaloDias: Math.trunc(n(d.intervaloDias)) || 30,
    observacoes: t(d.observacoes), observacaoInterna: t(d.observacaoInterna), camposExtras: (d.camposExtras ?? {}) as Prisma.InputJsonValue,
  };
  const assinaturaItens = (l: { produtoId: string; quantidade: number }[]) => l.map((x) => `${x.produtoId}:${x.quantidade}`).sort().join("|");
  const novosItens = produtos.map((l) => ({ produtoId: l.produtoId, quantidade: n(l.quantidade) }));
  const assinaturaFin = (total: number, ps: { vencimento: Date; valor: Prisma.Decimal; formaPagamentoId: string | null }[]) =>
    `${total.toFixed(2)}#${ps.map((p) => `${p.vencimento.toISOString().slice(0, 10)}:${Number(p.valor).toFixed(2)}:${p.formaPagamentoId ?? ""}`).join("|")}`;

  return prisma.$transaction(async (tx) => {
    const custos = new Map((await tx.produto.findMany({ where: { id: { in: produtos.map((p) => p.produtoId) } }, select: { id: true, custo: true } })).map((p) => [p.id, p.custo]));
    const criarItens = async (vendaId: string) => {
      await tx.vendaItem.deleteMany({ where: { vendaId } });
      await tx.vendaItemServico.deleteMany({ where: { vendaId } });
      for (const [i, l] of produtos.entries())
        await tx.vendaItem.create({ data: { vendaId, ordem: i, produtoId: l.produtoId, detalhes: t(l.detalhes), quantidade: new Prisma.Decimal(n(l.quantidade)), tipoValorId: t(l.tipoValorId), valorUnit: D(n(l.valorUnit)), custoUnit: custos.get(l.produtoId) ?? 0, desconto: D(descontoLinha(n(l.quantidade) * n(l.valorUnit), l.desconto, l.descontoPct)), subtotal: D(subtotalProduto(l)) } });
      await tx.vendaItemServico.createMany({ data: servicos.map((l, i) => ({ vendaId, ordem: i, servicoId: l.servicoId, detalhes: t(l.detalhes), quantidade: new Prisma.Decimal(n(l.quantidade)), valorUnit: D(n(l.valorUnit)), desconto: D(descontoLinha(n(l.quantidade) * n(l.valorUnit), l.desconto, l.descontoPct)), subtotal: D(subtotalServico(l)) })) });
    };
    const para = t(d.situacaoId) ? await tx.situacaoVendaConfig.findUniqueOrThrow({ where: { id: d.situacaoId } }) : await situacaoPadraoVenda(tx);
    const numeroInformado = Math.trunc(n(d.numero));

    if (id) {
      const atual = await travar(tx, id);
      if (atual.tipo === "BALCAO") throw new PedidoError("Venda de balcão não é editada pelo formulário");
      if (atual.situacaoCfg && !atual.situacaoCfg.permiteEdicao) throw new PedidoError(`Vendas na situação "${atual.situacaoCfg.nome}" não podem ser editadas`);
      if (u.papel && atual.situacaoCfg?.bloqueados.includes(u.papel) && atual.situacaoId !== para.id) throw new PedidoError(`Seu grupo não pode trocar a situação "${atual.situacaoCfg.nome}"`);
      const numero = numeroInformado > 0 ? numeroInformado : atual.numero;
      if (numero !== atual.numero && (await tx.venda.findUnique({ where: { numero } }))) throw new PedidoError(`Já existe a venda nº ${numero}`);
      const existentes = await tx.vendaItem.findMany({ where: { vendaId: id } });
      const antigas = await tx.vendaParcela.findMany({ where: { vendaId: id }, orderBy: { numero: "asc" } });
      const mudouItens = assinaturaItens(existentes.map((e) => ({ produtoId: e.produtoId, quantidade: Number(e.quantidade) }))) !== assinaturaItens(novosItens);
      const mudouFin = assinaturaFin(Number(atual.total), antigas) !== assinaturaFin(tot.total, parcelas);
      await tx.venda.update({ where: { id }, data: { ...dados, numero } });
      await tx.vendaParcela.deleteMany({ where: { vendaId: id } });
      await tx.vendaParcela.createMany({ data: parcelas.map((p) => ({ ...p, vendaId: id })) });
      const de = { estado: atual.situacaoCfg ? estadoDe(atual.situacaoCfg.estoque) : estadoDoEnum(atual.situacao), financeiro: !!atual.situacaoCfg?.financeiro };
      if (mudouItens) await aplicar(tx, id, de, para, { ...opts, usuarioId: u.id, refazerFinanceiro: mudouFin, refazerItens: () => criarItens(id) });
      else {
        // mesmos produtos e quantidades: troca valores sem mexer nas reservas/baixas
        const porProduto = new Map(existentes.map((e) => [e.produtoId, e]));
        for (const [i, l] of produtos.entries()) {
          const e = porProduto.get(l.produtoId);
          if (e) await tx.vendaItem.update({ where: { id: e.id }, data: { ordem: i, detalhes: t(l.detalhes), tipoValorId: t(l.tipoValorId), valorUnit: D(n(l.valorUnit)), desconto: D(descontoLinha(n(l.quantidade) * n(l.valorUnit), l.desconto, l.descontoPct)), subtotal: D(subtotalProduto(l)) } });
        }
        await tx.vendaItemServico.deleteMany({ where: { vendaId: id } });
        await tx.vendaItemServico.createMany({ data: servicos.map((l, i) => ({ vendaId: id, ordem: i, servicoId: l.servicoId, detalhes: t(l.detalhes), quantidade: new Prisma.Decimal(n(l.quantidade)), valorUnit: D(n(l.valorUnit)), desconto: D(descontoLinha(n(l.quantidade) * n(l.valorUnit), l.desconto, l.descontoPct)), subtotal: D(subtotalServico(l)) })) });
        await aplicar(tx, id, de, para, { ...opts, usuarioId: u.id, refazerFinanceiro: mudouFin });
      }
      await tx.vendaHistorico.create({ data: { vendaId: id, descricao: atual.situacaoId !== para.id ? `Venda alterada e levada para "${para.nome}"` : "Venda alterada", situacao: para.nome, usuarioNome: u.nome } });
      return tx.venda.findUniqueOrThrow({ where: { id } });
    }

    let numero = numeroInformado;
    if (numero > 0) {
      if (await tx.venda.findUnique({ where: { numero } })) throw new PedidoError(`Já existe a venda nº ${numero}`);
      await tx.$executeRaw`INSERT INTO "Sequencia" (chave, valor) VALUES ('VENDA', ${numero}) ON CONFLICT (chave) DO UPDATE SET valor = GREATEST("Sequencia".valor, ${numero})`;
    } else {
      do numero = await proximoNumero(tx, "VENDA"); while (await tx.venda.findUnique({ where: { numero } }));
    }
    const v = await tx.venda.create({ data: { ...dados, numero, situacao: "CANCELADA", situacaoId: para.id, criadoPorId: u.id, parcelas: { create: parcelas } } });
    await criarItens(v.id);
    await aplicar(tx, v.id, { estado: "LIVRE", financeiro: false }, para, { ...opts, usuarioId: u.id });
    await tx.vendaHistorico.create({ data: { vendaId: v.id, descricao: opts.orcamentoNumero ? `A venda foi gerada do orçamento nº ${opts.orcamentoNumero}` : "A venda foi cadastrada no sistema", situacao: para.nome, usuarioNome: u.nome } });
    return tx.venda.findUniqueOrThrow({ where: { id: v.id } });
  }, { timeout: 30000 });
}

export async function proximoNumeroVenda() {
  const [s, m] = await Promise.all([prisma.sequencia.findUnique({ where: { chave: "VENDA" } }), prisma.venda.aggregate({ _max: { numero: true } })]);
  return Math.max(s?.valor ?? 0, m._max.numero ?? 0) + 1;
}

/** Troca a situação (estoque e financeiro seguem a nova situação). */
export async function alterarSituacaoPedido(id: string, situacaoId: string, u: Usuario, opts: { observacao?: string; forcar?: boolean; permitirNegativo?: boolean } = {}) {
  return prisma.$transaction(async (tx) => {
    const v = await travar(tx, id);
    if (u.papel && v.situacaoCfg?.bloqueados.includes(u.papel)) throw new PedidoError(`Seu grupo não pode trocar a situação "${v.situacaoCfg.nome}"`);
    const para = await tx.situacaoVendaConfig.findUniqueOrThrow({ where: { id: situacaoId } });
    if (v.situacaoId === para.id) return { para };
    await aplicar(tx, id, { estado: v.situacaoCfg ? estadoDe(v.situacaoCfg.estoque) : estadoDoEnum(v.situacao), financeiro: !!v.situacaoCfg?.financeiro }, para, { ...opts, usuarioId: u.id });
    await tx.vendaHistorico.create({ data: { vendaId: id, descricao: opts.observacao?.trim() || `Situação alterada para "${para.nome}"`, situacao: para.nome, usuarioNome: u.nome } });
    return { para };
  }, { timeout: 30000 });
}

/** Excluir: devolve o estoque, apaga as contas a receber em aberto e a venda. */
export async function excluirPedido(id: string, opts: { forcar?: boolean } = {}) {
  return prisma.$transaction(async (tx) => {
    const v = await travar(tx, id);
    if (await tx.devolucao.count({ where: { vendaId: id } })) throw new PedidoError("A venda tem trocas ou devoluções: cancele em vez de excluir");
    const notas = await tx.notaFiscal.count({ where: { origemTipo: "VENDA", origemId: id, status: { in: ["AUTORIZADA", "ENVIADA"] } } });
    if (notas) throw new PedidoError("A venda tem nota fiscal autorizada: cancele a nota antes");
    await cancelarRecebimentos(tx, "VENDA", id, opts.forcar);
    await transicionarEstoque(tx, "VENDA", id, await estadoEfetivo(tx, id, v.situacaoCfg ? estadoDe(v.situacaoCfg.estoque) : estadoDoEnum(v.situacao)), "LIVRE", itensDoc(tx, id));
    await tx.anexo.deleteMany({ where: { entidade: "VENDA", entidadeId: id } });
    await tx.anotacao.deleteMany({ where: { entidade: "VENDA", entidadeId: id } });
    await tx.orcamento.updateMany({ where: { vendaId: id }, data: { vendaId: null } });
    await tx.venda.delete({ where: { id } });
    return v.numero;
  }, { timeout: 30000 });
}

/** "Gerar cópia": novo pedido com os mesmos itens, na situação padrão. */
export async function clonarPedido(id: string, u: Usuario) {
  const v = await prisma.venda.findUniqueOrThrow({ where: { id }, include: { itens: { include: { produto: true }, orderBy: { ordem: "asc" } }, servicos: { include: { servico: true }, orderBy: { ordem: "asc" } }, parcelas: { orderBy: { numero: "asc" } } } });
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const f = (x: Prisma.Decimal | number) => Number(x).toFixed(2).replace(".", ",");
  const aberta = await prisma.situacaoVendaConfig.findFirst({ where: { estoque: "RESERVAR" }, orderBy: { ordem: "asc" } });
  return salvarPedido({
    tipo: v.tipo === "SERVICO" ? "SERVICO" : "PRODUTO", numero: "", clienteId: v.clienteId ?? "", clienteNome: "", data: hoje, validade: "", vendedorId: v.vendedorId ?? "",
    prazoEntrega: "", aosCuidados: "", canal: v.canal, centroCusto: v.centroCusto ?? "", introducao: "", situacaoId: aberta?.id ?? "",
    produtos: v.itens.map((i) => ({ produtoId: i.produtoId, nome: i.produto.nome, codigo: i.produto.codigo, unidade: i.produto.unidade, detalhes: i.detalhes ?? "", quantidade: String(Number(i.quantidade)), tipoValorId: i.tipoValorId ?? "", valorUnit: f(i.valorUnit), desconto: f(i.desconto), descontoPct: false })),
    servicos: v.servicos.map((i) => ({ servicoId: i.servicoId, nome: i.servico.nome, codigo: i.servico.codigo, detalhes: i.detalhes ?? "", quantidade: String(Number(i.quantidade)), valorUnit: f(i.valorUnit), desconto: f(i.desconto), descontoPct: false })),
    transportadoraId: v.transportadoraId ?? "", transportadoraNome: "", frete: f(v.frete), mostrarEntrega: v.mostrarEntrega, enderecoEntregaId: v.enderecoEntregaId ?? "",
    desconto: f(v.desconto), descontoPct: false, exibirTotal: true, gerarCondicoes: true, condicao: "AVISTA", formaPagamentoId: v.formaPagamentoId ?? "", vencimento: hoje,
    intervaloDias: String(v.intervaloDias), numParcelas: "1", primeiraParcela: hoje, parcelas: [], observacoes: v.observacoes ?? "", observacaoInterna: v.observacaoInterna ?? "",
    camposExtras: (v.camposExtras ?? {}) as Record<string, string>,
  }, u);
}

// ---------- trocas e devoluções

/** Quanto de cada item já voltou em trocas/devoluções anteriores. */
export async function devolvidoPorItem(vendaId: string, tx: Tx | typeof prisma = prisma) {
  const l = await tx.devolucaoItem.groupBy({ by: ["vendaItemId"], where: { devolucao: { vendaId } }, _sum: { quantidade: true } });
  return new Map(l.map((x) => [x.vendaItemId, Number(x._sum.quantidade ?? 0)]));
}

/**
 * Registra a troca ou devolução: os produtos voltam ao estoque (no local de onde saíram).
 * Troca gera vale-compras; devolução gera conta a pagar ao cliente (Devoluções de vendas).
 */
export async function registrarDevolucao(args: { vendaId: string; tipo: "DEVOLUCAO" | "TROCA"; itens: { vendaItemId: string; quantidade: number }[]; observacao?: string }, u: Usuario) {
  const itens = args.itens.filter((i) => i.quantidade > 0);
  if (!itens.length) throw new PedidoError("Informe a quantidade devolvida de ao menos um produto");
  return prisma.$transaction(async (tx) => {
    const v = await tx.venda.findUniqueOrThrow({ where: { id: args.vendaId }, include: { itens: true } });
    if (v.situacao !== "CONCLUIDA") throw new PedidoError("Só volta para a loja o que saiu do estoque: a venda precisa estar concretizada");
    const ja = await devolvidoPorItem(v.id, tx);
    // o desconto geral vale para a venda toda (peças + serviços): a peça devolvida leva só a parte dela
    const bruto = v.itens.reduce((s, i) => s + Number(i.subtotal), 0) + Number(v.totalServicos);
    const fatorDesconto = bruto > 0 ? 1 - Number(v.desconto) / bruto : 1;
    let total = 0;
    const linhas = [];
    for (const d of itens) {
      const it = v.itens.find((i) => i.id === d.vendaItemId);
      if (!it) throw new PedidoError("Item não pertence à venda");
      const resta = Number(it.quantidade) - (ja.get(it.id) ?? 0);
      if (d.quantidade > resta + 1e-9) throw new PedidoError(`Só restam ${resta} unidade(s) para devolver deste produto`);
      const unit = Math.round((Number(it.subtotal) / Number(it.quantidade)) * fatorDesconto * 100) / 100;
      const tl = Math.round(unit * d.quantidade * 100) / 100;
      total += tl;
      linhas.push({ it, quantidade: d.quantidade, unit, tl });
    }
    total = Math.round(total * 100) / 100;
    const numero = await proximoNumero(tx, "DEVOLUCAO");
    const dev = await tx.devolucao.create({
      data: { numero, tipo: args.tipo, vendaId: v.id, clienteId: v.clienteId, total: D(total), observacao: t(args.observacao), usuarioNome: u.nome,
        itens: { create: linhas.map((l) => ({ vendaItemId: l.it.id, produtoId: l.it.produtoId, quantidade: new Prisma.Decimal(l.quantidade), valorUnit: D(l.unit), total: D(l.tl) })) } },
    });
    for (const l of linhas) {
      const saida = await tx.movimentoEstoque.findFirst({ where: { origemTipo: "VENDA", origemId: v.id, produtoId: l.it.produtoId }, orderBy: { createdAt: "desc" } });
      const prod = await tx.produto.findUniqueOrThrow({ where: { id: l.it.produtoId }, select: { localPadraoId: true, controlaEstoque: true } });
      const localId = saida?.localId ?? prod.localPadraoId ?? (await tx.local.findFirst({ orderBy: { codigo: "asc" } }))?.id;
      if (!prod.controlaEstoque || !localId) continue;
      await entrada(tx, { produtoId: l.it.produtoId, localId, quantidade: l.quantidade, custoUnit: Number(l.it.custoUnit), origemTipo: "DEVOLUCAO", origemId: dev.id, observacao: `${args.tipo === "TROCA" ? "Troca" : "Devolução"} nº ${numero} da venda ${v.numero}`, usuarioId: u.id });
    }
    if (args.tipo === "TROCA") {
      await tx.valeCompra.create({ data: { codigo: `VC${String(numero).padStart(5, "0")}`, clienteId: v.clienteId, devolucaoId: dev.id, valor: D(total), saldo: D(total) } });
    } else if (total > 0) {
      await garantirPadroes(tx);
      const cat = await categoria(tx, "Devoluções de vendas", "PAGAR");
      const hoje = diaSP(new Date());
      await tx.lancamento.create({ data: { tipo: "PAGAR", descricao: `Devolução nº ${numero} da venda ${v.numero}`, pessoaId: v.clienteId, categoriaId: cat.id, valor: D(total), vencimento: hoje, competencia: hoje, origemTipo: "DEVOLUCAO", origemId: dev.id } });
    }
    await tx.vendaHistorico.create({ data: { vendaId: v.id, descricao: `${args.tipo === "TROCA" ? "Troca" : "Devolução"} nº ${numero}: ${linhas.map((l) => `${l.quantidade} un.`).join(", ")} voltaram ao estoque`, usuarioNome: u.nome } });
    return dev;
  }, { timeout: 30000 });
}

// ---------- lista

export type ParamsVendas = Record<string, string | undefined>;

/** Filtros da lista: período (pela data), busca simples e busca avançada. */
export async function whereVendas(tipo: "PEDIDO" | "SERVICO" | "BALCAO", sp: ParamsVendas): Promise<Prisma.VendaWhereInput> {
  const w: Prisma.VendaWhereInput[] = [tipo === "BALCAO" ? { tipo } : { tipo: { in: ["PEDIDO", "SERVICO"] } }];
  const buscando = !!(sp.q || sp.codigo || sp.de || sp.ate || sp.cli);
  const per = buscando && !sp.periodo ? null : periodoDia(sp.periodo, sp.pde, sp.pate);
  // a data da venda tem hora: o dia vai da meia-noite às 23:59 de Brasília
  const H = 3 * 3600_000;
  if (per) w.push({ data: { gte: new Date(per.de.getTime() + H), lt: new Date(per.ate.getTime() + 86400_000 + H) } });
  if (sp.q) {
    const num = Number(sp.q.replace(/\D/g, ""));
    w.push({ OR: [...(num ? [{ numero: num }] : []), { cliente: { nome: { contains: sp.q, mode: "insensitive" } } }, { cliente: { fantasia: { contains: sp.q, mode: "insensitive" } } }] });
  }
  if (sp.codigo) w.push({ numero: Number(sp.codigo) || -1 });
  if (sp.de || sp.ate) w.push({ data: { ...(sp.de ? { gte: new Date(`${sp.de}T00:00:00-03:00`) } : {}), ...(sp.ate ? { lte: new Date(`${sp.ate}T23:59:59.999-03:00`) } : {}) } });
  if (sp.ede || sp.eate) w.push({ prazoEntrega: { ...(sp.ede ? { gte: parseDia(sp.ede) } : {}), ...(sp.eate ? { lte: parseDia(sp.eate) } : {}) } });
  if (sp.cli) w.push({ clienteId: sp.cli });
  if (sp.prod) w.push({ itens: { some: { produtoId: sp.prod } } });
  if (sp.serv) w.push({ servicos: { some: { servicoId: sp.serv } } });
  if (sp.cc) w.push({ centroCusto: sp.cc });
  if (sp.s) w.push({ situacaoId: sp.s });
  else w.push({ OR: [{ situacaoId: null }, { situacaoCfg: { exibir: true } }] });
  return { AND: w };
}

export function ordemVendas(o?: string): Prisma.VendaOrderByWithRelationInput[] {
  const dir = o?.startsWith("-") ? "desc" : o ? "asc" : "desc";
  const c = o?.replace(/^-/, "");
  if (c === "cliente") return [{ cliente: { nome: dir } }];
  if (c === "data") return [{ data: dir }, { numero: dir }];
  if (c === "valor") return [{ total: dir }];
  if (c === "situacao") return [{ situacaoCfg: { nome: dir } }];
  return [{ numero: dir }];
}
