import { Prisma, type PapelUsuario, type PrioridadeOs } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { proximoNumero } from "@/lib/sequencia";
import { ATIVOS as BOLETOS_ATIVOS } from "@/lib/financeiro/boletos";
import { aposMudarOs } from "@/lib/agenda/google";
import { aplicar, estadoAtual, OsError, travar } from "./ordens";

/**
 * Juntar OS do mesmo cliente que estão na mesma situação numa OS nova: equipamentos e itens de todas
 * (itens iguais somados, sem perder o que o técnico marcou nem as fotos), tempo de mão de obra e chamados passam
 * para a nova, que fica na mesma situação (reservas/baixa e financeiro refeitos uma vez só).
 * As originais são canceladas apontando para a nova (juntadaEmId). Orçamentos ligados passam para a nova.
 */

type Usuario = { id: string; nome: string; papel?: PapelUsuario };
const D = (v: number) => new Prisma.Decimal(v.toFixed(2));
const Q = (v: number) => new Prisma.Decimal(v.toFixed(4));
const arred = (v: number) => Math.round(v * 100) / 100;
const PRIORIDADE: PrioridadeOs[] = ["BAIXA", "MEDIA", "ALTA", "URGENTE", "MUITO_URGENTE"];

/** Situação para onde vão as OS juntadas: a de cancelamento (não mexe no estoque nem no financeiro). */
async function situacaoCancelada(tx: Tx) {
  const nao = await tx.situacaoOsConfig.findMany({ where: { estoque: "NAO", financeiro: false }, orderBy: { ordem: "asc" } });
  return nao.find((s) => /cancel/i.test(s.nome)) ?? nao.find((s) => !/devolv/i.test(s.nome)) ?? nao[0] ?? null;
}

/** Confere tudo o que impede a junção; devolve as mensagens (vazio = pode juntar). */
export async function bloqueiosJuncaoOs(tx: Tx | typeof prisma, ids: string[], u?: Usuario) {
  const ordens = await tx.ordemServico.findMany({ where: { id: { in: ids } }, include: { situacaoCfg: true, cliente: { select: { nome: true } } }, orderBy: { numero: "asc" } });
  const b: string[] = [];
  if (ids.length < 2) b.push("Marque ao menos duas OS do mesmo cliente");
  if (ordens.length !== ids.length) b.push("Alguma OS marcada não existe mais: atualize a lista");
  if (!ordens.length) return { ordens, bloqueios: b };
  if (new Set(ordens.map((o) => o.clienteId)).size > 1) b.push(`As OS são de clientes diferentes (${[...new Set(ordens.map((o) => o.cliente.nome))].join(", ")})`);
  if (new Set(ordens.map((o) => o.empresaId ?? "")).size > 1) b.push("As OS são de empresas (CNPJ) diferentes");
  if (new Set(ordens.map((o) => o.empresaServicosId ?? "")).size > 1) b.push("Os serviços das OS são faturados por empresas diferentes: deixe a mesma empresa em todas");
  if (new Set(ordens.map((o) => o.situacaoId ?? o.situacao)).size > 1) b.push(`As OS estão em situações diferentes (${[...new Set(ordens.map((o) => o.situacaoCfg?.nome ?? o.situacao))].join(", ")}): deixe todas na mesma situação`);
  const s = ordens[0].situacaoCfg;
  if (ordens.some((o) => ["CANCELADA", "DEVOLVIDA_SEM_REPARO"].includes(o.situacao) || o.situacaoCfg?.estoque === "NAO")) b.push("OS cancelada ou devolvida não pode ser juntada");
  if (s && !s.permiteEdicao) b.push(`OS na situação "${s.nome}" não podem ser alteradas, então não dá para juntar`);
  if (s && u?.papel && s.bloqueados.includes(u.papel)) b.push(`Seu grupo não pode mexer em OS na situação "${s.nome}"`);
  for (const o of ordens) {
    const p = `OS nº ${o.numero}`;
    const notas = await tx.notaFiscal.findMany({ where: { origemTipo: "OS", origemId: o.id, status: { in: ["AUTORIZADA", "ENVIADA"] } }, select: { numero: true } });
    if (notas.length) b.push(`${p} tem nota fiscal autorizada (nº ${notas.map((n) => n.numero).join(", ")})`);
    const lancs = await tx.lancamento.findMany({ where: { origemTipo: "OS", origemId: o.id }, select: { id: true, pagoEm: true, transacaoId: true, boletos: { select: { situacao: true } } } });
    if (lancs.some((l) => l.pagoEm)) b.push(`${p} tem conta já recebida`);
    if (lancs.some((l) => l.transacaoId) || (lancs.length && (await tx.transacaoPagSeguro.count({ where: { lancamentoId: { in: lancs.map((l) => l.id) } } })))) b.push(`${p} tem recebimento conciliado com o extrato`);
    if (lancs.some((l) => l.boletos.some((x) => BOLETOS_ATIVOS.includes(x.situacao)))) b.push(`${p} tem boleto registrado no Inter: cancele o boleto antes`);
    if (await tx.lancamentoAgrupado.count({ where: { origemTipo: "OS", origemId: o.id } })) b.push(`${p} tem conta agrupada no financeiro: desagrupe antes`);
  }
  return { ordens, bloqueios: b };
}

export async function juntarOrdens(idsEntrada: string[], u: Usuario, opts: { permitirNegativo?: boolean } = {}) {
  const ids = [...new Set(idsEntrada)];
  const r = await prisma.$transaction(async (tx) => {
    for (const id of [...ids].sort()) await travar(tx, id);
    const { bloqueios } = await bloqueiosJuncaoOs(tx, ids, u);
    if (bloqueios.length) throw new OsError(bloqueios.join(". "));
    const ordens = await tx.ordemServico.findMany({
      where: { id: { in: ids } }, orderBy: { numero: "asc" },
      include: { situacaoCfg: true, produtos: { orderBy: [{ ordem: "asc" }, { createdAt: "asc" }] }, servicos: { orderBy: [{ ordem: "asc" }, { createdAt: "asc" }] }, equipamentos: { orderBy: { ordem: "asc" } }, parcelas: { orderBy: { numero: "asc" } } },
    });
    const para = ordens[0].situacaoCfg ?? (await tx.situacaoOsConfig.findFirst({ where: { padrao: true } }));
    if (!para) throw new OsError("Situação das OS não encontrada");
    const cancelada = await situacaoCancelada(tx);
    if (!cancelada) throw new OsError("Cadastre uma situação de OS que não lance estoque (ex.: Cancelada)");
    const numeros = ordens.map((o) => o.numero);
    const lista = numeros.join(", ");

    const soma = (f: (o: (typeof ordens)[number]) => Prisma.Decimal) => arred(ordens.reduce((s, o) => s + Number(f(o)), 0));
    const totalProdutos = arred(ordens.flatMap((o) => o.produtos).reduce((s, i) => s + Number(i.subtotal), 0));
    const totalServicos = arred(ordens.flatMap((o) => o.servicos).reduce((s, i) => s + Number(i.subtotal), 0));
    const desconto = soma((o) => o.desconto), frete = soma((o) => o.frete), outros = soma((o) => o.outros);
    const total = arred(totalProdutos + totalServicos - desconto + frete + outros);
    const primeiro = <T,>(f: (o: (typeof ordens)[number]) => T | null) => ordens.map(f).find((x) => x != null) ?? null;
    const comum = <T,>(f: (o: (typeof ordens)[number]) => T) => (new Set(ordens.map(f)).size === 1 ? f(ordens[0]) : null);

    // parcelas: mesmo número em todas = soma parcela a parcela; senão, uma só no menor vencimento
    const ps = ordens.map((o) => (o.parcelas.length ? o.parcelas : [{ numero: 1, vencimento: o.saida ?? o.entrada, valor: o.total, formaPagamentoId: o.formaPagamentoId }]));
    const forma = (l: { formaPagamentoId: string | null }[]) => (new Set(l.map((x) => x.formaPagamentoId)).size === 1 ? l[0].formaPagamentoId : l.find((x) => x.formaPagamentoId)?.formaPagamentoId ?? null);
    const n = ps[0].length;
    let condicao = "AVISTA";
    let parcelas: { numero: number; vencimento: Date; valor: Prisma.Decimal; formaPagamentoId: string | null }[];
    if (n > 1 && ps.every((p) => p.length === n)) {
      condicao = "PARCELADO";
      const vals = Array.from({ length: n }, (_, i) => arred(ps.reduce((s, p) => s + Number(p[i].valor), 0)));
      vals[n - 1] = arred(total - vals.slice(0, -1).reduce((s, x) => s + x, 0));
      parcelas = vals.map((v, i) => ({ numero: i + 1, vencimento: new Date(Math.min(...ps.map((p) => p[i].vencimento.getTime()))), valor: D(v), formaPagamentoId: forma(ps.map((p) => p[i])) }));
    } else {
      const todas = ps.flat();
      parcelas = [{ numero: 1, vencimento: new Date(Math.min(...todas.map((x) => x.vencimento.getTime()))), valor: D(total), formaPagamentoId: forma(todas) }];
    }

    const saidas = ordens.map((o) => o.saida);
    const agendadas = ordens.filter((o) => o.agendaInicio).sort((a, b) => a.agendaInicio!.getTime() - b.agendaInicio!.getTime());
    const prioridade = ordens.map((o) => o.prioridade).filter((p): p is PrioridadeOs => !!p).sort((a, b) => PRIORIDADE.indexOf(b) - PRIORIDADE.indexOf(a))[0] ?? null;
    const tecnicoIds = [...new Set(ordens.flatMap((o) => (o.tecnicoIds.length ? o.tecnicoIds : o.tecnicoId ? [o.tecnicoId] : [])))];
    const obs = ordens.filter((o) => o.observacoes?.trim()).map((o) => `OS nº ${o.numero}: ${o.observacoes!.trim()}`);
    const obsInt = [`Junção das OS nº ${lista}.`, ...ordens.filter((o) => o.observacaoInterna?.trim()).map((o) => `OS nº ${o.numero}: ${o.observacaoInterna!.trim()}`)];
    const finalizadas = ordens.map((o) => o.trabalhoFinalizadoEm);

    let numero: number;
    do numero = await proximoNumero(tx, "OS"); while (await tx.ordemServico.findUnique({ where: { numero } }));
    const nova = await tx.ordemServico.create({
      data: {
        numero, clienteId: ordens[0].clienteId, empresaId: ordens[0].empresaId, empresaServicosId: ordens[0].empresaServicosId, vendedorId: primeiro((o) => o.vendedorId), tecnicoId: tecnicoIds[0] ?? null, tecnicoIds,
        equipeId: primeiro((o) => o.equipeId), entrada: new Date(Math.min(...ordens.map((o) => o.entrada.getTime()))),
        saida: saidas.every((s) => s) ? new Date(Math.max(...saidas.map((s) => s!.getTime()))) : null,
        previsao: saidas.every((s) => s) ? new Date(Math.max(...saidas.map((s) => s!.getTime()))) : null,
        prioridade, canal: ordens[0].canal, centroCusto: comum((o) => o.centroCusto) ?? primeiro((o) => o.centroCusto), transportadoraId: primeiro((o) => o.transportadoraId),
        mostrarEntrega: ordens.some((o) => o.mostrarEntrega), enderecoEntregaId: primeiro((o) => (o.mostrarEntrega ? o.enderecoEntregaId : null)),
        totalProdutos: D(totalProdutos), totalServicos: D(totalServicos), desconto: D(desconto), frete: D(frete), outros: D(outros), total: D(total),
        exibirTotal: ordens.every((o) => o.exibirTotal), condicao, formaPagamentoId: parcelas[0].formaPagamentoId, intervaloDias: ordens[0].intervaloDias,
        observacoes: obs.join("\n") || null, observacaoInterna: obsInt.join("\n"),
        camposExtras: Object.assign({}, ...[...ordens].reverse().map((o) => (o.camposExtras && typeof o.camposExtras === "object" ? o.camposExtras : {}))) as Prisma.InputJsonValue,
        agendaInicio: agendadas[0]?.agendaInicio ?? null, agendaDuracaoMin: agendadas[0]?.agendaDuracaoMin ?? null,
        trabalhoFinalizadoEm: finalizadas.every((f) => f) ? new Date(Math.max(...finalizadas.map((f) => f!.getTime()))) : null,
        situacao: "CANCELADA", situacaoId: para.id, criadoPorId: u.id, parcelas: { create: parcelas },
      },
    });

    // equipamentos de todas, na ordem das OS
    let ordem = 1;
    for (const e of ordens.flatMap((o) => o.equipamentos)) {
      await tx.osEquipamento.create({ data: { osId: nova.id, ordem: ordem++, equipamento: e.equipamento, marca: e.marca, modelo: e.modelo, serie: e.serie, condicoes: e.condicoes, defeitos: e.defeitos, acessorios: e.acessorios, solucao: e.solucao, laudo: e.laudo, garantia: e.garantia } });
    }

    // itens iguais (mesmo produto/serviço, preço, local de origem e marca de instalado) viram uma linha só;
    // as fotos do técnico vão junto (Anexo OS_FOTO aponta para a linha)
    const fotos = async (de: { osId: string; id: string }, paraItem: string) =>
      tx.anexo.updateMany({ where: { entidade: "OS_FOTO", entidadeId: de.osId, referencia: de.id }, data: { entidadeId: nova.id, referencia: paraItem } });
    const linhasP = new Map<string, { id: string; quantidade: number; desconto: number; subtotal: number; detalhes: string[] }>();
    ordem = 0;
    for (const i of ordens.flatMap((o) => o.produtos)) {
      const k = `${i.produtoId}~${Number(i.valorUnit).toFixed(2)}~${i.localOrigemId ?? ""}~${i.instalado}~${i.tipoValorId ?? ""}`;
      const l = linhasP.get(k);
      if (l) {
        l.quantidade += Number(i.quantidade); l.desconto += Number(i.desconto); l.subtotal += Number(i.subtotal);
        if (i.detalhes?.trim() && !l.detalhes.includes(i.detalhes.trim())) l.detalhes.push(i.detalhes.trim());
        await fotos(i, l.id);
        continue;
      }
      const c = await tx.osItemProduto.create({ data: { osId: nova.id, ordem: ordem++, produtoId: i.produtoId, quantidade: i.quantidade, valorUnit: i.valorUnit, custoUnit: i.custoUnit, desconto: i.desconto, subtotal: i.subtotal, detalhes: i.detalhes, tipoValorId: i.tipoValorId, criadoPorId: i.criadoPorId, instalado: i.instalado, instaladoEm: i.instaladoEm, instaladoPorId: i.instaladoPorId, localOrigemId: i.localOrigemId } });
      linhasP.set(k, { id: c.id, quantidade: Number(i.quantidade), desconto: Number(i.desconto), subtotal: Number(i.subtotal), detalhes: i.detalhes?.trim() ? [i.detalhes.trim()] : [] });
      await fotos(i, c.id);
    }
    const linhasS = new Map<string, { id: string; quantidade: number; desconto: number; subtotal: number; detalhes: string[] }>();
    ordem = 0;
    for (const i of ordens.flatMap((o) => o.servicos)) {
      const k = `${i.servicoId}~${Number(i.valorUnit).toFixed(2)}~${i.instalado}`;
      const l = linhasS.get(k);
      if (l) {
        l.quantidade += Number(i.quantidade); l.desconto += Number(i.desconto); l.subtotal += Number(i.subtotal);
        if (i.detalhes?.trim() && !l.detalhes.includes(i.detalhes.trim())) l.detalhes.push(i.detalhes.trim());
        await fotos(i, l.id);
        continue;
      }
      const c = await tx.osItemServico.create({ data: { osId: nova.id, ordem: ordem++, servicoId: i.servicoId, quantidade: i.quantidade, valorUnit: i.valorUnit, desconto: i.desconto, subtotal: i.subtotal, detalhes: i.detalhes, criadoPorId: i.criadoPorId, instalado: i.instalado, instaladoEm: i.instaladoEm, instaladoPorId: i.instaladoPorId } });
      linhasS.set(k, { id: c.id, quantidade: Number(i.quantidade), desconto: Number(i.desconto), subtotal: Number(i.subtotal), detalhes: i.detalhes?.trim() ? [i.detalhes.trim()] : [] });
      await fotos(i, c.id);
    }
    for (const l of linhasP.values()) await tx.osItemProduto.update({ where: { id: l.id }, data: { quantidade: Q(l.quantidade), desconto: D(l.desconto), subtotal: D(l.subtotal), detalhes: l.detalhes.join(" / ") || null } });
    for (const l of linhasS.values()) await tx.osItemServico.update({ where: { id: l.id }, data: { quantidade: Q(l.quantidade), desconto: D(l.desconto), subtotal: D(l.subtotal), detalhes: l.detalhes.join(" / ") || null } });

    // o que é da OS e não do documento passa para a nova: orçamentos, anexos, fotos soltas, tempo de mão de obra e chamados
    const orcs = await tx.orcamento.findMany({ where: { osId: { in: ids } }, select: { id: true, situacao: { select: { nome: true } } } });
    for (const o of orcs) {
      await tx.orcamento.update({ where: { id: o.id }, data: { osId: nova.id } });
      await tx.orcamentoHistorico.create({ data: { orcamentoId: o.id, usuarioNome: u.nome, situacao: o.situacao.nome, descricao: `OS nº ${lista} juntadas: o orçamento agora está ligado à OS nº ${numero}` } });
    }
    await tx.anexo.updateMany({ where: { entidade: { in: ["OS", "OS_FOTO"] }, entidadeId: { in: ids } }, data: { entidadeId: nova.id } });
    await tx.osTrabalho.updateMany({ where: { osId: { in: ids } }, data: { osId: nova.id } });
    await tx.chamado.updateMany({ where: { osId: { in: ids } }, data: { osId: nova.id } });

    // cancela as originais (libera reservas/estoque e apaga as contas em aberto) e aponta para a nova
    for (const o of ordens) {
      await aplicar(tx, o.id, estadoAtual(o), cancelada, { permitirNegativo: true, usuarioId: u.id, usuarioNome: u.nome });
      await tx.ordemServico.update({ where: { id: o.id }, data: { juntadaEmId: nova.id, agendaInicio: null } });
      await tx.osHistorico.create({ data: { osId: o.id, situacao: cancelada.nome, usuarioNome: u.nome, usuarioId: u.id, descricao: `OS juntada na OS nº ${numero} (junção das OS nº ${lista}) e cancelada` } });
    }
    await aplicar(tx, nova.id, "LIVRE", para, { permitirNegativo: opts.permitirNegativo, usuarioId: u.id, usuarioNome: u.nome });
    await tx.osHistorico.create({ data: { osId: nova.id, situacao: para.nome, usuarioNome: u.nome, usuarioId: u.id, descricao: `OS criada juntando as OS nº ${lista}` } });
    return { os: await tx.ordemServico.findUniqueOrThrow({ where: { id: nova.id } }), numeros };
  }, { timeout: 60000 });
  // agenda do Google: tira o evento das originais e cria o da nova (melhor esforço)
  for (const id of ids) await aposMudarOs(id);
  await aposMudarOs(r.os.id);
  return r;
}
