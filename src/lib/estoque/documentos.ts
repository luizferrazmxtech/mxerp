import { Prisma, type PapelUsuario } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { disponivelPorLocal, entrada, saida, transferir } from "@/lib/estoque/estoque";
import { proximoNumero } from "@/lib/sequencia";
import { lojaAtualId } from "@/lib/empresa/loja";
import { parseDia } from "@/lib/datas";
import { lerNumero } from "@/lib/itens/tipos";
import { atualizarCustoPorEntrada } from "./custo";

/**
 * Documentos de estoque do Gestão Click: ajustes (entrada/saída avulsa), transferências entre
 * depósitos ("lojas") e inventários (contagem que, ao concluir, vira ajustes).
 */

type Usuario = { id: string; nome: string; papel?: PapelUsuario };
export class DocEstoqueError extends Error {}

const n = (s: string | number) => (typeof s === "number" ? s : lerNumero(s) ?? 0);
const arred = (v: number, c = 4) => Math.round(v * 10 ** c) / 10 ** c;

/** Primeiro local da loja atual (depósito da loja ou sem loja). */
async function localPadrao(tx: Tx) {
  const loja = await lojaAtualId();
  const l = await tx.local.findFirst({
    where: loja ? { deposito: { OR: [{ empresaId: loja }, { empresaId: null }] } } : {},
    orderBy: [{ deposito: { empresaId: { sort: "asc", nulls: "last" } } }, { codigo: "asc" }], select: { id: true },
  });
  if (!l) throw new DocEstoqueError("Cadastre um local de estoque antes");
  return l.id;
}

async function saldosPorLocal(tx: Tx, produtoId: string, depositoId?: string) {
  const rows = await tx.saldo.findMany({ where: { produtoId, ...(depositoId ? { local: { depositoId } } : {}) }, orderBy: { quantidade: "desc" } });
  return rows.map((r) => ({ localId: r.localId, quantidade: Number(r.quantidade) }));
}

/** Retira `q` do produto: primeiro dos locais com saldo (maior primeiro); o que faltar sai do local padrão. */
async function retirar(tx: Tx, produtoId: string, q: number, base: { origemTipo: "AJUSTE"; origemId: string; observacao: string; usuarioId?: string }, padrao: string) {
  let resta = q;
  const partes: { localId: string; quantidade: number }[] = [];
  for (const s of await saldosPorLocal(tx, produtoId)) {
    if (resta <= 0 || s.quantidade <= 0) continue;
    const parte = Math.min(resta, s.quantidade);
    partes.push({ localId: s.localId, quantidade: parte });
    resta = arred(resta - parte);
  }
  if (resta > 0) partes.push({ localId: padrao, quantidade: resta });
  for (const p of partes) await saida(tx, { ...base, produtoId, localId: p.localId, quantidade: p.quantidade });
  return partes;
}

// ---------- ajustes

/** Linha do ajuste. Na entrada manual a quantidade pode estar na unidade de compra (2 CX): entra quantidade × fator (610 MT). */
export type ItemAjuste = {
  produtoId: string; nome?: string; codigo?: string; unidade?: string; quantidade: string; custo: string; localId?: string;
  unidadeCompra?: string; fator?: string; salvarConversao?: boolean; conversaoProduto?: { unidade: string; fator: number } | null;
};
/** atualizarCusto: a entrada manual recalcula o custo do produto (média/última, como nas compras). */
export type DadosAjuste = { tipo: "ENTRADA" | "SAIDA"; frete: string; observacoes: string; itens: ItemAjuste[]; atualizarCusto?: boolean };

export async function criarAjusteTx(tx: Tx, d: DadosAjuste, u: Usuario | null, extra: { inventarioId?: string } = {}) {
  if (d.tipo !== "ENTRADA" && d.tipo !== "SAIDA") throw new DocEstoqueError("Escolha a movimentação (entrada ou saída)");
  const itens = d.itens.filter((i) => i.produtoId);
  if (!itens.length) throw new DocEstoqueError("Adicione ao menos um produto");
  for (const i of itens) if (!(n(i.quantidade) > 0)) throw new DocEstoqueError(`Informe a quantidade de ${i.nome || "todos os produtos"}`);
  const fatorDe = (i: ItemAjuste) => ((i.unidadeCompra ?? "").trim() ? n(i.fator ?? "") : 1);
  for (const i of itens) if (!(fatorDe(i) > 0)) throw new DocEstoqueError(`Informe quantos ${i.unidade || "itens"} vêm em 1 ${i.unidadeCompra} de ${i.nome || "um dos produtos"}`);
  const produtos = new Map((await tx.produto.findMany({ where: { id: { in: itens.map((i) => i.produtoId) } }, select: { id: true, nome: true, controlaEstoque: true, localPadraoId: true } })).map((p) => [p.id, p]));
  for (const i of itens) {
    const p = produtos.get(i.produtoId);
    if (!p) throw new DocEstoqueError("Produto não encontrado");
    if (!p.controlaEstoque) throw new DocEstoqueError(`${p.nome} não controla estoque`);
  }
  const frete = n(d.frete);
  const total = Math.round((itens.reduce((s, i) => s + n(i.quantidade) * n(i.custo), 0) + frete) * 100) / 100;
  const numero = await proximoNumero(tx, "AJUSTE");
  const a = await tx.ajusteEstoque.create({
    data: { numero, tipo: d.tipo, frete, total, observacoes: d.observacoes.trim() || null, criadoPorId: u?.id, criadoPorNome: u?.nome, inventarioId: extra.inventarioId },
  });
  const padrao = await localPadrao(tx);
  const obs = `Ajuste de estoque nº ${numero}`;
  for (const [ordem, i] of itens.entries()) {
    // conversão: 2 CX a R$ 600 = 610 MT a R$ 1,9672 (o total da linha não muda)
    const f = fatorDe(i), un = (i.unidadeCompra ?? "").trim().toUpperCase();
    const q = n(i.quantidade) * f, custo = n(i.custo) / f, p = produtos.get(i.produtoId)!;
    const obsLinha = f !== 1 || un ? `${obs} (${n(i.quantidade).toLocaleString("pt-BR")} ${un} × ${f.toLocaleString("pt-BR")})` : obs;
    if (i.salvarConversao && un && f > 0) await tx.produto.update({ where: { id: p.id }, data: { unidadeCompra: un, fatorConversao: f.toFixed(4) } });
    let localId = i.localId ?? null;
    if (d.tipo === "ENTRADA") {
      localId ??= p.localPadraoId ?? padrao;
      if (d.atualizarCusto) await atualizarCustoPorEntrada(tx, p.id, q, custo);
      await entrada(tx, { produtoId: p.id, localId, quantidade: q, custoUnit: custo, origemTipo: "AJUSTE", origemId: a.id, observacao: obsLinha, usuarioId: u?.id });
    } else if (localId) {
      await saida(tx, { produtoId: p.id, localId, quantidade: q, origemTipo: "AJUSTE", origemId: a.id, observacao: obsLinha, usuarioId: u?.id });
    } else {
      const partes = await retirar(tx, p.id, q, { origemTipo: "AJUSTE", origemId: a.id, observacao: obsLinha, usuarioId: u?.id }, p.localPadraoId ?? padrao);
      localId = partes.length === 1 ? partes[0].localId : null;
    }
    await tx.ajusteEstoqueItem.create({ data: { ajusteId: a.id, ordem, produtoId: p.id, localId, quantidade: q, custoUnit: custo.toFixed(4), total: Math.round(n(i.quantidade) * n(i.custo) * 100) / 100 } });
  }
  return a;
}

export const criarAjuste = (d: DadosAjuste, u: Usuario) => prisma.$transaction((tx) => criarAjusteTx(tx, d, u), { timeout: 60000 });

/** "Zerar estoque": um ajuste de saída com todo o saldo positivo de cada local. */
export async function zerarEstoque(u: Usuario, observacao = "Estoque zerado") {
  return prisma.$transaction(async (tx) => {
    const saldos = await tx.saldo.findMany({ where: { quantidade: { gt: 0 }, produto: { controlaEstoque: true } }, include: { produto: { select: { custo: true } } } });
    if (!saldos.length) throw new DocEstoqueError("Não há saldo para zerar");
    return criarAjusteTx(tx, {
      tipo: "SAIDA", frete: "0", observacoes: observacao,
      itens: saldos.map((s) => ({ produtoId: s.produtoId, localId: s.localId, quantidade: String(Number(s.quantidade)), custo: String(Number(s.produto.custo)) })),
    }, u);
  }, { timeout: 300000 });
}

// ---------- transferências

export type DadosTransferencia = {
  origemDepositoId: string; destinoDepositoId: string; observacoes: string; itens: { produtoId: string; nome?: string; quantidade: string }[];
  /** opcional: a prateleira (local) exata de onde sai / para onde vai; sem ela, sai de qualquer local do estoque e entra no local padrão */
  origemLocalId?: string; destinoLocalId?: string;
};

export async function criarTransferencia(d: DadosTransferencia, u: Usuario) {
  if (!d.origemDepositoId || !d.destinoDepositoId) throw new DocEstoqueError("Informe o estoque de origem e o de destino");
  // no mesmo estoque, só de uma prateleira para outra
  if (d.origemDepositoId === d.destinoDepositoId && (!d.origemLocalId || !d.destinoLocalId || d.origemLocalId === d.destinoLocalId))
    throw new DocEstoqueError("A origem e o destino precisam ser diferentes");
  const itens = d.itens.filter((i) => i.produtoId);
  if (!itens.length) throw new DocEstoqueError("Adicione ao menos um produto");
  return prisma.$transaction(async (tx) => {
    if (d.origemLocalId && !(await tx.local.findFirst({ where: { id: d.origemLocalId, depositoId: d.origemDepositoId }, select: { id: true } })))
      throw new DocEstoqueError("O local de origem não é deste estoque");
    if (d.destinoLocalId && !(await tx.local.findFirst({ where: { id: d.destinoLocalId, depositoId: d.destinoDepositoId }, select: { id: true } })))
      throw new DocEstoqueError("O local de destino não é deste estoque");
    const destinoPadrao = d.destinoLocalId || (await tx.local.findFirst({ where: { depositoId: d.destinoDepositoId }, orderBy: { codigo: "asc" } }))?.id;
    if (!destinoPadrao) throw new DocEstoqueError("O estoque de destino não tem nenhum local cadastrado");
    // do carro só sai o que não está separado para uma OS
    const origemCarro = await tx.deposito.findFirst({ where: { id: d.origemDepositoId, equipeId: { not: null } }, select: { id: true } });
    const numero = await proximoNumero(tx, "TRANSFERENCIA");
    // o documento nasce antes dos movimentos, para cada movimento apontar para ele (kardex e histórico do carro)
    const doc = await tx.transferenciaEstoque.create({
      data: { numero, origemDepositoId: d.origemDepositoId, destinoDepositoId: d.destinoDepositoId, observacoes: d.observacoes.trim() || null, criadoPorId: u.id, criadoPorNome: u.nome },
    });
    let total = 0;
    const linhas = [];
    for (const [ordem, i] of itens.entries()) {
      const q = n(i.quantidade);
      if (!(q > 0)) throw new DocEstoqueError(`Informe a quantidade de ${i.nome || "todos os produtos"}`);
      const p = await tx.produto.findUniqueOrThrow({ where: { id: i.produtoId }, select: { id: true, nome: true, custo: true, localPadraoId: true, localPadrao: { select: { depositoId: true } } } });
      let saldos = (await saldosPorLocal(tx, p.id, d.origemDepositoId)).filter((s) => s.quantidade > 0 && (!d.origemLocalId || s.localId === d.origemLocalId));
      if (origemCarro) {
        const disp = new Map((await disponivelPorLocal(tx, p.id, { incluirCarros: true })).map((x) => [x.localId, x.disponivel]));
        saldos = saldos.map((s) => ({ ...s, quantidade: Math.min(s.quantidade, disp.get(s.localId) ?? s.quantidade) })).filter((s) => s.quantidade > 0);
      }
      const tem = saldos.reduce((s, x) => s + x.quantidade, 0);
      if (tem + 1e-9 < q) throw new DocEstoqueError(`${p.nome}: ${origemCarro ? "o carro só tem livre" : d.origemLocalId ? "o local de origem só tem" : "o estoque de origem só tem"} ${tem.toLocaleString("pt-BR")}${origemCarro ? " (o resto está separado para OS)" : ""}`);
      const para = !d.destinoLocalId && p.localPadrao?.depositoId === d.destinoDepositoId && p.localPadraoId ? p.localPadraoId : destinoPadrao;
      let resta = q;
      for (const s of saldos) {
        if (resta <= 0) break;
        const parte = Math.min(resta, s.quantidade);
        await transferir(tx, { produtoId: p.id, deLocalId: s.localId, paraLocalId: para, quantidade: parte, usuarioId: u.id, origemId: doc.id });
        resta = arred(resta - parte);
      }
      total += q * Number(p.custo);
      linhas.push({ ordem, produtoId: p.id, quantidade: q, custoUnit: Number(p.custo) });
    }
    return tx.transferenciaEstoque.update({ where: { id: doc.id }, data: { total: Math.round(total * 100) / 100, itens: { create: linhas } } });
  }, { timeout: 60000 });
}

// ---------- inventários

export type DadosInventario = {
  descricao: string; responsavelId: string; responsavelNome: string; data: string; motivo: string;
  escopo: "TODOS" | "GRUPOS" | "FORNECEDORES" | "PRODUTOS"; filtroIds: string[];
  contagemCega: boolean; somarLeituras: boolean; considerarMovimento: boolean;
};

export function whereProdutosInventario(escopo: DadosInventario["escopo"], ids: string[]): Prisma.ProdutoWhereInput {
  const base: Prisma.ProdutoWhereInput = { controlaEstoque: true, ativo: true };
  if (escopo === "GRUPOS") return { ...base, OR: [{ grupoId: { in: ids } }, { grupo: { paiId: { in: ids } } }] };
  if (escopo === "FORNECEDORES") return { ...base, fornecedores: { some: { fornecedorId: { in: ids } } } };
  if (escopo === "PRODUTOS") return { ...base, id: { in: ids } };
  return base;
}

/** Contadores do bloco "Escolha os produtos que entram". */
export async function resumoInventario(escopo: DadosInventario["escopo"], ids: string[]) {
  const where = whereProdutosInventario(escopo, ids);
  const produtos = await prisma.produto.findMany({ where, select: { id: true, grupoId: true, custo: true } });
  const saldos = produtos.length ? await prisma.saldo.groupBy({ by: ["produtoId"], where: { produtoId: { in: produtos.map((p) => p.id) } }, _sum: { quantidade: true } }) : [];
  const porProduto = new Map(saldos.map((s) => [s.produtoId, Number(s._sum.quantidade ?? 0)]));
  const unidades = produtos.reduce((s, p) => s + Math.max(0, porProduto.get(p.id) ?? 0), 0);
  const valor = produtos.reduce((s, p) => s + Math.max(0, porProduto.get(p.id) ?? 0) * Number(p.custo), 0);
  return { produtos: produtos.length, grupos: new Set(produtos.map((p) => p.grupoId).filter(Boolean)).size, unidades, valor: Math.round(valor * 100) / 100 };
}

export async function criarInventario(d: DadosInventario) {
  if (!d.descricao.trim()) throw new DocEstoqueError("Informe a descrição");
  if (!d.responsavelNome.trim()) throw new DocEstoqueError("Informe o responsável pelo inventário");
  if (!d.data) throw new DocEstoqueError("Informe a data do inventário");
  if (d.escopo !== "TODOS" && !d.filtroIds.length) throw new DocEstoqueError("Escolha os produtos que entram no inventário");
  return prisma.$transaction(async (tx) => {
    const produtos = await tx.produto.findMany({ where: whereProdutosInventario(d.escopo, d.filtroIds), select: { id: true, custo: true } });
    if (!produtos.length) throw new DocEstoqueError("Nenhum produto com controle de estoque nesse filtro");
    const saldos = await tx.saldo.groupBy({ by: ["produtoId"], where: { produtoId: { in: produtos.map((p) => p.id) } }, _sum: { quantidade: true } });
    const porProduto = new Map(saldos.map((s) => [s.produtoId, Number(s._sum.quantidade ?? 0)]));
    const numero = await proximoNumero(tx, "INVENTARIO");
    return tx.inventario.create({
      data: {
        numero, descricao: d.descricao.trim(), responsavelId: d.responsavelId || null, responsavelNome: d.responsavelNome.trim(), data: parseDia(d.data), motivo: d.motivo.trim() || null,
        escopo: d.escopo, filtroIds: d.escopo === "TODOS" ? [] : d.filtroIds, contagemCega: d.contagemCega, somarLeituras: d.somarLeituras, considerarMovimento: d.considerarMovimento,
        itens: { create: produtos.map((p) => ({ produtoId: p.id, saldoInicial: porProduto.get(p.id) ?? 0, custoUnit: p.custo })) },
      },
    });
  }, { timeout: 120000 });
}

async function inventarioAberto(tx: Tx, id: string) {
  const inv = await tx.inventario.findUniqueOrThrow({ where: { id } });
  if (inv.situacao !== "CONTANDO") throw new DocEstoqueError("Este inventário já foi encerrado");
  return inv;
}

/** Leitura pelo leitor: código de barras ou código do produto; soma 1 (ou a quantidade) se "somar leituras repetidas" estiver ligado. */
export async function lerCodigo(id: string, codigo: string, quantidade = 1) {
  return prisma.$transaction(async (tx) => {
    const inv = await inventarioAberto(tx, id);
    const c = codigo.trim();
    if (!c) throw new DocEstoqueError("Leia ou digite um código");
    const item = await tx.inventarioItem.findFirst({ where: { inventarioId: id, produto: { OR: [{ gtin: c }, { codigo: { equals: c, mode: "insensitive" } }] } }, include: { produto: { select: { nome: true, codigo: true } } } });
    if (!item) throw new DocEstoqueError(`O código ${c} não faz parte deste inventário`);
    const novo = inv.somarLeituras ? Number(item.contado ?? 0) + quantidade : quantidade;
    await tx.inventarioItem.update({ where: { id: item.id }, data: { contado: novo } });
    return { produto: `${item.produto.codigo} ${item.produto.nome}`, contado: novo };
  });
}

/** Digitação da contagem (em lote, a tela envia só o que mudou). Vazio = não contado. */
export async function registrarContagem(id: string, contagens: { itemId: string; contado: string }[]) {
  return prisma.$transaction(async (tx) => {
    await inventarioAberto(tx, id);
    for (const c of contagens) {
      const v = c.contado.trim() === "" ? null : n(c.contado);
      if (v != null && v < 0) throw new DocEstoqueError("A contagem não pode ser negativa");
      await tx.inventarioItem.updateMany({ where: { id: c.itemId, inventarioId: id }, data: { contado: v } });
    }
  });
}

/**
 * Concluir: acerta o saldo dos produtos contados com ajustes de entrada e de saída.
 * Com "considerar entradas e saídas durante a contagem", o que entrou/saiu depois do início soma à contagem.
 */
export async function concluirInventario(id: string, u: Usuario) {
  return prisma.$transaction(async (tx) => {
    const inv = await inventarioAberto(tx, id);
    const itens = await tx.inventarioItem.findMany({ where: { inventarioId: id, contado: { not: null } } });
    const saldos = await tx.saldo.groupBy({ by: ["produtoId"], where: { produtoId: { in: itens.map((i) => i.produtoId) } }, _sum: { quantidade: true } });
    const atual = new Map(saldos.map((s) => [s.produtoId, Number(s._sum.quantidade ?? 0)]));
    const entradas: ItemAjuste[] = [], saidas: ItemAjuste[] = [];
    for (const i of itens) {
      const agora = atual.get(i.produtoId) ?? 0;
      const alvo = Number(i.contado) + (inv.considerarMovimento ? agora - Number(i.saldoInicial) : 0);
      const delta = arred(alvo - agora);
      if (delta > 0) entradas.push({ produtoId: i.produtoId, quantidade: String(delta), custo: String(Number(i.custoUnit)) });
      if (delta < 0) saidas.push({ produtoId: i.produtoId, quantidade: String(-delta), custo: String(Number(i.custoUnit)) });
    }
    const obs = `Inventário nº ${inv.numero}: ${inv.descricao}`;
    const ajustes = [];
    if (entradas.length) ajustes.push(await criarAjusteTx(tx, { tipo: "ENTRADA", frete: "0", observacoes: obs, itens: entradas }, u, { inventarioId: id }));
    if (saidas.length) ajustes.push(await criarAjusteTx(tx, { tipo: "SAIDA", frete: "0", observacoes: obs, itens: saidas }, u, { inventarioId: id }));
    await tx.inventario.update({ where: { id }, data: { situacao: "CONCLUIDO", concluidoEm: new Date() } });
    return { ajustes, contados: itens.length };
  }, { timeout: 300000 });
}

export async function cancelarInventario(id: string) {
  return prisma.$transaction(async (tx) => {
    await inventarioAberto(tx, id);
    await tx.inventario.update({ where: { id }, data: { situacao: "CANCELADO" } });
  });
}
