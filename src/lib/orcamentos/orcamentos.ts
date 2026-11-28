import { Prisma, type PapelUsuario } from "@prisma/client";
import { prisma } from "@/lib/db";
import { chaveDoc, numeroEmUso, proximoDocLivre, subirSequencia } from "@/lib/sequencia";
import { diaSP, parseDia, periodoDia } from "@/lib/datas";
import { salvarPedido } from "@/lib/vendas/pedidos";
import { salvarOs } from "@/lib/os/os";
import { produtoAvulsoId } from "@/lib/itens/avulso";
import { descontoLinha, linhasProdutos, lerNumero, subtotalProduto, subtotalServico, totais, type DadosOrcamento } from "./tipos";
import { cadaPalavra, contem, numeroPalavra } from "@/lib/busca/palavras";

export * from "./tipos";

type Usuario = { id: string; nome: string; papel?: PapelUsuario };
const t = (s: string | undefined | null) => (s ?? "").trim() || null;
const n = (s: string) => lerNumero(s) ?? 0;
const D = (v: number) => new Prisma.Decimal(v.toFixed(2));
const dia = (s: string) => (t(s) ? parseDia(s) : null);

export class OrcamentoError extends Error {}

async function situacaoInicial() {
  const s = await prisma.situacaoOrcamento.findFirst({ orderBy: { ordem: "asc" } });
  if (!s) throw new OrcamentoError("Cadastre ao menos uma situação de orçamento");
  return s;
}

/** Cadastra ou altera o orçamento inteiro (todos os blocos do formulário). */
export async function salvarOrcamento(d: DadosOrcamento, u: Usuario, id?: string) {
  if (!t(d.clienteId)) throw new OrcamentoError("Informe o cliente");
  if (!t(d.data)) throw new OrcamentoError("Informe a data");
  if (!t(d.canal)) throw new OrcamentoError("Informe o canal de venda");
  const { linhas: produtos, erro } = linhasProdutos(d.produtos);
  if (erro) throw new OrcamentoError(erro);
  const servicos = d.servicos.filter((l) => l.servicoId);
  if (!produtos.length && !servicos.length) throw new OrcamentoError("Adicione ao menos um produto ou serviço");
  const avulsoId = produtos.some((l) => l.avulso) ? await produtoAvulsoId(prisma) : "";
  for (const l of [...produtos, ...servicos]) if (!(n(l.quantidade) > 0)) throw new OrcamentoError(`Informe a quantidade de ${l.nome || "todos os itens"}`);
  const tot = totais({ ...d, produtos, servicos });
  if (tot.total < 0) throw new OrcamentoError("O desconto é maior que o valor do orçamento");

  let parcelas: { numero: number; vencimento: Date; valor: Prisma.Decimal; formaPagamentoId: string | null; observacao: string | null }[] = [];
  if (d.gerarCondicoes) {
    if (d.condicao === "AVISTA") {
      parcelas = [{ numero: 1, vencimento: dia(d.vencimento) ?? parseDia(d.data), valor: D(tot.total), formaPagamentoId: t(d.formaPagamentoId), observacao: null }];
    } else {
      if (!d.parcelas.length) throw new OrcamentoError("Clique em Gerar parcelas");
      const soma = d.parcelas.reduce((s, p) => s + n(p.valor), 0);
      if (Math.abs(soma - tot.total) > 0.009) throw new OrcamentoError(`A soma das parcelas (${soma.toFixed(2)}) não fecha com o total (${tot.total.toFixed(2)}). Gere as parcelas de novo.`);
      parcelas = d.parcelas.map((p, i) => {
        if (!t(p.vencimento)) throw new OrcamentoError(`Informe o vencimento da parcela ${i + 1}`);
        return { numero: i + 1, vencimento: parseDia(p.vencimento), valor: D(n(p.valor)), formaPagamentoId: t(p.formaPagamentoId) ?? t(d.formaPagamentoId), observacao: t(p.observacao) };
      });
    }
  }

  const dados = {
    tipo: produtos.length ? ("PRODUTO" as const) : ("SERVICO" as const), clienteId: d.clienteId, vendedorId: t(d.vendedorId), data: parseDia(d.data), validade: t(d.validade), prazoEntrega: dia(d.prazoEntrega),
    aosCuidados: t(d.aosCuidados), canal: d.canal, centroCusto: t(d.centroCusto), introducao: t(d.introducao),
    transportadoraId: t(d.transportadoraId), frete: D(tot.frete), mostrarEntrega: d.mostrarEntrega, enderecoEntregaId: d.mostrarEntrega ? t(d.enderecoEntregaId) : null,
    totalProdutos: D(tot.produtos), totalServicos: D(tot.servicos), desconto: D(tot.desconto), descontoPercentual: d.descontoPct ? new Prisma.Decimal(n(d.desconto)) : null,
    total: D(tot.total), exibirTotal: d.exibirTotal, gerarCondicoes: d.gerarCondicoes, condicao: d.condicao, formaPagamentoId: t(d.formaPagamentoId),
    intervaloDias: Math.trunc(n(d.intervaloDias)) || 30, observacoes: t(d.observacoes), observacaoInterna: t(d.observacaoInterna),
    camposExtras: (d.camposExtras ?? {}) as Prisma.InputJsonValue,
  };
  const filhos = {
    produtos: { create: produtos.map((l, i) => ({ ordem: i, produtoId: l.avulso ? avulsoId : l.produtoId, descricao: l.avulso ? l.nome.trim() : null, detalhes: t(l.detalhes), quantidade: new Prisma.Decimal(n(l.quantidade)), tipoValorId: t(l.tipoValorId), valorUnit: D(n(l.valorUnit)), desconto: D(descontoLinha(n(l.quantidade) * n(l.valorUnit), l.desconto, l.descontoPct)), subtotal: D(subtotalProduto(l)) })) },
    servicos: { create: servicos.map((l, i) => ({ ordem: i, servicoId: l.servicoId, detalhes: t(l.detalhes), quantidade: new Prisma.Decimal(n(l.quantidade)), valorUnit: D(n(l.valorUnit)), desconto: D(descontoLinha(n(l.quantidade) * n(l.valorUnit), l.desconto, l.descontoPct)), subtotal: D(subtotalServico(l)) })) },
    parcelas: { create: parcelas },
  };

  return prisma.$transaction(async (tx) => {
    const numeroInformado = Math.trunc(n(d.numero));
    if (id) {
      const atual = await tx.orcamento.findUniqueOrThrow({ where: { id } });
      const numero = numeroInformado > 0 ? numeroInformado : atual.numero;
      if (numero !== atual.numero && (await numeroEmUso(tx.orcamento, numero, atual.empresaId))) throw new OrcamentoError(`Já existe o orçamento nº ${numero}`);
      await tx.orcamentoItem.deleteMany({ where: { orcamentoId: id } });
      await tx.orcamentoServico.deleteMany({ where: { orcamentoId: id } });
      await tx.orcamentoParcela.deleteMany({ where: { orcamentoId: id } });
      const o = await tx.orcamento.update({ where: { id }, data: { ...dados, numero, ...(t(d.situacaoId) ? { situacaoId: d.situacaoId } : {}), ...filhos } });
      await tx.orcamentoHistorico.create({ data: { orcamentoId: id, descricao: "Orçamento alterado", usuarioNome: u.nome } });
      return o;
    }
    let numero = numeroInformado;
    if (numero > 0) {
      if (await numeroEmUso(tx.orcamento, numero)) throw new OrcamentoError(`Já existe o orçamento nº ${numero}`);
      await subirSequencia(tx, await chaveDoc("ORCAMENTO"), numero);
    } else {
      numero = await proximoDocLivre(tx, tx.orcamento, "ORCAMENTO");
    }
    const sit = t(d.situacaoId) ? await tx.situacaoOrcamento.findUniqueOrThrow({ where: { id: d.situacaoId } }) : await situacaoInicial();
    const o = await tx.orcamento.create({ data: { ...dados, numero, situacaoId: sit.id, criadoPorId: u.id, ...filhos } });
    await tx.orcamentoHistorico.create({ data: { orcamentoId: o.id, descricao: "O orçamento foi cadastrado no sistema", situacao: sit.nome, usuarioNome: u.nome } });
    return o;
  });
}

/** Próximo número (o campo Número do formulário mostra em cinza). */
export async function proximoNumeroOrcamento() {
  const [s, m] = await Promise.all([
    prisma.sequencia.findUnique({ where: { chave: await chaveDoc("ORCAMENTO") } }),
    prisma.orcamento.aggregate({ _max: { numero: true } }),
  ]);
  return Math.max(s?.valor ?? 0, m._max.numero ?? 0) + 1;
}

/** Troca a situação. Quem está num grupo bloqueado na situação atual não pode trocar. */
export async function alterarSituacaoOrcamento(id: string, situacaoId: string, u: Usuario, observacao?: string) {
  const o = await prisma.orcamento.findUniqueOrThrow({ where: { id }, include: { situacao: true } });
  if (u.papel && o.situacao.bloqueados.includes(u.papel)) throw new OrcamentoError(`Seu grupo não pode trocar a situação "${o.situacao.nome}"`);
  const nova = await prisma.situacaoOrcamento.findUniqueOrThrow({ where: { id: situacaoId } });
  if (nova.id === o.situacaoId) return { sugerirVenda: false, situacao: nova };
  await prisma.$transaction([
    prisma.orcamento.update({ where: { id }, data: { situacaoId } }),
    prisma.orcamentoHistorico.create({ data: { orcamentoId: id, descricao: t(observacao) ?? `Situação alterada de ${o.situacao.nome} para ${nova.nome}`, situacao: nova.nome, usuarioNome: u.nome } }),
  ]);
  return { sugerirVenda: nova.geraVenda && !o.vendaId && Number(o.totalProdutos) > 0, situacao: nova };
}

/** "Gerar cópia": mesmo conteúdo, número novo, data de hoje e situação inicial. */
export async function clonarOrcamento(id: string, u: Usuario) {
  const o = await prisma.orcamento.findUniqueOrThrow({ where: { id }, include: { produtos: true, servicos: true } });
  const sit = await situacaoInicial();
  return prisma.$transaction(async (tx) => {
    const numero = await proximoDocLivre(tx, tx.orcamento, "ORCAMENTO", o.empresaId);
    const { id: _i, numero: _n, token: _t, idLegado: _l, vendaId: _v, osId: _o, createdAt: _c, updatedAt: _u, situacaoId: _s, camposExtras, ...resto } = o;
    void _i; void _n; void _t; void _l; void _v; void _o; void _c; void _u; void _s;
    const { produtos, servicos, ...cab } = resto;
    const c = await tx.orcamento.create({
      data: {
        ...cab, numero, data: diaSP(), situacaoId: sit.id, criadoPorId: u.id, camposExtras: (camposExtras ?? undefined) as Prisma.InputJsonValue | undefined,
        produtos: { create: produtos.map(({ id: _x, orcamentoId: _y, ...p }) => { void _x; void _y; return p; }) },
        servicos: { create: servicos.map(({ id: _x, orcamentoId: _y, ...p }) => { void _x; void _y; return p; }) },
      },
    });
    await tx.orcamentoHistorico.create({ data: { orcamentoId: c.id, descricao: `Cópia do orçamento nº ${o.numero}`, situacao: sit.nome, usuarioNome: u.nome } });
    return c;
  });
}

export async function excluirOrcamento(id: string) {
  const o = await prisma.orcamento.findUniqueOrThrow({ where: { id }, select: { numero: true } });
  await prisma.$transaction([
    prisma.anexo.deleteMany({ where: { entidade: "ORCAMENTO", entidadeId: id } }),
    prisma.anotacao.deleteMany({ where: { entidade: "ORCAMENTO", entidadeId: id } }),
    prisma.orcamento.delete({ where: { id } }),
  ]);
  return { ok: true, mensagem: `Orçamento nº ${o.numero} excluído.` };
}

/** Valor unitário efetivo da linha (o desconto da linha entra no preço do pedido). */
const unitLiquido = (l: { quantidade: Prisma.Decimal; subtotal: Prisma.Decimal }) => Math.round((Number(l.subtotal) / Number(l.quantidade)) * 100) / 100;

/** Situação para onde vai o orçamento ao gerar venda/OS: a escolhida (se for de concretizar) ou a primeira que gera venda. */
async function situacaoConcretizado(situacaoId?: string) {
  const escolhida = situacaoId ? await prisma.situacaoOrcamento.findFirst({ where: { id: situacaoId, geraVenda: true } }) : null;
  return escolhida ?? prisma.situacaoOrcamento.findFirst({ where: { geraVenda: true }, orderBy: { ordem: "asc" } });
}

/** "Gerar venda": copia o orçamento inteiro para um pedido em aberto (reservando o estoque) e leva o orçamento para a situação que gera venda. */
export async function gerarVendaDoOrcamento(id: string, u: Usuario, situacaoId?: string) {
  const o = await prisma.orcamento.findUniqueOrThrow({
    where: { id },
    include: { produtos: { include: { produto: true }, orderBy: { ordem: "asc" } }, servicos: { include: { servico: true }, orderBy: { ordem: "asc" } }, parcelas: { orderBy: { numero: "asc" } } },
  });
  if (o.vendaId) throw new OrcamentoError("Este orçamento já gerou uma venda");
  if (!o.produtos.length && !o.servicos.length) throw new OrcamentoError("O orçamento não tem itens");
  const f = (x: Prisma.Decimal | number) => Number(x).toFixed(2).replace(".", ",");
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const hoje = diaSP(new Date()).toISOString().slice(0, 10);
  const aberta = await prisma.situacaoVendaConfig.findFirst({ where: { estoque: "RESERVAR" }, orderBy: { ordem: "asc" } });
  const venda = await salvarPedido({
    tipo: o.tipo, numero: "", clienteId: o.clienteId, clienteNome: "", data: hoje, validade: "", vendedorId: o.vendedorId ?? "",
    prazoEntrega: o.prazoEntrega ? iso(o.prazoEntrega) : "", aosCuidados: "", canal: o.canal, centroCusto: o.centroCusto ?? "", introducao: "", situacaoId: aberta?.id ?? "",
    produtos: o.produtos.map((i) => ({ produtoId: i.produtoId, avulso: !!i.descricao, nome: i.descricao ?? i.produto.nome, codigo: i.produto.codigo, unidade: i.produto.unidade, detalhes: i.detalhes ?? "", quantidade: String(Number(i.quantidade)), tipoValorId: i.tipoValorId ?? "", valorUnit: f(i.valorUnit), desconto: f(i.desconto), descontoPct: false })),
    servicos: o.servicos.map((i) => ({ servicoId: i.servicoId, nome: i.servico.nome, codigo: i.servico.codigo, detalhes: i.detalhes ?? "", quantidade: String(Number(i.quantidade)), valorUnit: f(i.valorUnit), desconto: f(i.desconto), descontoPct: false })),
    transportadoraId: o.transportadoraId ?? "", transportadoraNome: "", frete: f(o.frete), mostrarEntrega: o.mostrarEntrega, enderecoEntregaId: o.enderecoEntregaId ?? "",
    desconto: f(o.desconto), descontoPct: false, exibirTotal: true, gerarCondicoes: true,
    condicao: o.parcelas.length > 1 ? "PARCELADO" : "AVISTA", formaPagamentoId: o.formaPagamentoId ?? "", vencimento: o.parcelas[0] ? iso(o.parcelas[0].vencimento) : hoje,
    intervaloDias: String(o.intervaloDias), numParcelas: String(o.parcelas.length || 1), primeiraParcela: o.parcelas[0] ? iso(o.parcelas[0].vencimento) : hoje,
    parcelas: o.parcelas.length > 1 ? o.parcelas.map((p) => ({ vencimento: iso(p.vencimento), valor: f(p.valor), formaPagamentoId: p.formaPagamentoId ?? "", observacao: p.observacao ?? "" })) : [],
    observacoes: o.observacoes ?? "", observacaoInterna: o.observacaoInterna ?? "", camposExtras: {},
  }, u, undefined, { orcamentoNumero: o.numero });
  const vendaId = venda.id;
  const conc = await situacaoConcretizado(situacaoId);
  await prisma.$transaction([
    prisma.orcamento.update({ where: { id }, data: { vendaId, ...(conc ? { situacaoId: conc.id } : {}) } }),
    prisma.orcamentoHistorico.create({ data: { orcamentoId: id, descricao: `Gerada a venda nº ${venda.numero}`, situacao: conc?.nome, usuarioNome: u.nome } }),
  ]);
  return { vendaId, numero: venda.numero };
}

/** "Gerar OS": abre uma ordem de serviço com os produtos (reservados) e serviços do orçamento e leva o orçamento para a situação de concretizado. */
export async function gerarOsDoOrcamento(id: string, u: Usuario, situacaoId?: string) {
  const o = await prisma.orcamento.findUniqueOrThrow({ where: { id }, include: { produtos: { orderBy: { ordem: "asc" } }, servicos: { orderBy: { ordem: "asc" } } } });
  if (o.osId) throw new OrcamentoError("Este orçamento já gerou uma OS");
  if (!o.produtos.length && !o.servicos.length) throw new OrcamentoError("O orçamento não tem itens");
  const { osId } = await salvarOs({
    cabecalho: {
      clienteId: o.clienteId, vendedorId: o.vendedorId, previsao: o.prazoEntrega, canal: o.canal,
      observacoes: [o.observacoes, `Gerada do orçamento nº ${o.numero}`].filter(Boolean).join("\n"), observacaoInterna: o.observacaoInterna,
      desconto: Number(o.desconto), frete: Number(o.frete),
    },
    situacao: "ABERTA",
    produtos: o.produtos.map((l) => ({ produtoId: l.produtoId, quantidade: Number(l.quantidade), valorUnit: unitLiquido(l) })),
    servicos: o.servicos.map((l) => ({ servicoId: l.servicoId, quantidade: Number(l.quantidade), valorUnit: unitLiquido(l) })),
    usuarioId: u.id, permitirNegativo: true,
  });
  // item avulso segue avulso na OS (descrição na linha); a OS não conclui até trocar pelo produto cadastrado
  const avulsos = o.produtos.filter((l) => l.descricao);
  if (avulsos.length) {
    const naOs = await prisma.osItemProduto.findMany({ where: { osId, produtoId: avulsos[0].produtoId }, orderBy: [{ ordem: "asc" }, { createdAt: "asc" }, { id: "asc" }], select: { id: true } });
    for (const [i, it] of naOs.entries()) if (avulsos[i]) await prisma.osItemProduto.update({ where: { id: it.id }, data: { descricao: avulsos[i].descricao, detalhes: avulsos[i].detalhes } });
  }
  const os = await prisma.ordemServico.findUniqueOrThrow({ where: { id: osId }, select: { numero: true } });
  const conc = await situacaoConcretizado(situacaoId);
  await prisma.$transaction([
    prisma.orcamento.update({ where: { id }, data: { osId, ...(conc ? { situacaoId: conc.id } : {}) } }),
    prisma.orcamentoHistorico.create({ data: { orcamentoId: id, descricao: `Gerada a OS nº ${os.numero}`, situacao: conc?.nome, usuarioNome: u.nome } }),
  ]);
  return { osId, numero: os.numero };
}

export type ParamsOrcamentos = Record<string, string | undefined>;

/** Filtros da lista: período (pela data), busca simples e busca avançada. */
export async function whereOrcamentos(sp: ParamsOrcamentos): Promise<Prisma.OrcamentoWhereInput> {
  const and: Prisma.OrcamentoWhereInput[] = [];
  const buscando = Boolean(sp.q);
  const per = buscando ? null : periodoDia(sp.periodo, sp.pde, sp.pate);
  if (per) and.push({ data: { gte: per.de, lte: per.ate } });
  and.push(...cadaPalavra(sp.q, (p): Prisma.OrcamentoWhereInput[] => {
    const num = numeroPalavra(p), d = p.replace(/\D/g, "");
    return [...(num ? [{ numero: num }] : []), { cliente: { nome: contem(p) } }, { cliente: { fantasia: contem(p) } },
      ...(d.length >= 3 ? [{ cliente: { documento: { contains: d } } }] : [])];
  }));
  if (sp.loja) and.push({ empresaId: sp.loja });
  if (sp.codigo && Number(sp.codigo)) and.push({ numero: Number(sp.codigo) });
  if (sp.de) and.push({ data: { gte: parseDia(sp.de) } });
  if (sp.ate) and.push({ data: { lte: parseDia(sp.ate) } });
  if (sp.ede) and.push({ prazoEntrega: { gte: parseDia(sp.ede) } });
  if (sp.eate) and.push({ prazoEntrega: { lte: parseDia(sp.eate) } });
  if (sp.cli) and.push({ clienteId: sp.cli });
  if (sp.prod) and.push({ produtos: { some: { produtoId: sp.prod } } });
  if (sp.serv) and.push({ servicos: { some: { servicoId: sp.serv } } });
  if (sp.cc) and.push({ centroCusto: sp.cc });
  if (sp.s) and.push({ situacaoId: sp.s });
  else and.push({ situacao: { exibir: true } }); // situações ocultas só aparecem filtrando por elas
  return { AND: and };
}

export function ordemOrcamentos(o?: string): Prisma.OrcamentoOrderByWithRelationInput[] {
  const dir = o?.startsWith("-") ? "desc" : o ? "asc" : "desc";
  const c = o?.replace(/^-/, "");
  if (c === "cliente") return [{ cliente: { nome: dir } }];
  if (c === "data") return [{ data: dir }, { numero: dir }];
  if (c === "valor") return [{ total: dir }];
  if (c === "entrega") return [{ prazoEntrega: dir }];
  if (c === "numero") return [{ numero: dir }];
  return [{ data: dir }, { numero: dir }];
}
