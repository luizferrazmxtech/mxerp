import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { diaSP } from "@/lib/datas";
import { ATIVOS } from "@/lib/financeiro/boletos";
import { duracao, resumoTrabalho } from "@/lib/os/trabalho";

/**
 * Consultas da Área do Cliente. TODA consulta filtra pelo cliente logado (pessoaId): é isso que impede um
 * cliente de ver documentos de outro. Nada de observação interna, custo ou dados de outros clientes sai daqui.
 */

/** Só fotos (SVG fica de fora: pode carregar script). */
const IMAGENS = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const n = (v: Prisma.Decimal | number | null | undefined) => (v == null ? 0 : Number(v));

/** Situações de OS que contam como "em andamento" para o cliente. */
const OS_ABERTA = ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_PECA", "AGUARDANDO_APROVACAO"] as const;

async function lojas() {
  const es = await prisma.empresa.findMany({ select: { id: true, nomeFantasia: true, razaoSocial: true, cnpj: true }, orderBy: { createdAt: "asc" } });
  return new Map(es.map((e) => [e.id, { nome: e.nomeFantasia || e.razaoSocial, cnpj: e.cnpj }]));
}

const situacaoOs = (o: { situacao: string; situacaoCfg: { nome: string; cor: string } | null }) =>
  o.situacaoCfg ? { nome: o.situacaoCfg.nome, cor: o.situacaoCfg.cor } : { nome: o.situacao.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()), cor: "cinza" };
const situacaoVenda = (v: { situacao: string; situacaoCfg: { nome: string; cor: string } | null }) =>
  v.situacaoCfg ? { nome: v.situacaoCfg.nome, cor: v.situacaoCfg.cor }
    : { nome: ({ ABERTA: "Em aberto", CONCLUIDA: "Concluída", CANCELADA: "Cancelada", ORCAMENTO: "Orçamento" } as Record<string, string>)[v.situacao] ?? v.situacao, cor: v.situacao === "CONCLUIDA" ? "verde" : v.situacao === "CANCELADA" ? "vermelho" : "amarelo" };

// ───────────── OS ─────────────

export async function listarOs(pessoaId: string) {
  const [os, ls] = await Promise.all([
    prisma.ordemServico.findMany({
      where: { clienteId: pessoaId },
      orderBy: { entrada: "desc" },
      take: 300,
      select: {
        id: true, numero: true, entrada: true, previsao: true, saida: true, situacao: true, total: true, exibirTotal: true, empresaId: true,
        situacaoCfg: { select: { nome: true, cor: true } },
        equipamentos: { select: { equipamento: true, marca: true, modelo: true }, orderBy: { ordem: "asc" } },
      },
    }),
    lojas(),
  ]);
  return os.map((o) => ({
    id: o.id, numero: o.numero, entrada: o.entrada, previsao: o.previsao, saida: o.saida,
    aberta: (OS_ABERTA as readonly string[]).includes(o.situacao), cancelada: o.situacao === "CANCELADA",
    situacao: situacaoOs(o), total: o.exibirTotal ? n(o.total) : null, loja: o.empresaId ? ls.get(o.empresaId)?.nome ?? null : null,
    equipamentos: o.equipamentos.map((e) => [e.equipamento, e.marca, e.modelo].filter(Boolean).join(" ")),
  }));
}

export async function verOs(pessoaId: string, id: string) {
  const o = await prisma.ordemServico.findFirst({
    where: { id, clienteId: pessoaId },
    select: {
      id: true, numero: true, entrada: true, previsao: true, saida: true, situacao: true, observacoes: true, token: true, empresaId: true, tipoAtendimento: true, descricaoVisita: true,
      exibirTotal: true, totalProdutos: true, totalServicos: true, desconto: true, frete: true, outros: true, total: true,
      situacaoCfg: { select: { nome: true, cor: true } },
      tecnico: { select: { nome: true } },
      equipamentos: { orderBy: { ordem: "asc" }, select: { id: true, equipamento: true, marca: true, modelo: true, serie: true, defeitos: true, solucao: true, laudo: true, garantia: true, acessorios: true } },
      produtos: { orderBy: { ordem: "asc" }, select: { id: true, quantidade: true, valorUnit: true, subtotal: true, detalhes: true, produto: { select: { nome: true } } } },
      servicos: { orderBy: { ordem: "asc" }, select: { id: true, quantidade: true, valorUnit: true, subtotal: true, detalhes: true, servico: { select: { nome: true } } } },
      historico: { where: { situacao: { not: null } }, orderBy: { createdAt: "asc" }, select: { id: true, situacao: true, createdAt: true } },
    },
  });
  if (!o) return null;
  const [ls, fotos, notas, contas, trabalho] = await Promise.all([
    lojas(),
    // fotos da instalação tiradas pelo técnico (só a entidade OS_FOTO; os anexos internos da OS não aparecem)
    prisma.anexo.findMany({ where: { entidade: "OS_FOTO", entidadeId: o.id, tipo: { in: IMAGENS } }, orderBy: [{ ordem: "asc" }, { createdAt: "asc" }], select: { id: true, nome: true, createdAt: true } }),
    notasDe(pessoaId, { origemTipo: "OS", origemId: o.id }),
    contasDe(pessoaId, { origemTipo: "OS", origemId: o.id }),
    resumoTrabalho(o.id),
  ]);
  const total = o.exibirTotal;
  // só o tempo total de execução vai para o cliente (os trechos, motivos e correções são internos)
  const tempoMs = trabalho.fechadoMs + (trabalho.abertoDesde ? Date.now() - new Date(trabalho.abertoDesde).getTime() : 0);
  const tempoExecucao = trabalho.estado === "NAO_INICIADO" ? null : `${duracao(tempoMs)}${trabalho.estado === "FINALIZADO" ? "" : " (em andamento)"}`;
  return {
    id: o.id, numero: o.numero, entrada: o.entrada, previsao: o.previsao, saida: o.saida, observacoes: o.observacoes, token: o.token,
    visita: o.tipoAtendimento === "VISITA" ? o.descricaoVisita : null,
    situacao: situacaoOs(o), cancelada: o.situacao === "CANCELADA", tecnico: o.tecnico?.nome ?? null, tempoExecucao,
    loja: o.empresaId ? ls.get(o.empresaId) ?? null : null,
    equipamentos: o.equipamentos,
    produtos: o.produtos.map((p) => ({ id: p.id, nome: p.produto.nome, detalhes: p.detalhes, quantidade: n(p.quantidade), valorUnit: total ? n(p.valorUnit) : null, subtotal: total ? n(p.subtotal) : null })),
    servicos: o.servicos.map((s) => ({ id: s.id, nome: s.servico.nome, detalhes: s.detalhes, quantidade: n(s.quantidade), valorUnit: total ? n(s.valorUnit) : null, subtotal: total ? n(s.subtotal) : null })),
    totais: total ? { produtos: n(o.totalProdutos), servicos: n(o.totalServicos), desconto: n(o.desconto), frete: n(o.frete), outros: n(o.outros), total: n(o.total) } : null,
    linhaDoTempo: o.historico.map((h) => ({ id: h.id, situacao: h.situacao!, quando: h.createdAt })),
    fotos, notas, contas,
  };
}

/** Uma foto de instalação, só se a OS for do cliente. */
export async function fotoDaOs(pessoaId: string, anexoId: string) {
  const a = await prisma.anexo.findFirst({ where: { id: anexoId, entidade: "OS_FOTO", tipo: { in: IMAGENS } } });
  if (!a) return null;
  const dono = await prisma.ordemServico.count({ where: { id: a.entidadeId, clienteId: pessoaId } });
  return dono ? a : null;
}

// ───────────── Compras (vendas) ─────────────

export async function listarVendas(pessoaId: string) {
  const [vs, ls] = await Promise.all([
    prisma.venda.findMany({
      where: { clienteId: pessoaId, situacao: { not: "ORCAMENTO" } },
      orderBy: { data: "desc" },
      take: 300,
      select: { id: true, numero: true, data: true, total: true, situacao: true, empresaId: true, prazoEntrega: true, situacaoCfg: { select: { nome: true, cor: true } }, _count: { select: { itens: true, servicos: true } } },
    }),
    lojas(),
  ]);
  return vs.map((v) => ({
    id: v.id, numero: v.numero, data: v.data, total: n(v.total), situacao: situacaoVenda(v), cancelada: v.situacao === "CANCELADA",
    aberta: v.situacao === "ABERTA", prazoEntrega: v.prazoEntrega, itens: v._count.itens + v._count.servicos,
    loja: v.empresaId ? ls.get(v.empresaId)?.nome ?? null : null,
  }));
}

export async function verVenda(pessoaId: string, id: string) {
  const v = await prisma.venda.findFirst({
    where: { id, clienteId: pessoaId, situacao: { not: "ORCAMENTO" } },
    select: {
      id: true, numero: true, data: true, situacao: true, observacoes: true, token: true, empresaId: true, prazoEntrega: true,
      totalProdutos: true, totalServicos: true, desconto: true, frete: true, total: true,
      situacaoCfg: { select: { nome: true, cor: true } }, vendedor: { select: { nome: true } },
      itens: { orderBy: { ordem: "asc" }, select: { id: true, quantidade: true, valorUnit: true, subtotal: true, detalhes: true, descricao: true, produto: { select: { nome: true } } } },
      servicos: { orderBy: { ordem: "asc" }, select: { id: true, quantidade: true, valorUnit: true, subtotal: true, detalhes: true, servico: { select: { nome: true } } } },
      historico: { where: { situacao: { not: null } }, orderBy: { createdAt: "asc" }, select: { id: true, situacao: true, createdAt: true } },
    },
  });
  if (!v) return null;
  const [ls, notas, contas] = await Promise.all([lojas(), notasDe(pessoaId, { origemTipo: "VENDA", origemId: v.id }), contasDe(pessoaId, { origemTipo: "VENDA", origemId: v.id })]);
  return {
    id: v.id, numero: v.numero, data: v.data, observacoes: v.observacoes, token: v.token, prazoEntrega: v.prazoEntrega,
    situacao: situacaoVenda(v), cancelada: v.situacao === "CANCELADA", vendedor: v.vendedor?.nome ?? null,
    loja: v.empresaId ? ls.get(v.empresaId) ?? null : null,
    itens: [
      ...v.itens.map((i) => ({ id: i.id, nome: i.descricao || i.produto.nome, detalhes: i.detalhes, quantidade: n(i.quantidade), valorUnit: n(i.valorUnit), subtotal: n(i.subtotal) })),
      ...v.servicos.map((i) => ({ id: i.id, nome: i.servico.nome, detalhes: i.detalhes, quantidade: n(i.quantidade), valorUnit: n(i.valorUnit), subtotal: n(i.subtotal) })),
    ],
    totais: { produtos: n(v.totalProdutos), servicos: n(v.totalServicos), desconto: n(v.desconto), frete: n(v.frete), total: n(v.total) },
    linhaDoTempo: v.historico.map((h) => ({ id: h.id, situacao: h.situacao!, quando: h.createdAt })),
    notas, contas,
  };
}

// ───────────── Orçamentos ─────────────

export async function listarOrcamentos(pessoaId: string) {
  const os = await prisma.orcamento.findMany({
    where: { clienteId: pessoaId },
    orderBy: { data: "desc" },
    take: 200,
    select: { id: true, numero: true, data: true, validade: true, total: true, exibirTotal: true, token: true, tipo: true, situacao: { select: { nome: true, cor: true } } },
  });
  return os.map((o) => ({ id: o.id, numero: o.numero, data: o.data, validade: o.validade, total: o.exibirTotal ? n(o.total) : null, token: o.token, servicos: o.tipo !== "PRODUTO", situacao: o.situacao }));
}

// ───────────── Notas fiscais ─────────────

type FiltroOrigem = { origemTipo: "OS" | "VENDA"; origemId: string };

/** Notas autorizadas (e canceladas, para o cliente saber) das vendas e OS do cliente. */
export async function notasDe(pessoaId: string, so?: FiltroOrigem) {
  let filtro: Prisma.NotaFiscalWhereInput;
  if (so) filtro = { origemTipo: so.origemTipo, origemId: so.origemId };
  else {
    const [vs, os] = await Promise.all([
      prisma.venda.findMany({ where: { clienteId: pessoaId }, select: { id: true } }),
      prisma.ordemServico.findMany({ where: { clienteId: pessoaId }, select: { id: true } }),
    ]);
    filtro = { OR: [{ origemTipo: "VENDA", origemId: { in: vs.map((v) => v.id) } }, { origemTipo: "OS", origemId: { in: os.map((o) => o.id) } }] };
  }
  const [ns, ls] = await Promise.all([
    prisma.notaFiscal.findMany({
      where: { AND: [filtro, { status: { in: ["AUTORIZADA", "CANCELADA"] } }] },
      orderBy: [{ emitidaEm: "desc" }, { createdAt: "desc" }],
      take: 500,
      select: { id: true, modelo: true, serie: true, numero: true, chave: true, status: true, ambiente: true, valorTotal: true, emitidaEm: true, createdAt: true, origemTipo: true, origemId: true, empresaId: true },
    }),
    lojas(),
  ]);
  // número da venda/OS de cada nota, para o cliente reconhecer
  const ids = (t: string) => ns.filter((x) => x.origemTipo === t && x.origemId).map((x) => x.origemId!);
  const [vs, os] = await Promise.all([
    prisma.venda.findMany({ where: { id: { in: ids("VENDA") }, clienteId: pessoaId }, select: { id: true, numero: true } }),
    prisma.ordemServico.findMany({ where: { id: { in: ids("OS") }, clienteId: pessoaId }, select: { id: true, numero: true } }),
  ]);
  const origem = new Map<string, { rotulo: string; href: string }>([
    ...vs.map((v) => [v.id, { rotulo: `Compra nº ${v.numero}`, href: `/area-cliente/compras/${v.id}` }] as const),
    ...os.map((o) => [o.id, { rotulo: `OS nº ${o.numero}`, href: `/area-cliente/os/${o.id}` }] as const),
  ]);
  return ns.map((x) => ({
    id: x.id, modelo: x.modelo, serie: x.serie, numero: x.numero, chave: x.chave, cancelada: x.status === "CANCELADA", homologacao: x.ambiente === "HOMOLOGACAO",
    valor: n(x.valorTotal), data: x.emitidaEm ?? x.createdAt, loja: x.empresaId ? ls.get(x.empresaId) ?? null : null,
    origem: x.origemId ? origem.get(x.origemId) ?? null : null,
    danfse: x.modelo === "NFSE" && x.chave ? `/area-cliente/arquivos/nota/${x.id}/pdf` : null,
  }));
}
export type NotaPortal = Awaited<ReturnType<typeof notasDe>>[number];

/** A nota, só se ela veio de uma venda ou OS do cliente (para baixar PDF/XML). */
export async function notaDoCliente(pessoaId: string, id: string) {
  const nf = await prisma.notaFiscal.findUnique({ where: { id } });
  if (!nf || !nf.origemId || !["AUTORIZADA", "CANCELADA"].includes(nf.status)) return null;
  const dono = nf.origemTipo === "VENDA" ? await prisma.venda.count({ where: { id: nf.origemId, clienteId: pessoaId } })
    : nf.origemTipo === "OS" ? await prisma.ordemServico.count({ where: { id: nf.origemId, clienteId: pessoaId } }) : 0;
  return dono ? nf : null;
}

// ───────────── Financeiro (contas a pagar do cliente) ─────────────

export async function contasDe(pessoaId: string, so?: FiltroOrigem) {
  const ls = await prisma.lancamento.findMany({
    where: { pessoaId, tipo: "RECEBER", ...(so ? { origemTipo: so.origemTipo, origemId: so.origemId } : {}) },
    orderBy: [{ vencimento: "asc" }],
    take: 500,
    select: {
      id: true, descricao: true, valor: true, vencimento: true, pagoEm: true, valorPago: true, parcela: true, totalParcelas: true, origemTipo: true, origemId: true,
      formaPagamento: { select: { nome: true } },
      boletos: { orderBy: { createdAt: "desc" }, select: { token: true, situacao: true, linhaDigitavel: true, pixCopiaECola: true, vencimento: true, valor: true } },
    },
  });
  const hoje = diaSP(); // dia de Brasília
  return ls.map((l) => {
    const b = l.boletos.find((x) => ATIVOS.includes(x.situacao));
    return {
      id: l.id, descricao: l.descricao, valor: n(l.valor), vencimento: l.vencimento, pagoEm: l.pagoEm, valorPago: l.valorPago == null ? null : n(l.valorPago),
      parcela: l.totalParcelas > 1 ? `${l.parcela}/${l.totalParcelas}` : null, forma: l.formaPagamento?.nome ?? null,
      vencida: !l.pagoEm && l.vencimento < hoje,
      origem: l.origemTipo === "VENDA" && l.origemId ? `/area-cliente/compras/${l.origemId}` : l.origemTipo === "OS" && l.origemId ? `/area-cliente/os/${l.origemId}` : null,
      boleto: !l.pagoEm && b ? { link: `/cobranca/boleto/${b.token}`, linhaDigitavel: b.linhaDigitavel, pix: b.pixCopiaECola } : null,
    };
  });
}
export type ContaPortal = Awaited<ReturnType<typeof contasDe>>[number];

// ───────────── Início ─────────────

export async function resumoCliente(pessoaId: string) {
  const [os, vendas, notas, contas] = await Promise.all([listarOs(pessoaId), listarVendas(pessoaId), notasDe(pessoaId), contasDe(pessoaId)]);
  const abertas = contas.filter((c) => !c.pagoEm);
  return {
    os: { andamento: os.filter((o) => o.aberta), total: os.length, recentes: os.slice(0, 5) },
    vendas: { abertas: vendas.filter((v) => v.aberta).length, total: vendas.length, recentes: vendas.slice(0, 5) },
    notas: { total: notas.filter((x) => !x.cancelada).length, recentes: notas.slice(0, 5) },
    financeiro: {
      emAberto: abertas.reduce((s, c) => s + c.valor, 0), qtdAberto: abertas.length,
      vencido: abertas.filter((c) => c.vencida).reduce((s, c) => s + c.valor, 0), qtdVencido: abertas.filter((c) => c.vencida).length,
      proximas: abertas.slice(0, 5),
    },
  };
}
