import { centroPorNome } from "@/lib/financeiro/plano";
import { Prisma, type EstoqueSituacao, type PapelUsuario, type PrioridadeOs, type SituacaoOs, type SituacaoOsConfig } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { entrada } from "@/lib/estoque/estoque";
import { transicionarEstoque, type EstadoEstoque } from "@/lib/estoque/transicao";
import { cancelarRecebimentos } from "@/lib/financeiro/lancamentos";
import { categoria, garantirPadroes, receitaDocumento } from "@/lib/financeiro/padroes";
import { proximoNumero } from "@/lib/sequencia";
import { parseDia, periodoDia } from "@/lib/datas";
import { descontoLinha, lerNumero, subtotalProduto, subtotalServico } from "@/lib/orcamentos/tipos";
import { dataLocalSP, totaisOs, type DadosOs } from "@/lib/os/tipos";
import { estadoEstoque } from "@/lib/os/os";
import { cadaPalavra, contem, numeroPalavra } from "@/lib/busca/palavras";

/**
 * Ordem de serviço completa (padrão Gestão Click). A situação configurável decide o estoque
 * (reservar, lançar ou não lançar), o financeiro (parcelas em contas a receber) e se preenche a data de saída.
 */

type Usuario = { id: string; nome: string; papel?: PapelUsuario };
export class OsError extends Error {}

const t = (s: string | undefined | null) => (s ?? "").trim() || null;
const n = (s: string) => lerNumero(s) ?? 0;
const D = (v: number) => new Prisma.Decimal(v.toFixed(2));
const dia = (s: string) => (t(s) ? parseDia(s) : null);

export const estadoDe = (e: EstoqueSituacao): EstadoEstoque => (e === "LANCAR" ? "BAIXADO" : e === "RESERVAR" ? "RESERVADO" : "LIVRE");
/** A coluna antiga `situacao` continua sendo o "estado" usado pelo painel, notas e relatórios. */
export const enumDe = (s: Pick<SituacaoOsConfig, "estoque" | "financeiro" | "nome">): SituacaoOs =>
  s.estoque === "LANCAR" ? (s.financeiro ? "FATURADA" : "CONCLUIDA")
    : s.estoque === "RESERVAR" ? (/andamento/i.test(s.nome) ? "EM_ANDAMENTO" : "ABERTA")
    : /devolv/i.test(s.nome) ? "DEVOLVIDA_SEM_REPARO" : "CANCELADA";

export async function situacaoPadraoOs(tx: Tx | typeof prisma = prisma) {
  const s = (await tx.situacaoOsConfig.findFirst({ where: { padrao: true } })) ?? (await tx.situacaoOsConfig.findFirst({ orderBy: { ordem: "asc" } }));
  if (!s) throw new OsError("Cadastre ao menos uma situação de OS");
  return s;
}

async function travar(tx: Tx, osId: string) {
  const [o] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "OrdemServico" WHERE id = ${osId} FOR NO KEY UPDATE`;
  if (!o) throw new OsError("OS não encontrada");
  return tx.ordemServico.findUniqueOrThrow({ where: { id: osId }, include: { situacaoCfg: true } });
}

const itensDoc = (tx: Tx, osId: string) => async () =>
  (await tx.osItemProduto.findMany({ where: { osId } })).map((i) => ({ id: i.id, produtoId: i.produtoId, quantidade: Number(i.quantidade) }));

const estadoAtual = (o: { situacao: SituacaoOs; situacaoCfg: SituacaoOsConfig | null }) => (o.situacaoCfg ? estadoDe(o.situacaoCfg.estoque) : estadoEstoque(o.situacao));

/** OS migrada já concluída no Gestão Click (sem movimento aqui): ao sair do "lançado", devolve as peças. */
async function estadoEfetivo(tx: Tx, osId: string, estado: EstadoEstoque, usuarioId?: string): Promise<EstadoEstoque> {
  if (estado !== "BAIXADO") return estado;
  const o = await tx.ordemServico.findUniqueOrThrow({ where: { id: osId }, select: { idLegado: true, numero: true, produtos: { select: { produtoId: true, quantidade: true, custoUnit: true, produto: { select: { controlaEstoque: true, localPadraoId: true } } } } } });
  if (!o.idLegado) return estado;
  if (await tx.movimentoEstoque.count({ where: { origemTipo: "OS", origemId: osId } })) return estado;
  const local = (await tx.local.findFirst({ orderBy: { codigo: "asc" }, select: { id: true } }))?.id;
  for (const i of o.produtos) {
    const localId = i.produto.localPadraoId ?? local;
    if (!i.produto.controlaEstoque || !localId || !(Number(i.quantidade) > 0)) continue;
    await entrada(tx, { produtoId: i.produtoId, localId, quantidade: Number(i.quantidade), custoUnit: Number(i.custoUnit), origemTipo: "AJUSTE", origemId: osId, observacao: `OS ${o.numero} migrada do Gestão Click: peças voltam ao estoque`, usuarioId });
  }
  return "LIVRE";
}

/** Lança as parcelas da OS em contas a receber (pendentes). */
async function lancarFinanceiro(tx: Tx, osId: string) {
  const o = await tx.ordemServico.findUniqueOrThrow({ where: { id: osId }, include: { parcelas: { orderBy: { numero: "asc" } } } });
  if (!(Number(o.total) > 0)) return;
  await garantirPadroes(tx);
  const centro = await centroPorNome(tx, o.centroCusto);
  const rec = await receitaDocumento(tx, Number(o.totalProdutos), Number(o.totalServicos));
  const parcelas = o.parcelas.length ? o.parcelas : [{ numero: 1, vencimento: o.saida ?? o.entrada, valor: o.total, formaPagamentoId: o.formaPagamentoId }];
  for (const p of parcelas)
    await tx.lancamento.create({
      data: {
        tipo: "RECEBER", descricao: parcelas.length > 1 ? `OS de nº ${o.numero} (${p.numero}/${parcelas.length})` : `OS de nº ${o.numero}`,
        pessoaId: o.clienteId, categoriaId: rec.categoriaId, formaPagamentoId: p.formaPagamentoId ?? o.formaPagamentoId, valor: p.valor,
        vencimento: p.vencimento, competencia: o.saida ?? o.entrada, parcela: p.numero, totalParcelas: parcelas.length, origemTipo: "OS", origemId: o.id, centroCustoId: centro, empresaId: o.empresaId,
        rateio: { create: rec.rateio },
      },
    });
}

/** Passagem de uma situação para outra: estoque, financeiro e data de saída. */
async function aplicar(tx: Tx, osId: string, de: EstadoEstoque, para: SituacaoOsConfig,
  opts: { refazerItens?: () => Promise<void>; refazerFinanceiro?: boolean; permitirNegativo?: boolean; forcar?: boolean; usuarioId?: string }) {
  const temLanc = (await tx.lancamento.count({ where: { origemTipo: "OS", origemId: osId } })) > 0;
  if (temLanc && (!para.financeiro || opts.refazerFinanceiro)) await cancelarRecebimentos(tx, "OS", osId, opts.forcar);
  const novo = estadoDe(para.estoque);
  if (opts.refazerItens || novo !== de) de = await estadoEfetivo(tx, osId, de, opts.usuarioId);
  if (opts.refazerItens) {
    await transicionarEstoque(tx, "OS", osId, de, "LIVRE", itensDoc(tx, osId), opts);
    await opts.refazerItens();
    await transicionarEstoque(tx, "OS", osId, "LIVRE", novo, itensDoc(tx, osId), opts);
  } else {
    await transicionarEstoque(tx, "OS", osId, de, novo, itensDoc(tx, osId), opts);
  }
  const atual = await tx.ordemServico.findUniqueOrThrow({ where: { id: osId }, select: { saida: true } });
  await tx.ordemServico.update({ where: { id: osId }, data: { situacaoId: para.id, situacao: enumDe(para), ...(para.preencherSaida && !atual.saida ? { saida: new Date() } : {}) } });
  const aindaTem = (await tx.lancamento.count({ where: { origemTipo: "OS", origemId: osId } })) > 0;
  if (para.financeiro && !aindaTem) await lancarFinanceiro(tx, osId);
}

/**
 * O formulário regrava os itens da OS; para não perder o que o técnico marcou (quem lançou, instalado e as fotos),
 * cada linha nova herda as marcas da linha antiga com o mesmo id ou, sem id, do mesmo produto/serviço.
 */
async function marcasDosItens(tx: Tx, tipo: "produto" | "servico", osId: string) {
  const sel = { id: true, criadoPorId: true, instalado: true, instaladoEm: true, instaladoPorId: true } as const;
  const antigos = tipo === "produto"
    ? (await tx.osItemProduto.findMany({ where: { osId }, select: { ...sel, produtoId: true }, orderBy: [{ ordem: "asc" }, { createdAt: "asc" }] })).map(({ produtoId, ...r }) => ({ ...r, itemId: produtoId }))
    : (await tx.osItemServico.findMany({ where: { osId }, select: { ...sel, servicoId: true }, orderBy: [{ ordem: "asc" }, { createdAt: "asc" }] })).map(({ servicoId, ...r }) => ({ ...r, itemId: servicoId }));
  const usados = new Set<string>();
  return (linhaId: string | undefined, itemId: string) => {
    const a = antigos.find((x) => !usados.has(x.id) && x.id === linhaId) ?? antigos.find((x) => !usados.has(x.id) && x.itemId === itemId);
    if (!a) return null;
    usados.add(a.id);
    return { id: a.id, marcas: { criadoPorId: a.criadoPorId, instalado: a.instalado, instaladoEm: a.instaladoEm, instaladoPorId: a.instaladoPorId } };
  };
}

const moverFotos = (tx: Tx, osId: string, de: string, para: string) =>
  de === para ? null : tx.anexo.updateMany({ where: { entidade: "OS_FOTO", entidadeId: osId, referencia: de }, data: { referencia: para } });

export async function proximoNumeroOs() {
  const [s, m] = await Promise.all([prisma.sequencia.findUnique({ where: { chave: "OS" } }), prisma.ordemServico.aggregate({ _max: { numero: true } })]);
  return Math.max(s?.valor ?? 0, m._max.numero ?? 0) + 1;
}

/** Cadastra ou altera a OS inteira (todos os blocos do formulário), numa transação. */
export async function salvarOrdem(d: DadosOs, u: Usuario, id?: string, opts: { permitirNegativo?: boolean; forcar?: boolean } = {}) {
  if (!t(d.clienteId)) throw new OsError("Informe o cliente");
  const entradaEm = dataLocalSP(d.entrada);
  if (!entradaEm) throw new OsError("Informe a data de entrada");
  const saidaEm = dataLocalSP(d.saida);
  if (saidaEm && saidaEm < entradaEm) throw new OsError("A saída não pode ser antes da entrada");
  if (!t(d.canal)) throw new OsError("Informe o canal de venda");
  const equipamentos = d.equipamentos.filter((e) => Object.values(e).some((v) => v.trim()));
  for (const [i, e] of equipamentos.entries()) if (!e.equipamento.trim()) throw new OsError(`Informe o nome do equipamento ${i + 1}`);
  const produtos = d.produtos.filter((l) => l.produtoId);
  const servicos = d.servicos.filter((l) => l.servicoId);
  for (const l of [...produtos, ...servicos]) if (!(n(l.quantidade) > 0)) throw new OsError(`Informe a quantidade de ${l.nome || "todos os itens"}`);
  const tot = totaisOs({ ...d, produtos, servicos });
  if (tot.total < 0) throw new OsError("O desconto é maior que o valor da OS");

  let parcelas: { numero: number; vencimento: Date; valor: Prisma.Decimal; formaPagamentoId: string | null; observacao: string | null }[];
  if (d.condicao === "PARCELADO") {
    if (!d.parcelas.length) throw new OsError("Clique em Gerar parcelas");
    const soma = d.parcelas.reduce((s, p) => s + n(p.valor), 0);
    if (Math.abs(soma - tot.total) > 0.009) throw new OsError(`A soma das parcelas (${soma.toFixed(2)}) não fecha com o total (${tot.total.toFixed(2)}). Gere as parcelas de novo.`);
    parcelas = d.parcelas.map((p, i) => {
      if (!t(p.vencimento)) throw new OsError(`Informe o vencimento da parcela ${i + 1}`);
      return { numero: i + 1, vencimento: parseDia(p.vencimento), valor: D(n(p.valor)), formaPagamentoId: t(p.formaPagamentoId) ?? t(d.formaPagamentoId), observacao: t(p.observacao) };
    });
  } else {
    const venc = dia(d.vencimento) ?? (saidaEm ? parseDia(saidaEm.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })) : parseDia(d.entrada.slice(0, 10)));
    parcelas = [{ numero: 1, vencimento: venc, valor: D(tot.total), formaPagamentoId: t(d.formaPagamentoId), observacao: null }];
  }
  const prioridades = ["BAIXA", "MEDIA", "ALTA", "URGENTE", "MUITO_URGENTE"];
  const tecnicoIds = [...new Set(d.tecnicoIds.filter(Boolean))];

  const dados = {
    clienteId: d.clienteId, vendedorId: t(d.vendedorId), tecnicoId: tecnicoIds[0] ?? null, tecnicoIds, equipeId: t(d.equipeId),
    entrada: entradaEm, saida: saidaEm, previsao: saidaEm, prioridade: prioridades.includes(d.prioridade) ? (d.prioridade as PrioridadeOs) : null,
    canal: d.canal, centroCusto: t(d.centroCusto), transportadoraId: t(d.transportadoraId), frete: D(tot.frete), outros: D(tot.outros),
    mostrarEntrega: d.mostrarEntrega, enderecoEntregaId: d.mostrarEntrega ? t(d.enderecoEntregaId) : null,
    totalProdutos: D(tot.produtos), totalServicos: D(tot.servicos), desconto: D(tot.desconto), descontoPercentual: d.descontoPct ? new Prisma.Decimal(n(d.desconto)) : null,
    total: D(tot.total), exibirTotal: d.exibirTotal, condicao: d.condicao, formaPagamentoId: t(d.formaPagamentoId), intervaloDias: Math.trunc(n(d.intervaloDias)) || 30,
    observacoes: t(d.observacoes), observacaoInterna: t(d.observacaoInterna), camposExtras: (d.camposExtras ?? {}) as Prisma.InputJsonValue,
  };
  const assinaturaItens = (l: { produtoId: string; quantidade: number }[]) => l.map((x) => `${x.produtoId}:${x.quantidade}`).sort().join("|");
  const novosItens = produtos.map((l) => ({ produtoId: l.produtoId, quantidade: n(l.quantidade) }));
  const assinaturaFin = (total: number, ps: { vencimento: Date; valor: Prisma.Decimal; formaPagamentoId: string | null }[]) =>
    `${total.toFixed(2)}#${ps.map((p) => `${p.vencimento.toISOString().slice(0, 10)}:${Number(p.valor).toFixed(2)}:${p.formaPagamentoId ?? ""}`).join("|")}`;

  return prisma.$transaction(async (tx) => {
    const custos = new Map((await tx.produto.findMany({ where: { id: { in: produtos.map((p) => p.produtoId) } }, select: { id: true, custo: true } })).map((p) => [p.id, p.custo]));
    const criarItens = async (osId: string) => {
      const casar = await marcasDosItens(tx, "produto", osId);
      await tx.osItemProduto.deleteMany({ where: { osId } });
      for (const [i, l] of produtos.entries()) {
        const antigo = casar(l.id, l.produtoId);
        const novo = await tx.osItemProduto.create({ data: { osId, ordem: i, produtoId: l.produtoId, detalhes: t(l.detalhes), quantidade: new Prisma.Decimal(n(l.quantidade)), tipoValorId: t(l.tipoValorId), valorUnit: D(n(l.valorUnit)), custoUnit: custos.get(l.produtoId) ?? 0, desconto: D(descontoLinha(n(l.quantidade) * n(l.valorUnit), l.desconto, l.descontoPct)), subtotal: D(subtotalProduto(l)), ...antigo?.marcas } });
        if (antigo) await moverFotos(tx, osId, antigo.id, novo.id);
      }
    };
    const criarServicos = async (osId: string) => {
      const casar = await marcasDosItens(tx, "servico", osId);
      await tx.osItemServico.deleteMany({ where: { osId } });
      for (const [i, l] of servicos.entries()) {
        const antigo = casar(l.id, l.servicoId);
        const novo = await tx.osItemServico.create({ data: { osId, ordem: i, servicoId: l.servicoId, detalhes: t(l.detalhes), quantidade: new Prisma.Decimal(n(l.quantidade)), valorUnit: D(n(l.valorUnit)), desconto: D(descontoLinha(n(l.quantidade) * n(l.valorUnit), l.desconto, l.descontoPct)), subtotal: D(subtotalServico(l)), ...antigo?.marcas } });
        if (antigo) await moverFotos(tx, osId, antigo.id, novo.id);
      }
    };
    const criarEquipamentos = async (osId: string) => {
      await tx.osEquipamento.deleteMany({ where: { osId } });
      await tx.osEquipamento.createMany({ data: equipamentos.map((e, i) => ({ osId, ordem: i + 1, equipamento: e.equipamento.trim(), marca: t(e.marca), modelo: t(e.modelo), serie: t(e.serie), condicoes: t(e.condicoes), defeitos: t(e.defeitos), acessorios: t(e.acessorios), solucao: t(e.solucao), laudo: t(e.laudo), garantia: t(e.garantia) })) });
    };
    const para = t(d.situacaoId) ? await tx.situacaoOsConfig.findUniqueOrThrow({ where: { id: d.situacaoId } }) : await situacaoPadraoOs(tx);
    const numeroInformado = Math.trunc(n(d.numero));

    if (id) {
      const atual = await travar(tx, id);
      if (atual.situacaoCfg && !atual.situacaoCfg.permiteEdicao) throw new OsError(`OS na situação "${atual.situacaoCfg.nome}" não podem ser editadas`);
      if (u.papel && atual.situacaoCfg?.bloqueados.includes(u.papel) && atual.situacaoId !== para.id) throw new OsError(`Seu grupo não pode trocar a situação "${atual.situacaoCfg.nome}"`);
      const numero = numeroInformado > 0 ? numeroInformado : atual.numero;
      if (numero !== atual.numero && (await tx.ordemServico.findUnique({ where: { numero } }))) throw new OsError(`Já existe a OS nº ${numero}`);
      const existentes = await tx.osItemProduto.findMany({ where: { osId: id } });
      const antigas = await tx.osParcela.findMany({ where: { osId: id }, orderBy: { numero: "asc" } });
      const mudouItens = assinaturaItens(existentes.map((e) => ({ produtoId: e.produtoId, quantidade: Number(e.quantidade) }))) !== assinaturaItens(novosItens);
      const mudouFin = assinaturaFin(Number(atual.total), antigas) !== assinaturaFin(tot.total, parcelas);
      await tx.ordemServico.update({ where: { id }, data: { ...dados, numero } });
      await tx.osParcela.deleteMany({ where: { osId: id } });
      await tx.osParcela.createMany({ data: parcelas.map((p) => ({ ...p, osId: id })) });
      await criarServicos(id);
      await criarEquipamentos(id);
      if (mudouItens) await aplicar(tx, id, estadoAtual(atual), para, { ...opts, usuarioId: u.id, refazerFinanceiro: mudouFin, refazerItens: () => criarItens(id) });
      else {
        // mesmos produtos e quantidades: troca valores sem mexer nas reservas/baixas
        const porProduto = new Map(existentes.map((e) => [e.produtoId, e]));
        for (const [i, l] of produtos.entries()) {
          const e = porProduto.get(l.produtoId);
          if (e) await tx.osItemProduto.update({ where: { id: e.id }, data: { ordem: i, detalhes: t(l.detalhes), tipoValorId: t(l.tipoValorId), valorUnit: D(n(l.valorUnit)), desconto: D(descontoLinha(n(l.quantidade) * n(l.valorUnit), l.desconto, l.descontoPct)), subtotal: D(subtotalProduto(l)) } });
        }
        await aplicar(tx, id, estadoAtual(atual), para, { ...opts, usuarioId: u.id, refazerFinanceiro: mudouFin });
      }
      await tx.osHistorico.create({ data: { osId: id, descricao: atual.situacaoId !== para.id ? `OS alterada e levada para "${para.nome}"` : "OS alterada", situacao: para.nome, usuarioNome: u.nome, usuarioId: u.id } });
      return tx.ordemServico.findUniqueOrThrow({ where: { id } });
    }

    let numero = numeroInformado;
    if (numero > 0) {
      if (await tx.ordemServico.findUnique({ where: { numero } })) throw new OsError(`Já existe a OS nº ${numero}`);
      await tx.$executeRaw`INSERT INTO "Sequencia" (chave, valor) VALUES ('OS', ${numero}) ON CONFLICT (chave) DO UPDATE SET valor = GREATEST("Sequencia".valor, ${numero})`;
    } else {
      do numero = await proximoNumero(tx, "OS"); while (await tx.ordemServico.findUnique({ where: { numero } }));
    }
    const o = await tx.ordemServico.create({ data: { ...dados, numero, situacao: "CANCELADA", situacaoId: para.id, criadoPorId: u.id, parcelas: { create: parcelas } } });
    await criarItens(o.id);
    await criarServicos(o.id);
    await criarEquipamentos(o.id);
    await aplicar(tx, o.id, "LIVRE", para, { ...opts, usuarioId: u.id });
    await tx.osHistorico.create({ data: { osId: o.id, descricao: "A ordem de serviço foi cadastrada no sistema", situacao: para.nome, usuarioNome: u.nome, usuarioId: u.id } });
    return tx.ordemServico.findUniqueOrThrow({ where: { id: o.id } });
  }, { timeout: 30000 });
}

/** Troca a situação (estoque, financeiro e data de saída seguem a nova situação). */
export async function alterarSituacaoOrdem(id: string, situacaoId: string, u: Usuario, opts: { observacao?: string; forcar?: boolean; permitirNegativo?: boolean } = {}) {
  return prisma.$transaction(async (tx) => {
    const o = await travar(tx, id);
    if (u.papel && o.situacaoCfg?.bloqueados.includes(u.papel)) throw new OsError(`Seu grupo não pode trocar a situação "${o.situacaoCfg.nome}"`);
    const para = await tx.situacaoOsConfig.findUniqueOrThrow({ where: { id: situacaoId } });
    if (o.situacaoId === para.id) return { para };
    await aplicar(tx, id, estadoAtual(o), para, { ...opts, usuarioId: u.id });
    await tx.osHistorico.create({ data: { osId: id, descricao: opts.observacao?.trim() || `Situação alterada para "${para.nome}"`, situacao: para.nome, usuarioNome: u.nome, usuarioId: u.id } });
    return { para };
  }, { timeout: 30000 });
}

/** Excluir: devolve o estoque, apaga as contas a receber em aberto e a OS. */
export async function excluirOrdem(id: string, opts: { forcar?: boolean } = {}) {
  return prisma.$transaction(async (tx) => {
    const o = await travar(tx, id);
    const notas = await tx.notaFiscal.count({ where: { origemTipo: "OS", origemId: id, status: { in: ["AUTORIZADA", "ENVIADA"] } } });
    if (notas) throw new OsError("A OS tem nota fiscal autorizada: cancele a nota antes");
    await cancelarRecebimentos(tx, "OS", id, opts.forcar);
    await transicionarEstoque(tx, "OS", id, await estadoEfetivo(tx, id, estadoAtual(o)), "LIVRE", itensDoc(tx, id));
    await tx.anexo.deleteMany({ where: { entidade: { in: ["OS", "OS_FOTO"] }, entidadeId: id } });
    await tx.anotacao.deleteMany({ where: { entidade: "OS", entidadeId: id } });
    await tx.orcamento.updateMany({ where: { osId: id }, data: { osId: null } });
    await tx.ordemServico.delete({ where: { id } });
    return o.numero;
  }, { timeout: 30000 });
}

/** "Gerar cópia": nova OS com os mesmos equipamentos e itens, na situação padrão. */
export async function clonarOrdem(id: string, u: Usuario) {
  const o = await prisma.ordemServico.findUniqueOrThrow({ where: { id }, include: { produtos: { include: { produto: true }, orderBy: { ordem: "asc" } }, servicos: { include: { servico: true }, orderBy: { ordem: "asc" } }, equipamentos: { orderBy: { ordem: "asc" } } } });
  const agora = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 16);
  const f = (x: Prisma.Decimal | number) => Number(x).toFixed(2).replace(".", ",");
  return salvarOrdem({
    tipo: "SERVICO", numero: "", clienteId: o.clienteId, clienteNome: "", data: agora.slice(0, 10), validade: "", vendedorId: o.vendedorId ?? "",
    prazoEntrega: "", aosCuidados: "", canal: o.canal, centroCusto: o.centroCusto ?? "", introducao: "", situacaoId: "",
    produtos: o.produtos.map((i) => ({ produtoId: i.produtoId, nome: i.produto.nome, codigo: i.produto.codigo, unidade: i.produto.unidade, detalhes: i.detalhes ?? "", quantidade: String(Number(i.quantidade)), tipoValorId: i.tipoValorId ?? "", valorUnit: f(i.valorUnit), desconto: f(i.desconto), descontoPct: false })),
    servicos: o.servicos.map((i) => ({ servicoId: i.servicoId, nome: i.servico.nome, codigo: i.servico.codigo, detalhes: i.detalhes ?? "", quantidade: String(Number(i.quantidade)), valorUnit: f(i.valorUnit), desconto: f(i.desconto), descontoPct: false })),
    transportadoraId: o.transportadoraId ?? "", transportadoraNome: "", frete: f(o.frete), mostrarEntrega: o.mostrarEntrega, enderecoEntregaId: o.enderecoEntregaId ?? "",
    desconto: f(o.desconto), descontoPct: false, exibirTotal: o.exibirTotal, gerarCondicoes: true, condicao: "AVISTA", formaPagamentoId: o.formaPagamentoId ?? "", vencimento: "",
    intervaloDias: String(o.intervaloDias), numParcelas: "1", primeiraParcela: "", parcelas: [], observacoes: o.observacoes ?? "", observacaoInterna: o.observacaoInterna ?? "",
    camposExtras: (o.camposExtras ?? {}) as Record<string, string>,
    entrada: agora, saida: "", prioridade: o.prioridade ?? "", tecnicoIds: o.tecnicoIds, equipeId: o.equipeId ?? "", outros: f(o.outros),
    equipamentos: o.equipamentos.map((e) => ({ equipamento: e.equipamento, marca: e.marca ?? "", modelo: e.modelo ?? "", serie: e.serie ?? "", condicoes: e.condicoes ?? "", defeitos: e.defeitos ?? "", acessorios: e.acessorios ?? "", solucao: "", laudo: "", garantia: e.garantia ?? "" })),
  }, u);
}

// ---------- lista

export type ParamsOs = Record<string, string | undefined>;

/** Filtros da lista e do kanban: período (pela entrada), busca simples e busca avançada do Gestão Click. */
export function whereOrdens(sp: ParamsOs): Prisma.OrdemServicoWhereInput {
  const w: Prisma.OrdemServicoWhereInput[] = [];
  const buscando = !!(sp.s === "abertas" || sp.q || sp.codigo || sp.de || sp.ate || sp.sde || sp.sate || sp.cli || sp.eq || sp.marca || sp.modelo || sp.serie);
  const per = buscando && !sp.periodo ? null : periodoDia(sp.periodo, sp.pde, sp.pate);
  const H = 3 * 3600_000;
  if (per) w.push({ entrada: { gte: new Date(per.de.getTime() + H), lt: new Date(per.ate.getTime() + 86400_000 + H) } });
  const ini = (s: string) => new Date(`${s}T00:00:00-03:00`), fim = (s: string) => new Date(`${s}T23:59:59.999-03:00`);
  // cada palavra em qualquer ordem: nº da OS, cliente, equipamento (nome, marca, modelo, série)
  w.push(...cadaPalavra(sp.q, (p): Prisma.OrdemServicoWhereInput[] => {
    const num = numeroPalavra(p), d = p.replace(/\D/g, "");
    return [...(num ? [{ numero: num }] : []), { cliente: { nome: contem(p) } }, { cliente: { fantasia: contem(p) } },
      ...(d.length >= 3 ? [{ cliente: { documento: { contains: d } } }] : []),
      { equipamentos: { some: { OR: [{ equipamento: contem(p) }, { marca: contem(p) }, { modelo: contem(p) }, { serie: contem(p) }] } } }];
  }));
  if (sp.codigo) w.push({ numero: Number(sp.codigo) || -1 });
  if (sp.de || sp.ate) w.push({ entrada: { ...(sp.de ? { gte: ini(sp.de) } : {}), ...(sp.ate ? { lte: fim(sp.ate) } : {}) } });
  if (sp.sde || sp.sate) w.push({ saida: { ...(sp.sde ? { gte: ini(sp.sde) } : {}), ...(sp.sate ? { lte: fim(sp.sate) } : {}) } });
  if (sp.cli) w.push({ clienteId: sp.cli });
  if (sp.pri) w.push({ prioridade: sp.pri as PrioridadeOs });
  for (const [k, campo] of [["eq", "equipamento"], ["marca", "marca"], ["modelo", "modelo"], ["serie", "serie"]] as const)
    if (sp[k]) w.push({ equipamentos: { some: { [campo]: { contains: sp[k], mode: "insensitive" } } } });
  if (sp.prod) w.push({ produtos: { some: { produtoId: sp.prod } } });
  if (sp.serv) w.push({ servicos: { some: { servicoId: sp.serv } } });
  if (sp.vend) w.push({ vendedorId: sp.vend });
  if (sp.tec) w.push({ tecnicoIds: { has: sp.tec } });
  if (sp.cc) w.push({ centroCusto: sp.cc });
  if (sp.s === "abertas") w.push({ situacao: { in: ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_PECA", "AGUARDANDO_APROVACAO"] } });
  else if (sp.s) w.push({ situacaoId: sp.s });
  else w.push({ OR: [{ situacaoId: null }, { situacaoCfg: { exibir: true } }] });
  return { AND: w };
}

export function ordemOrdens(o?: string): Prisma.OrdemServicoOrderByWithRelationInput[] {
  const dir = o?.startsWith("-") ? "desc" : o ? "asc" : "desc";
  const c = o?.replace(/^-/, "");
  if (c === "cliente") return [{ cliente: { nome: dir } }];
  if (c === "entrada") return [{ entrada: dir }];
  if (c === "saida") return [{ saida: dir }];
  if (c === "valor") return [{ total: dir }];
  if (c === "tecnico") return [{ tecnico: { nome: dir } }];
  if (c === "situacao") return [{ situacaoCfg: { nome: dir } }];
  return [{ numero: dir }];
}
