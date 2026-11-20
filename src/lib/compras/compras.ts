import { centroPorNome } from "@/lib/financeiro/plano";
import { Prisma, type PapelUsuario, type SituacaoCompraConfig } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { entrada, saida } from "@/lib/estoque/estoque";
import { cancelarRecebimentos } from "@/lib/financeiro/lancamentos";
import { categoria, garantirPadroes } from "@/lib/financeiro/padroes";
import { proximoNumero } from "@/lib/sequencia";
import { parseDia, periodoDia } from "@/lib/datas";
import { descontoLinha, lerNumero } from "@/lib/orcamentos/tipos";
import { fatorLinha, lancaEstoque, lancaFinanceiro, subtotalCompra, totaisCompra, type DadosCompra } from "./tipos";
import { configEstoque } from "@/lib/estoque/config";
import { atualizarCustoPorEntrada } from "@/lib/estoque/custo";

/**
 * Compra de produtos/serviços (padrão Gestão Click). A situação decide o que é lançado:
 * estoque (entrada das peças, com o custo atualizado pela regra das configurações) e/ou
 * financeiro (as parcelas viram contas a pagar).
 */

type Usuario = { id: string; nome: string; papel?: PapelUsuario };
export class CompraError extends Error {}

const t = (s: string | undefined | null) => (s ?? "").trim() || null;
const n = (s: string) => lerNumero(s) ?? 0;
const D = (v: number) => new Prisma.Decimal(v.toFixed(2));
const D4 = (v: number) => new Prisma.Decimal(v.toFixed(4));

export async function situacaoPadraoCompra(tx: Tx | typeof prisma = prisma) {
  const s = (await tx.situacaoCompraConfig.findFirst({ where: { padrao: true } })) ?? (await tx.situacaoCompraConfig.findFirst({ orderBy: { ordem: "asc" } }));
  if (!s) throw new CompraError("Cadastre ao menos uma situação de compra");
  return s;
}

async function travar(tx: Tx, compraId: string) {
  const [c] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Compra" WHERE id = ${compraId} FOR NO KEY UPDATE`;
  if (!c) throw new CompraError("Compra não encontrada");
  return tx.compra.findUniqueOrThrow({ where: { id: compraId }, include: { situacaoCfg: true } });
}

async function localPadrao(tx: Tx) {
  const l = await tx.local.findFirst({ orderBy: { codigo: "asc" }, select: { id: true } });
  if (!l) throw new CompraError("Cadastre um local de estoque antes de lançar a compra");
  return l.id;
}

/** Entrada das peças no estoque, atualizando o custo do produto (média, última compra ou não atualiza). */
async function lancarEstoque(tx: Tx, compraId: string, usuarioId?: string) {
  const c = await tx.compra.findUniqueOrThrow({ where: { id: compraId }, include: { itens: { include: { produto: { select: { controlaEstoque: true, localPadraoId: true } } } } } });
  const regra = (await configEstoque()).custoCompra;
  let padrao: string | null = null;
  for (const i of c.itens) {
    // quantidade da nota × fator = quantidade na unidade do produto (ex.: 2 CX × 305 = 610 MT); o custo vai por MT
    const fator = Number(i.fator) > 0 ? Number(i.fator) : 1;
    const q = Number(i.quantidade) * fator;
    if (!i.produto.controlaEstoque || !(q > 0)) continue;
    const localId = i.localId ?? i.produto.localPadraoId ?? (padrao ??= await localPadrao(tx));
    const custo = Number(i.subtotal) > 0 ? Number(i.subtotal) / q : Number(i.custoUnit) / fator;
    await atualizarCustoPorEntrada(tx, i.produtoId, q, custo, regra);
    await entrada(tx, { produtoId: i.produtoId, localId, quantidade: q, custoUnit: custo, origemTipo: "COMPRA", origemId: c.id, observacao: `Compra nº ${c.numero}`, usuarioId });
    if (!i.localId) await tx.compraItem.update({ where: { id: i.id }, data: { localId } });
  }
  await tx.compra.update({ where: { id: compraId }, data: { recebida: true } });
}

/** Tira do estoque o que a compra tinha lançado (cancelamento, troca de situação ou edição dos itens). */
async function estornarEstoque(tx: Tx, compraId: string, usuarioId?: string) {
  const c = await tx.compra.findUniqueOrThrow({ where: { id: compraId }, include: { itens: { include: { produto: { select: { controlaEstoque: true, localPadraoId: true } } } } } });
  let padrao: string | null = null;
  for (const i of c.itens) {
    const q = Number(i.quantidade) * (Number(i.fator) > 0 ? Number(i.fator) : 1);
    if (!i.produto.controlaEstoque || !(q > 0)) continue;
    const localId = i.localId ?? i.produto.localPadraoId ?? (padrao ??= await localPadrao(tx));
    await saida(tx, { produtoId: i.produtoId, localId, quantidade: q, origemTipo: "COMPRA", origemId: c.id, observacao: `Estorno da compra nº ${c.numero}`, usuarioId });
  }
  await tx.compra.update({ where: { id: compraId }, data: { recebida: false } });
}

/** Parcelas da compra em contas a pagar. Compras migradas já lançadas no Gestão Click não lançam de novo: as contas em aberto vêm do backup. */
async function lancarPagar(tx: Tx, compraId: string) {
  const c = await tx.compra.findUniqueOrThrow({ where: { id: compraId }, include: { parcelas: { orderBy: { numero: "asc" } } } });
  if (c.financeiroNoLegado || !(Number(c.total) > 0)) return;
  await garantirPadroes(tx);
  const centro = await centroPorNome(tx, c.centroCusto);
  const cat = await categoria(tx, c.tipo === "SERVICO" ? "Serviços de terceiros" : "Compra de mercadorias (estoque)", "PAGAR");
  const parcelas = c.parcelas.length ? c.parcelas : [{ numero: 1, vencimento: c.data, valor: c.total, formaPagamentoId: c.formaPagamentoId }];
  for (const p of parcelas)
    await tx.lancamento.create({
      data: {
        tipo: "PAGAR", descricao: parcelas.length > 1 ? `Compra de nº ${c.numero} (${p.numero}/${parcelas.length})` : `Compra de nº ${c.numero}`,
        pessoaId: c.fornecedorId, categoriaId: cat.id, formaPagamentoId: p.formaPagamentoId ?? c.formaPagamentoId, valor: p.valor,
        vencimento: p.vencimento, competencia: c.data, parcela: p.numero, totalParcelas: parcelas.length, origemTipo: "COMPRA", origemId: c.id, centroCustoId: centro, empresaId: c.empresaId,
      },
    });
}

/** Passa a compra para a situação `para`: entra/estorna o estoque e lança/cancela as contas a pagar. */
async function aplicar(tx: Tx, compraId: string, para: SituacaoCompraConfig, opts: { refazerItens?: () => Promise<void>; refazerFinanceiro?: boolean; forcar?: boolean; usuarioId?: string }) {
  const c = await tx.compra.findUniqueOrThrow({ where: { id: compraId }, select: { recebida: true } });
  const temLanc = (await tx.lancamento.count({ where: { origemTipo: "COMPRA", origemId: compraId } })) > 0;
  if (temLanc && (!lancaFinanceiro(para.lancamento) || opts.refazerFinanceiro)) await cancelarRecebimentos(tx, "COMPRA", compraId, opts.forcar);
  const quer = lancaEstoque(para.lancamento);
  if (c.recebida && (!quer || opts.refazerItens)) await estornarEstoque(tx, compraId, opts.usuarioId);
  if (opts.refazerItens) await opts.refazerItens();
  if (quer && (!c.recebida || opts.refazerItens)) await lancarEstoque(tx, compraId, opts.usuarioId);
  const aindaTem = (await tx.lancamento.count({ where: { origemTipo: "COMPRA", origemId: compraId } })) > 0;
  if (lancaFinanceiro(para.lancamento) && !aindaTem) await lancarPagar(tx, compraId);
  await tx.compra.update({ where: { id: compraId }, data: { situacaoId: para.id } });
}

/**
 * O que a compra ensina ao cadastro: o código do item na nota do fornecedor (a próxima NF-e já se liga sozinha)
 * e, quando marcado na linha, a conversão de unidade (ex.: 1 CX = 305 MT) no produto.
 * Roda antes de lançar o estoque; o custo do produto é recalculado na entrada.
 */
async function aprender(tx: Tx, fornecedorId: string, linhas: DadosCompra["produtos"]) {
  for (const l of linhas) {
    const cod = t(l.codigoFornecedor);
    if (cod && !(await tx.itemFornecedor.findFirst({ where: { fornecedorId, produtoId: l.produtoId, codigo: cod } })))
      await tx.itemFornecedor.create({ data: { fornecedorId, produtoId: l.produtoId, codigo: cod } });
    if (l.salvarConversao && t(l.unidadeCompra) && fatorLinha(l) > 0) {
      const p = await tx.produto.findUniqueOrThrow({ where: { id: l.produtoId }, select: { unidade: true } });
      if (p.unidade !== t(l.unidadeCompra)!.toUpperCase())
        await tx.produto.update({ where: { id: l.produtoId }, data: { unidadeCompra: t(l.unidadeCompra)!.toUpperCase(), fatorConversao: D4(fatorLinha(l)) } });
    }
  }
}

export async function proximoNumeroCompra() {
  const s = await prisma.sequencia.findUnique({ where: { chave: "COMPRA" } });
  return (s?.valor ?? 0) + 1;
}

export async function salvarCompra(d: DadosCompra, u: Usuario, id?: string, opts: { forcar?: boolean } = {}) {
  if (!t(d.fornecedorId)) throw new CompraError("Informe o fornecedor");
  if (!t(d.data)) throw new CompraError("Informe a data de emissão");
  const produtos = d.produtos.filter((l) => l.produtoId);
  const servicos = d.servicos.filter((l) => l.servicoId);
  if (!produtos.length && !servicos.length) throw new CompraError(d.tipo === "SERVICO" ? "Adicione ao menos um serviço" : "Adicione ao menos um produto");
  for (const l of [...produtos, ...servicos]) if (!(n(l.quantidade) > 0)) throw new CompraError(`Informe a quantidade de ${l.nome || "todos os itens"}`);
  for (const l of produtos)
    if (t(l.unidadeCompra) && !((lerNumero(l.fator ?? "") ?? 0) > 0)) throw new CompraError(`Informe quantos ${l.unidade || "itens"} vêm em 1 ${l.unidadeCompra} de ${l.nome}`);
  const tot = totaisCompra({ ...d, produtos, servicos });
  if (tot.total < 0) throw new CompraError("O desconto é maior que o valor da compra");
  const data = parseDia(d.data);

  let parcelas: { numero: number; vencimento: Date; valor: Prisma.Decimal; formaPagamentoId: string | null; observacao: string | null }[];
  if (d.condicao === "PARCELADO") {
    if (!d.parcelas.length) throw new CompraError("Clique em Gerar parcelas");
    const soma = d.parcelas.reduce((s, p) => s + n(p.valor), 0);
    if (Math.abs(soma - tot.total) > 0.009) throw new CompraError(`A soma das parcelas (${soma.toFixed(2)}) não fecha com o total (${tot.total.toFixed(2)}). Gere as parcelas de novo.`);
    parcelas = d.parcelas.map((p, i) => {
      if (!t(p.vencimento)) throw new CompraError(`Informe o vencimento da parcela ${i + 1}`);
      return { numero: i + 1, vencimento: parseDia(p.vencimento), valor: D(n(p.valor)), formaPagamentoId: t(p.formaPagamentoId) ?? t(d.formaPagamentoId), observacao: t(p.observacao) };
    });
  } else {
    parcelas = [{ numero: 1, vencimento: t(d.vencimento) ? parseDia(d.vencimento) : data, valor: D(tot.total), formaPagamentoId: t(d.formaPagamentoId), observacao: null }];
  }

  const dados = {
    tipo: d.tipo === "SERVICO" ? "SERVICO" : "PRODUTO", fornecedorId: d.fornecedorId, data, numeroNfe: t(d.numeroNfe), chaveNfe: t(d.chaveNfe)?.replace(/\D/g, "") || null,
    centroCusto: t(d.centroCusto), transportadoraId: t(d.transportadoraId), frete: D(tot.frete), freteNoTotal: d.freteNoTotal, impostos: D(tot.impostos), impostosNoTotal: d.impostosNoTotal,
    totalProdutos: D(tot.produtos), totalServicos: D(tot.servicos), desconto: D(tot.desconto), descontoPercentual: d.descontoPct ? new Prisma.Decimal(n(d.desconto)) : null, total: D(tot.total),
    condicao: d.condicao, formaPagamentoId: t(d.formaPagamentoId), intervaloDias: Math.trunc(n(d.intervaloDias)) || 30,
    observacoes: t(d.observacoes), observacaoInterna: t(d.observacaoInterna), camposExtras: (d.camposExtras ?? {}) as Prisma.InputJsonValue,
  };
  const assinatura = (l: { produtoId: string; quantidade: number }[]) => l.map((x) => `${x.produtoId}:${x.quantidade}`).sort().join("|");
  // a assinatura usa a quantidade que entra no estoque: mudar só a conversão também refaz a entrada
  const novos = produtos.map((l) => ({ produtoId: l.produtoId, quantidade: Math.round(n(l.quantidade) * fatorLinha(l) * 10000) / 10000 }));
  const assinaturaFin = (total: number, ps: { vencimento: Date; valor: Prisma.Decimal; formaPagamentoId: string | null }[]) =>
    `${total.toFixed(2)}#${ps.map((p) => `${p.vencimento.toISOString().slice(0, 10)}:${Number(p.valor).toFixed(2)}:${p.formaPagamentoId ?? ""}`).join("|")}`;

  return prisma.$transaction(async (tx) => {
    const linha = (compraId: string, l: (typeof produtos)[number], i: number) => ({
      compraId, ordem: i, produtoId: l.produtoId, detalhes: t(l.detalhes), quantidade: D4(n(l.quantidade)), custoUnit: D4(n(l.valorUnit)),
      unidadeCompra: t(l.unidadeCompra)?.toUpperCase() ?? null, fator: D4(fatorLinha(l)),
      desconto: D(descontoLinha(n(l.quantidade) * n(l.valorUnit), l.desconto, l.descontoPct)), subtotal: D(subtotalCompra(l)),
    });
    const criarItens = async (compraId: string) => {
      await tx.compraItem.deleteMany({ where: { compraId } });
      await tx.compraItem.createMany({ data: produtos.map((l, i) => linha(compraId, l, i)) });
    };
    const criarServicos = async (compraId: string) => {
      await tx.compraItemServico.deleteMany({ where: { compraId } });
      await tx.compraItemServico.createMany({ data: servicos.map((l, i) => ({ compraId, ordem: i, servicoId: l.servicoId, detalhes: t(l.detalhes), quantidade: D4(n(l.quantidade)), valorUnit: D(n(l.valorUnit)), desconto: D(descontoLinha(n(l.quantidade) * n(l.valorUnit), l.desconto, l.descontoPct)), subtotal: D(subtotalCompra(l)) })) });
    };
    const para = t(d.situacaoId) ? await tx.situacaoCompraConfig.findUniqueOrThrow({ where: { id: d.situacaoId } }) : await situacaoPadraoCompra(tx);
    const numeroInformado = Math.trunc(n(d.numero));

    if (id) {
      const atual = await travar(tx, id);
      if (atual.situacaoCfg && !atual.situacaoCfg.permiteEdicao) throw new CompraError(`Compras na situação "${atual.situacaoCfg.nome}" não podem ser editadas`);
      if (u.papel && atual.situacaoCfg?.bloqueados.includes(u.papel)) throw new CompraError(`Seu grupo não pode alterar compras na situação "${atual.situacaoCfg.nome}"`);
      const numero = numeroInformado > 0 ? numeroInformado : atual.numero;
      if (numero !== atual.numero && (await tx.compra.findUnique({ where: { numero } }))) throw new CompraError(`Já existe a compra nº ${numero}`);
      const existentes = await tx.compraItem.findMany({ where: { compraId: id } });
      const antigas = await tx.compraParcela.findMany({ where: { compraId: id }, orderBy: { numero: "asc" } });
      const mudouItens = assinatura(existentes.map((e) => ({ produtoId: e.produtoId, quantidade: Math.round(Number(e.quantidade) * Number(e.fator) * 10000) / 10000 }))) !== assinatura(novos);
      const mudouFin = assinaturaFin(Number(atual.total), antigas) !== assinaturaFin(tot.total, parcelas);
      await tx.compra.update({ where: { id }, data: { ...dados, numero } });
      await tx.compraParcela.deleteMany({ where: { compraId: id } });
      await tx.compraParcela.createMany({ data: parcelas.map((p) => ({ ...p, compraId: id })) });
      await criarServicos(id);
      if (mudouItens) await aplicar(tx, id, para, { ...opts, usuarioId: u.id, refazerFinanceiro: mudouFin, refazerItens: () => criarItens(id) });
      else {
        const porProduto = new Map(existentes.map((e) => [e.produtoId, e]));
        for (const [i, l] of produtos.entries()) {
          const e = porProduto.get(l.produtoId);
          if (e) await tx.compraItem.update({ where: { id: e.id }, data: { ...linha(id, l, i), compraId: undefined } });
        }
        await aplicar(tx, id, para, { ...opts, usuarioId: u.id, refazerFinanceiro: mudouFin });
      }
      await aprender(tx, d.fornecedorId, produtos);
      await tx.compraHistorico.create({ data: { compraId: id, descricao: atual.situacaoId !== para.id ? `Compra alterada e levada para "${para.nome}"` : "Compra alterada", situacao: para.nome, usuarioNome: u.nome, usuarioId: u.id } });
      return tx.compra.findUniqueOrThrow({ where: { id } });
    }

    let numero = numeroInformado;
    if (numero > 0) {
      if (await tx.compra.findUnique({ where: { numero } })) throw new CompraError(`Já existe a compra nº ${numero}`);
      await tx.$executeRaw`INSERT INTO "Sequencia" (chave, valor) VALUES ('COMPRA', ${numero}) ON CONFLICT (chave) DO UPDATE SET valor = GREATEST("Sequencia".valor, ${numero})`;
    } else {
      do numero = await proximoNumero(tx, "COMPRA"); while (await tx.compra.findUnique({ where: { numero } }));
    }
    const c = await tx.compra.create({ data: { ...dados, numero, situacaoId: para.id, criadoPorId: u.id, cotacaoId: t(d.cotacaoId), parcelas: { create: parcelas } } });
    await aprender(tx, d.fornecedorId, produtos);
    await criarItens(c.id);
    await criarServicos(c.id);
    await aplicar(tx, c.id, para, { ...opts, usuarioId: u.id });
    if (d.cotacaoId) await tx.cotacao.update({ where: { id: d.cotacaoId }, data: { situacao: "FINALIZADA", compraId: c.id } });
    await tx.compraHistorico.create({ data: { compraId: c.id, descricao: "Compra cadastrada", situacao: para.nome, usuarioNome: u.nome, usuarioId: u.id } });
    return tx.compra.findUniqueOrThrow({ where: { id: c.id } });
  }, { timeout: 30000 });
}

export async function alterarSituacaoCompra(id: string, situacaoId: string, u: Usuario, opts: { observacao?: string; forcar?: boolean } = {}) {
  return prisma.$transaction(async (tx) => {
    const c = await travar(tx, id);
    if (u.papel && c.situacaoCfg?.bloqueados.includes(u.papel)) throw new CompraError(`Seu grupo não pode trocar a situação "${c.situacaoCfg.nome}"`);
    const para = await tx.situacaoCompraConfig.findUniqueOrThrow({ where: { id: situacaoId } });
    if (c.situacaoId === para.id) return { para };
    await aplicar(tx, id, para, { ...opts, usuarioId: u.id });
    await tx.compraHistorico.create({ data: { compraId: id, descricao: opts.observacao?.trim() || `Situação alterada para "${para.nome}"`, situacao: para.nome, usuarioNome: u.nome, usuarioId: u.id } });
    return { para };
  }, { timeout: 30000 });
}

/** Excluir: estorna o estoque lançado, apaga as contas a pagar em aberto e a compra. */
export async function excluirCompra(id: string, u: Usuario, opts: { forcar?: boolean } = {}) {
  return prisma.$transaction(async (tx) => {
    const c = await travar(tx, id);
    await cancelarRecebimentos(tx, "COMPRA", id, opts.forcar);
    if (c.recebida) await estornarEstoque(tx, id, u.id);
    await tx.anexo.deleteMany({ where: { entidade: "COMPRA", entidadeId: id } });
    await tx.anotacao.deleteMany({ where: { entidade: "COMPRA", entidadeId: id } });
    await tx.compra.delete({ where: { id } });
    return c.numero;
  }, { timeout: 30000 });
}

/** Dados da compra no formato do formulário (editar e "Cópia"). */
export async function dadosDaCompra(id: string, copia = false): Promise<DadosCompra & { id?: string }> {
  const c = await prisma.compra.findUniqueOrThrow({
    where: { id },
    include: { fornecedor: true, transportadora: true, itens: { include: { produto: true }, orderBy: { ordem: "asc" } }, servicos: { include: { servico: true }, orderBy: { ordem: "asc" } }, parcelas: { orderBy: { numero: "asc" } } },
  });
  const f = (x: Prisma.Decimal | number | null) => Number(x ?? 0).toFixed(2).replace(".", ",");
  const q = (x: Prisma.Decimal) => String(Number(x)).replace(".", ",");
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  return {
    ...(copia ? {} : { id: c.id }), tipo: c.tipo === "SERVICO" ? "SERVICO" : "PRODUTO", numero: copia ? "" : String(c.numero),
    fornecedorId: c.fornecedorId, fornecedorNome: c.fornecedor.nome, data: copia ? hoje : iso(c.data), situacaoId: copia ? "" : c.situacaoId ?? "",
    numeroNfe: copia ? "" : c.numeroNfe ?? "", chaveNfe: copia ? "" : c.chaveNfe ?? "", centroCusto: c.centroCusto ?? "",
    produtos: c.itens.map((i) => ({
      produtoId: i.produtoId, nome: i.produto.nome, codigo: i.produto.codigo, unidade: i.produto.unidade, detalhes: i.detalhes ?? "", quantidade: q(i.quantidade),
      valorUnit: Number(i.custoUnit).toFixed(4).replace(/(\.\d\d)0+$/, "$1").replace(".", ","), desconto: Number(i.desconto) ? f(i.desconto) : "", descontoPct: false,
      unidadeCompra: i.unidadeCompra ?? "", fator: i.unidadeCompra ? q(i.fator) : "",
      conversaoProduto: i.produto.unidadeCompra ? { unidade: i.produto.unidadeCompra, fator: Number(i.produto.fatorConversao) } : null,
    })),
    servicos: c.servicos.map((i) => ({ servicoId: i.servicoId, nome: i.servico.nome, codigo: i.servico.codigo, detalhes: i.detalhes ?? "", quantidade: q(i.quantidade), valorUnit: f(i.valorUnit), desconto: Number(i.desconto) ? f(i.desconto) : "", descontoPct: false })),
    transportadoraId: c.transportadoraId ?? "", transportadoraNome: c.transportadora?.nome ?? "", frete: f(c.frete), freteNoTotal: c.freteNoTotal, impostos: f(c.impostos), impostosNoTotal: c.impostosNoTotal,
    desconto: c.descontoPercentual ? String(Number(c.descontoPercentual)).replace(".", ",") : Number(c.desconto) ? f(c.desconto) : "", descontoPct: !!c.descontoPercentual,
    condicao: c.condicao === "PARCELADO" && !copia ? "PARCELADO" : "AVISTA", formaPagamentoId: c.formaPagamentoId ?? "",
    vencimento: copia ? "" : c.condicao !== "PARCELADO" && c.parcelas[0] ? iso(c.parcelas[0].vencimento) : "",
    intervaloDias: String(c.intervaloDias), numParcelas: String(Math.max(1, c.parcelas.length)), primeiraParcela: c.parcelas[0] && !copia ? iso(c.parcelas[0].vencimento) : "",
    parcelas: copia ? [] : c.parcelas.map((p) => ({ vencimento: iso(p.vencimento), valor: f(p.valor), formaPagamentoId: p.formaPagamentoId ?? "", observacao: p.observacao ?? "" })),
    observacoes: c.observacoes ?? "", observacaoInterna: c.observacaoInterna ?? "", camposExtras: (c.camposExtras ?? {}) as Record<string, string>,
  };
}

// ---------- lista

export type ParamsCompras = Record<string, string | undefined>;

export function whereCompras(tipo: "PRODUTO" | "SERVICO", sp: ParamsCompras): Prisma.CompraWhereInput {
  const w: Prisma.CompraWhereInput[] = [{ tipo }];
  const buscando = !!(sp.q || sp.codigo || sp.de || sp.ate || sp.forn || sp.nfe || sp.prod || sp.serv || sp.cc);
  const per = buscando && !sp.periodo ? null : periodoDia(sp.periodo, sp.pde, sp.pate);
  if (per) w.push({ data: { gte: per.de, lte: per.ate } });
  if (sp.q) {
    const num = Number(sp.q.replace(/\D/g, ""));
    w.push({ OR: [...(num ? [{ numero: num }] : []), { numeroNfe: { contains: sp.q } }, { fornecedor: { nome: { contains: sp.q, mode: "insensitive" } } }, { fornecedor: { fantasia: { contains: sp.q, mode: "insensitive" } } }] });
  }
  if (sp.codigo) w.push({ numero: Number(sp.codigo) || -1 });
  if (sp.de || sp.ate) w.push({ data: { ...(sp.de ? { gte: parseDia(sp.de) } : {}), ...(sp.ate ? { lte: parseDia(sp.ate) } : {}) } });
  if (sp.forn) w.push({ fornecedorId: sp.forn });
  if (sp.nfe) w.push({ numeroNfe: { contains: sp.nfe } });
  if (sp.prod) w.push({ itens: { some: { produtoId: sp.prod } } });
  if (sp.serv) w.push({ servicos: { some: { servicoId: sp.serv } } });
  if (sp.cc) w.push({ centroCusto: sp.cc });
  if (sp.s) w.push({ situacaoId: sp.s });
  else w.push({ OR: [{ situacaoId: null }, { situacaoCfg: { exibir: true } }] });
  return { AND: w };
}

export function ordemCompras(o?: string): Prisma.CompraOrderByWithRelationInput[] {
  const dir = o?.startsWith("-") ? "desc" : o ? "asc" : "desc";
  const c = o?.replace(/^-/, "");
  if (c === "fornecedor") return [{ fornecedor: { nome: dir } }];
  if (c === "valor") return [{ total: dir }];
  if (c === "situacao") return [{ situacaoCfg: { nome: dir } }];
  if (c === "codigo") return [{ numero: dir }];
  return [{ data: dir }, { numero: dir }];
}
