import { Prisma, type PapelUsuario } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { proximoDocLivre } from "@/lib/sequencia";
import { ATIVOS as BOLETOS_ATIVOS } from "@/lib/financeiro/boletos";
import { aplicar, estadoDe, estadoDoEnum, PedidoError, situacaoDoEstado, travar } from "./pedidos";

/**
 * Juntar vendas do mesmo cliente que estão na mesma situação numa venda nova: os itens são somados,
 * a nova fica na mesma situação (refaz reservas/baixa e financeiro uma vez só) e as originais são canceladas
 * apontando para a nova (juntadaEmId). Orçamentos ligados passam para a nova.
 * Não junta o que não dá para desfazer pelo ERP: nota autorizada, recebimento, conciliação, boleto registrado,
 * troca/devolução, conta agrupada, pedido de marketplace, cobrança de contrato e etiqueta de frete.
 */

type Usuario = { id: string; nome: string; papel?: PapelUsuario };
const D = (v: number) => new Prisma.Decimal(v.toFixed(2));
const Q = (v: number) => new Prisma.Decimal(v.toFixed(4));
const arred = (v: number) => Math.round(v * 100) / 100;

/** Confere tudo o que impede a junção; devolve as mensagens (vazio = pode juntar). */
export async function bloqueiosJuncaoVendas(tx: Tx | typeof prisma, ids: string[], u?: Usuario) {
  const vendas = await tx.venda.findMany({ where: { id: { in: ids } }, include: { situacaoCfg: true, cliente: { select: { nome: true } } }, orderBy: { numero: "asc" } });
  const b: string[] = [];
  if (ids.length < 2) b.push("Marque ao menos duas vendas do mesmo cliente");
  if (vendas.length !== ids.length) b.push("Alguma venda marcada não existe mais: atualize a lista");
  if (!vendas.length) return { vendas, bloqueios: b };
  if (vendas.some((v) => v.tipo === "BALCAO")) b.push("Venda do PDV (balcão) não pode ser juntada");
  if (vendas.some((v) => !v.clienteId)) b.push("Toda venda precisa ter o cliente informado");
  else if (new Set(vendas.map((v) => v.clienteId)).size > 1) b.push(`As vendas são de clientes diferentes (${[...new Set(vendas.map((v) => v.cliente?.nome))].join(", ")})`);
  if (new Set(vendas.map((v) => v.empresaId ?? "")).size > 1) b.push("As vendas são de empresas (CNPJ) diferentes");
  if (new Set(vendas.map((v) => v.situacaoId ?? v.situacao)).size > 1) b.push(`As vendas estão em situações diferentes (${[...new Set(vendas.map((v) => v.situacaoCfg?.nome ?? v.situacao))].join(", ")}): deixe todas na mesma situação`);
  const s = vendas[0].situacaoCfg;
  if (vendas.some((v) => v.situacao === "CANCELADA" || v.situacaoCfg?.estoque === "NAO")) b.push("Venda cancelada não pode ser juntada");
  if (s && !s.permiteEdicao) b.push(`Vendas na situação "${s.nome}" não podem ser alteradas, então não dá para juntar`);
  if (s && u?.papel && s.bloqueados.includes(u.papel)) b.push(`Seu grupo não pode mexer em vendas na situação "${s.nome}"`);
  for (const v of vendas) {
    const p = `Venda nº ${v.numero}`;
    if (await tx.devolucao.count({ where: { vendaId: v.id } })) b.push(`${p} tem troca ou devolução`);
    const notas = await tx.notaFiscal.findMany({ where: { origemTipo: "VENDA", origemId: v.id, status: { in: ["AUTORIZADA", "ENVIADA"] } }, select: { numero: true } });
    if (notas.length) b.push(`${p} tem nota fiscal autorizada (nº ${notas.map((n) => n.numero).join(", ")})`);
    const lancs = await tx.lancamento.findMany({ where: { origemTipo: "VENDA", origemId: v.id }, select: { id: true, pagoEm: true, transacaoId: true, boletos: { select: { situacao: true } } } });
    if (lancs.some((l) => l.pagoEm)) b.push(`${p} tem conta já recebida`);
    if (lancs.some((l) => l.transacaoId) || (lancs.length && (await tx.transacaoPagSeguro.count({ where: { lancamentoId: { in: lancs.map((l) => l.id) } } })))) b.push(`${p} tem recebimento conciliado com o extrato`);
    if (lancs.some((l) => l.boletos.some((x) => BOLETOS_ATIVOS.includes(x.situacao)))) b.push(`${p} tem boleto registrado no Inter: cancele o boleto antes`);
    if (await tx.lancamentoAgrupado.count({ where: { origemTipo: "VENDA", origemId: v.id } })) b.push(`${p} tem conta agrupada no financeiro: desagrupe antes`);
    if (await tx.pedidoMarketplace.count({ where: { vendaId: v.id } })) b.push(`${p} é pedido de marketplace`);
    if (await tx.contratoCobranca.count({ where: { vendaId: v.id } })) b.push(`${p} é cobrança de contrato`);
    if (await tx.envioFrete.count({ where: { vendaId: v.id, situacao: { notIn: ["CARRINHO", "CANCELADA", "ERRO"] } } })) b.push(`${p} tem etiqueta de frete comprada`);
  }
  return { vendas, bloqueios: b };
}

/** Parcelas da venda juntada: se todas têm o mesmo número de parcelas, soma parcela a parcela; senão, uma só. */
function parcelasJuntas(vendas: { data: Date; total: Prisma.Decimal; formaPagamentoId: string | null; parcelas: { numero: number; vencimento: Date; valor: Prisma.Decimal; formaPagamentoId: string | null }[] }[], total: number) {
  const ps = vendas.map((v) => (v.parcelas.length ? [...v.parcelas].sort((a, b) => a.numero - b.numero) : [{ numero: 1, vencimento: v.data, valor: v.total, formaPagamentoId: v.formaPagamentoId }]));
  const n = ps[0].length;
  const forma = (lista: { formaPagamentoId: string | null }[]) => (new Set(lista.map((x) => x.formaPagamentoId)).size === 1 ? lista[0].formaPagamentoId : lista.find((x) => x.formaPagamentoId)?.formaPagamentoId ?? null);
  if (n > 1 && ps.every((p) => p.length === n)) {
    const r = Array.from({ length: n }, (_, i) => {
      const col = ps.map((p) => p[i]);
      return { numero: i + 1, vencimento: new Date(Math.min(...col.map((x) => x.vencimento.getTime()))), valor: arred(col.reduce((s, x) => s + Number(x.valor), 0)), formaPagamentoId: forma(col), observacao: null };
    });
    // centavos de arredondamento ficam na última
    r[n - 1].valor = arred(total - r.slice(0, -1).reduce((s, x) => s + x.valor, 0));
    return { condicao: "PARCELADO", parcelas: r.map((x) => ({ ...x, valor: D(x.valor) })) };
  }
  const todas = ps.flat();
  return { condicao: "AVISTA", parcelas: [{ numero: 1, vencimento: new Date(Math.min(...todas.map((x) => x.vencimento.getTime()))), valor: D(total), formaPagamentoId: forma(todas), observacao: null }] };
}

export async function juntarVendas(idsEntrada: string[], u: Usuario, opts: { permitirNegativo?: boolean } = {}) {
  const ids = [...new Set(idsEntrada)];
  return prisma.$transaction(async (tx) => {
    for (const id of [...ids].sort()) await travar(tx, id);
    const { bloqueios } = await bloqueiosJuncaoVendas(tx, ids, u);
    if (bloqueios.length) throw new PedidoError(bloqueios.join(". "));
    const vendas = await tx.venda.findMany({
      where: { id: { in: ids } }, orderBy: { numero: "asc" },
      include: { situacaoCfg: true, itens: { orderBy: { ordem: "asc" } }, servicos: { orderBy: { ordem: "asc" } }, parcelas: true },
    });
    const para = vendas[0].situacaoCfg ?? (await situacaoDoEstado(tx, vendas[0].situacao));
    if (!para) throw new PedidoError("Situação das vendas não encontrada");
    const cancelada = await situacaoDoEstado(tx, "CANCELADA");
    if (!cancelada) throw new PedidoError("Cadastre uma situação de venda que não lance estoque (ex.: Cancelada)");
    const numeros = vendas.map((v) => v.numero);
    const lista = numeros.join(", ");

    // itens iguais (mesmo produto, descrição e preço) viram uma linha só, com as quantidades somadas
    type Linha = { produtoId: string; descricao: string | null; tipoValorId: string | null; valorUnit: Prisma.Decimal; custoUnit: Prisma.Decimal; quantidade: number; desconto: number; subtotal: number; detalhes: string[] };
    const itens = new Map<string, Linha>();
    for (const i of vendas.flatMap((v) => v.itens)) {
      const k = `${i.produtoId}~${i.descricao ?? ""}~${Number(i.valorUnit).toFixed(2)}~${i.tipoValorId ?? ""}`;
      const l = itens.get(k) ?? { produtoId: i.produtoId, descricao: i.descricao, tipoValorId: i.tipoValorId, valorUnit: i.valorUnit, custoUnit: i.custoUnit, quantidade: 0, desconto: 0, subtotal: 0, detalhes: [] };
      l.quantidade += Number(i.quantidade); l.desconto += Number(i.desconto); l.subtotal += Number(i.subtotal);
      if (i.detalhes?.trim() && !l.detalhes.includes(i.detalhes.trim())) l.detalhes.push(i.detalhes.trim());
      itens.set(k, l);
    }
    type LinhaS = { servicoId: string; valorUnit: Prisma.Decimal; quantidade: number; desconto: number; subtotal: number; detalhes: string[] };
    const servicos = new Map<string, LinhaS>();
    for (const i of vendas.flatMap((v) => v.servicos)) {
      const k = `${i.servicoId}~${Number(i.valorUnit).toFixed(2)}`;
      const l = servicos.get(k) ?? { servicoId: i.servicoId, valorUnit: i.valorUnit, quantidade: 0, desconto: 0, subtotal: 0, detalhes: [] };
      l.quantidade += Number(i.quantidade); l.desconto += Number(i.desconto); l.subtotal += Number(i.subtotal);
      if (i.detalhes?.trim() && !l.detalhes.includes(i.detalhes.trim())) l.detalhes.push(i.detalhes.trim());
      servicos.set(k, l);
    }
    const soma = (f: (v: (typeof vendas)[number]) => Prisma.Decimal) => arred(vendas.reduce((s, v) => s + Number(f(v)), 0));
    const totalProdutos = arred([...itens.values()].reduce((s, l) => s + l.subtotal, 0));
    const totalServicos = arred([...servicos.values()].reduce((s, l) => s + l.subtotal, 0));
    const desconto = soma((v) => v.desconto), frete = soma((v) => v.frete);
    const total = arred(totalProdutos + totalServicos - desconto + frete);
    const fin = parcelasJuntas(vendas, total);
    const primeiro = <T,>(f: (v: (typeof vendas)[number]) => T | null) => vendas.map(f).find((x) => x != null) ?? null;
    const comum = <T,>(f: (v: (typeof vendas)[number]) => T) => (new Set(vendas.map(f)).size === 1 ? f(vendas[0]) : null);
    const obs = vendas.filter((v) => v.observacoes?.trim()).map((v) => (vendas.length > 1 ? `Venda nº ${v.numero}: ${v.observacoes!.trim()}` : v.observacoes!.trim()));
    const obsInt = [`Junção das vendas nº ${lista}.`, ...vendas.filter((v) => v.observacaoInterna?.trim()).map((v) => `Venda nº ${v.numero}: ${v.observacaoInterna!.trim()}`)];
    const prazos = vendas.map((v) => v.prazoEntrega).filter((d): d is Date => !!d);

    const numero = await proximoDocLivre(tx, tx.venda, "VENDA", vendas[0].empresaId);
    const nova = await tx.venda.create({
      data: {
        numero, tipo: itens.size ? "PEDIDO" : "SERVICO", clienteId: vendas[0].clienteId, empresaId: vendas[0].empresaId, vendedorId: primeiro((v) => v.vendedorId),
        data: new Date(), prazoEntrega: prazos.length ? new Date(Math.min(...prazos.map((d) => d.getTime()))) : null, canal: vendas[0].canal,
        centroCusto: comum((v) => v.centroCusto) ?? primeiro((v) => v.centroCusto), transportadoraId: primeiro((v) => v.transportadoraId),
        mostrarEntrega: vendas.some((v) => v.mostrarEntrega), enderecoEntregaId: primeiro((v) => (v.mostrarEntrega ? v.enderecoEntregaId : null)),
        totalProdutos: D(totalProdutos), totalServicos: D(totalServicos), desconto: D(desconto), frete: D(frete), total: D(total),
        condicao: fin.condicao, formaPagamentoId: fin.parcelas[0].formaPagamentoId, intervaloDias: vendas[0].intervaloDias,
        observacoes: obs.join("\n") || null, observacaoInterna: obsInt.join("\n"),
        camposExtras: Object.assign({}, ...[...vendas].reverse().map((v) => (v.camposExtras && typeof v.camposExtras === "object" ? v.camposExtras : {}))) as Prisma.InputJsonValue,
        situacao: "CANCELADA", situacaoId: para.id, criadoPorId: u.id || null, parcelas: { create: fin.parcelas },
      },
    });
    let ordem = 0;
    for (const l of itens.values())
      await tx.vendaItem.create({ data: { vendaId: nova.id, ordem: ordem++, produtoId: l.produtoId, descricao: l.descricao, detalhes: l.detalhes.join(" / ") || null, tipoValorId: l.tipoValorId, quantidade: Q(l.quantidade), valorUnit: l.valorUnit, custoUnit: l.custoUnit, desconto: D(l.desconto), subtotal: D(l.subtotal) } });
    ordem = 0;
    for (const l of servicos.values())
      await tx.vendaItemServico.create({ data: { vendaId: nova.id, ordem: ordem++, servicoId: l.servicoId, detalhes: l.detalhes.join(" / ") || null, quantidade: Q(l.quantidade), valorUnit: l.valorUnit, desconto: D(l.desconto), subtotal: D(l.subtotal) } });

    // orçamentos e anexos passam para a nova (assim o cancelamento das originais não libera o orçamento)
    const orcs = await tx.orcamento.findMany({ where: { vendaId: { in: ids } }, select: { id: true, situacaoId: true, situacao: { select: { nome: true } } } });
    for (const o of orcs) {
      await tx.orcamento.update({ where: { id: o.id }, data: { vendaId: nova.id } });
      await tx.orcamentoHistorico.create({ data: { orcamentoId: o.id, usuarioNome: u.nome, situacao: o.situacao.nome, descricao: `Vendas nº ${lista} juntadas: o orçamento agora está ligado à venda nº ${numero}` } });
    }
    await tx.anexo.updateMany({ where: { entidade: "VENDA", entidadeId: { in: ids } }, data: { entidadeId: nova.id } });

    // cancela as originais (libera reservas/estoque e apaga as contas em aberto) e aponta para a nova
    for (const v of vendas) {
      await aplicar(tx, v.id, { estado: v.situacaoCfg ? estadoDe(v.situacaoCfg.estoque) : estadoDoEnum(v.situacao), financeiro: !!v.situacaoCfg?.financeiro }, cancelada, { permitirNegativo: true, usuarioId: u.id || undefined, usuarioNome: u.nome });
      await tx.venda.update({ where: { id: v.id }, data: { juntadaEmId: nova.id } });
      await tx.vendaHistorico.create({ data: { vendaId: v.id, situacao: cancelada.nome, usuarioNome: u.nome, descricao: `Venda juntada na venda nº ${numero} (junção das vendas nº ${lista}) e cancelada` } });
    }
    // a nova entra na mesma situação: reserva/baixa e financeiro uma vez só
    await aplicar(tx, nova.id, { estado: "LIVRE", financeiro: false }, para, { permitirNegativo: opts.permitirNegativo, usuarioId: u.id || undefined, usuarioNome: u.nome });
    await tx.vendaHistorico.create({ data: { vendaId: nova.id, situacao: para.nome, usuarioNome: u.nome, descricao: `Venda criada juntando as vendas nº ${lista}` } });
    return { venda: await tx.venda.findUniqueOrThrow({ where: { id: nova.id } }), numeros };
  }, { timeout: 60000 });
}
