import { Prisma, type PapelUsuario } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { liberarItem, reservarItem } from "@/lib/estoque/estoque";
import type { Alocacao } from "@/lib/estoque/alocacao";
import { estadoDe, OsError } from "@/lib/os/ordens";
import { estadoEstoque } from "@/lib/os/os";

/**
 * Tela do técnico (celular/tablet): o técnico vê as OS em que é técnico ou cuja equipe integra,
 * lança produtos e serviços, marca o que foi instalado e anexa fotos da instalação.
 *
 * Regras:
 *  - produto lançado aqui reserva no estoque na hora (mesmo motor da OS); só dá para lançar com a OS
 *    numa situação que reserva e permite edição;
 *  - o técnico só remove o que ele mesmo lançou e ainda não foi instalado (o resto é com o escritório);
 *  - ADMIN e GERENTE podem tudo em qualquer OS.
 */

export type UsuarioTecnico = { id: string; nome: string; papel: PapelUsuario };
const GERENCIA: PapelUsuario[] = ["ADMIN", "GERENTE"];
export const ehGerencia = (u: Pick<UsuarioTecnico, "papel">) => GERENCIA.includes(u.papel);

const D = (v: number) => new Prisma.Decimal(v.toFixed(2));
const arred = (v: number) => Math.round(v * 100) / 100;

/** Filtro "OS deste técnico": técnico principal, um dos técnicos ou membro da equipe da OS. */
export async function whereDoTecnico(usuarioId: string): Promise<Prisma.OrdemServicoWhereInput> {
  const equipes = (await prisma.equipe.findMany({ where: { membros: { has: usuarioId } }, select: { id: true } })).map((e) => e.id);
  return { OR: [{ tecnicoId: usuarioId }, { tecnicoIds: { has: usuarioId } }, ...(equipes.length ? [{ equipeId: { in: equipes } }] : [])] };
}

/** OS abertas (que ainda reservam peças) primeiro; com ?todas também as concluídas dos últimos 30 dias. */
export async function osDoTecnico(u: UsuarioTecnico, opts: { tecnicoId?: string; todas?: boolean; q?: string } = {}) {
  const alvo = ehGerencia(u) ? opts.tecnicoId : u.id;
  const filtros: Prisma.OrdemServicoWhereInput[] = [];
  if (alvo) filtros.push(await whereDoTecnico(alvo));
  if (opts.todas) filtros.push({ OR: [{ situacao: { in: ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_PECA", "AGUARDANDO_APROVACAO"] } }, { updatedAt: { gte: new Date(Date.now() - 30 * 86400_000) } }] });
  else filtros.push({ situacao: { in: ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_PECA", "AGUARDANDO_APROVACAO"] } });
  const q = opts.q?.trim();
  if (q) {
    const num = Number(q.replace(/\D/g, ""));
    filtros.push({ OR: [...(num ? [{ numero: num }] : []), { cliente: { nome: { contains: q, mode: "insensitive" } } }, { equipamentos: { some: { equipamento: { contains: q, mode: "insensitive" } } } }] });
  }
  return prisma.ordemServico.findMany({
    where: { AND: filtros },
    orderBy: [{ prioridade: { sort: "desc", nulls: "last" } }, { entrada: "asc" }],
    take: 200,
    select: {
      id: true, numero: true, entrada: true, previsao: true, prioridade: true, situacao: true,
      situacaoCfg: { select: { nome: true, cor: true } },
      cliente: { select: { nome: true, celular: true, telefone: true, cidade: true, bairro: true, logradouro: true, numero: true } },
      equipe: { select: { nome: true } },
      equipamentos: { select: { equipamento: true, marca: true, modelo: true }, orderBy: { ordem: "asc" }, take: 2 },
      produtos: { select: { instalado: true } },
      servicos: { select: { instalado: true } },
    },
  });
}

/** O usuário pode mexer nesta OS pela tela do técnico? */
export async function podeMexerNaOs(tx: Tx | typeof prisma, u: UsuarioTecnico, osId: string) {
  if (ehGerencia(u)) return true;
  return (await tx.ordemServico.count({ where: { AND: [{ id: osId }, await whereDoTecnico(u.id)] } })) > 0;
}

async function exigirOs(tx: Tx, u: UsuarioTecnico, osId: string) {
  const [o] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "OrdemServico" WHERE id = ${osId} FOR NO KEY UPDATE`;
  if (!o) throw new OsError("OS não encontrada");
  if (!(await podeMexerNaOs(tx, u, osId))) throw new OsError("Você não é técnico desta OS nem da equipe dela");
  return tx.ordemServico.findUniqueOrThrow({ where: { id: osId }, include: { situacaoCfg: true } });
}

/** Para lançar ou tirar itens: a OS tem que estar numa situação que reserva e permite edição. */
function exigirEditavel(o: { numero: number; situacao: Parameters<typeof estadoEstoque>[0]; situacaoCfg: { nome: string; estoque: Parameters<typeof estadoDe>[0]; permiteEdicao: boolean; financeiro: boolean } | null }) {
  const estado = o.situacaoCfg ? estadoDe(o.situacaoCfg.estoque) : estadoEstoque(o.situacao);
  if (estado === "BAIXADO") throw new OsError(`A OS nº ${o.numero} já foi concluída: peça ao escritório para reabrir`);
  if (estado === "LIVRE") throw new OsError(`A OS nº ${o.numero} está ${o.situacaoCfg?.nome.toLowerCase() ?? "cancelada"}`);
  if (o.situacaoCfg && !o.situacaoCfg.permiteEdicao) throw new OsError(`A OS nº ${o.numero} está em "${o.situacaoCfg.nome}", que não permite edição`);
  if (o.situacaoCfg?.financeiro) throw new OsError(`A OS nº ${o.numero} já lançou o financeiro: peça ao escritório para alterar`);
}

/**
 * Recalcula os totais depois de o técnico mexer nos itens. Desconto em % acompanha o novo valor;
 * parcelas: à vista vira o total, parcelado redistribui mantendo os vencimentos (a última leva os centavos).
 */
async function recalcular(tx: Tx, osId: string) {
  const [p, s, o, parcelas] = await Promise.all([
    tx.osItemProduto.aggregate({ where: { osId }, _sum: { subtotal: true } }),
    tx.osItemServico.aggregate({ where: { osId }, _sum: { subtotal: true } }),
    tx.ordemServico.findUniqueOrThrow({ where: { id: osId }, select: { desconto: true, descontoPercentual: true, frete: true, outros: true } }),
    tx.osParcela.findMany({ where: { osId }, orderBy: { numero: "asc" } }),
  ]);
  const tp = arred(Number(p._sum.subtotal ?? 0)), ts = arred(Number(s._sum.subtotal ?? 0));
  const desconto = o.descontoPercentual != null ? arred(((tp + ts) * Number(o.descontoPercentual)) / 100) : Number(o.desconto);
  const total = arred(tp + ts + Number(o.frete) + Number(o.outros) - desconto);
  await tx.ordemServico.update({ where: { id: osId }, data: { totalProdutos: D(tp), totalServicos: D(ts), desconto: D(desconto), total: D(total) } });
  if (parcelas.length) {
    const cada = Math.floor((total / parcelas.length) * 100) / 100;
    for (const [i, x] of parcelas.entries()) {
      const valor = i === parcelas.length - 1 ? arred(total - cada * (parcelas.length - 1)) : cada;
      await tx.osParcela.update({ where: { id: x.id }, data: { valor: D(valor) } });
    }
  }
}

const historico = (tx: Tx, osId: string, u: UsuarioTecnico, descricao: string) =>
  tx.osHistorico.create({ data: { osId, descricao, usuarioNome: u.nome, usuarioId: u.id } });

const qtdTxt = (q: number) => q.toLocaleString("pt-BR", { maximumFractionDigits: 4 });

/** Lança um produto (reserva no estoque e diz de onde pegar) ou um serviço na OS. */
export async function lancarItemTecnico(
  u: UsuarioTecnico,
  osId: string,
  item: { tipo: "produto" | "servico"; id: string; quantidade: number; detalhes?: string; instalado?: boolean },
): Promise<{ itemId: string; alocacoes: Alocacao[] }> {
  if (!(item.quantidade > 0)) throw new OsError("Informe a quantidade");
  return prisma.$transaction(async (tx) => {
    const o = await exigirOs(tx, u, osId);
    exigirEditavel(o);
    const ordem = 1 + Math.max(
      (await tx.osItemProduto.aggregate({ where: { osId }, _max: { ordem: true } }))._max.ordem ?? 0,
      (await tx.osItemServico.aggregate({ where: { osId }, _max: { ordem: true } }))._max.ordem ?? 0,
    );
    const marcas = { criadoPorId: u.id, detalhes: item.detalhes?.trim() || null, ...(item.instalado ? { instalado: true, instaladoEm: new Date(), instaladoPorId: u.id } : {}) };
    let itemId: string, alocacoes: Alocacao[] = [], nome: string;
    if (item.tipo === "produto") {
      const prod = await tx.produto.findUnique({ where: { id: item.id } });
      if (!prod?.ativo) throw new OsError("Produto não encontrado ou inativo");
      const valor = Number(prod.precoVenda);
      const criado = await tx.osItemProduto.create({
        data: { osId, ordem, produtoId: prod.id, quantidade: new Prisma.Decimal(item.quantidade), valorUnit: D(valor), custoUnit: prod.custo, subtotal: D(valor * item.quantidade), ...marcas },
      });
      itemId = criado.id;
      nome = prod.nome;
      alocacoes = await reservarItem(tx, { produtoId: prod.id, quantidade: item.quantidade, origemTipo: "OS", origemId: osId, origemItemId: criado.id });
    } else {
      const serv = await tx.servico.findUnique({ where: { id: item.id } });
      if (!serv?.ativo) throw new OsError("Serviço não encontrado ou inativo");
      const valor = Number(serv.preco);
      const criado = await tx.osItemServico.create({ data: { osId, ordem, servicoId: serv.id, quantidade: new Prisma.Decimal(item.quantidade), valorUnit: D(valor), subtotal: D(valor * item.quantidade), ...marcas } });
      itemId = criado.id;
      nome = serv.nome;
    }
    await recalcular(tx, osId);
    await historico(tx, osId, u, `Técnico lançou ${qtdTxt(item.quantidade)} × ${nome}${item.instalado ? " (instalado)" : ""}`);
    return { itemId, alocacoes };
  }, { timeout: 30000 });
}

/** Tira da OS um item que o próprio técnico lançou e ainda não foi instalado (devolve a reserva). */
export async function removerItemTecnico(u: UsuarioTecnico, osId: string, tipo: "produto" | "servico", itemId: string) {
  return prisma.$transaction(async (tx) => {
    const o = await exigirOs(tx, u, osId);
    exigirEditavel(o);
    const item = tipo === "produto"
      ? await tx.osItemProduto.findFirst({ where: { id: itemId, osId }, include: { produto: { select: { nome: true } } } })
      : await tx.osItemServico.findFirst({ where: { id: itemId, osId }, include: { servico: { select: { nome: true } } } });
    if (!item) throw new OsError("Item não encontrado nesta OS");
    if (!ehGerencia(u) && item.criadoPorId !== u.id) throw new OsError("Só dá para tirar itens que você mesmo lançou. Fale com o escritório.");
    if (!ehGerencia(u) && item.instalado) throw new OsError("Item já marcado como instalado: desmarque antes de tirar");
    if (tipo === "produto") {
      await liberarItem(tx, itemId);
      await tx.osItemProduto.delete({ where: { id: itemId } });
    } else await tx.osItemServico.delete({ where: { id: itemId } });
    await tx.anexo.updateMany({ where: { entidade: "OS_FOTO", entidadeId: osId, referencia: itemId }, data: { referencia: null } });
    await recalcular(tx, osId);
    const nome = "produto" in item ? item.produto.nome : item.servico.nome;
    await historico(tx, osId, u, `Técnico tirou ${qtdTxt(Number(item.quantidade))} × ${nome}`);
  }, { timeout: 30000 });
}

/** Marca ou desmarca "instalado" (produto) / "feito" (serviço). Vale em qualquer situação da OS. */
export async function marcarInstalado(u: UsuarioTecnico, osId: string, tipo: "produto" | "servico", itemId: string, instalado: boolean) {
  return prisma.$transaction(async (tx) => {
    await exigirOs(tx, u, osId);
    const data = instalado ? { instalado: true, instaladoEm: new Date(), instaladoPorId: u.id } : { instalado: false, instaladoEm: null, instaladoPorId: null };
    const r = tipo === "produto"
      ? await tx.osItemProduto.updateMany({ where: { id: itemId, osId }, data })
      : await tx.osItemServico.updateMany({ where: { id: itemId, osId }, data });
    if (!r.count) throw new OsError("Item não encontrado nesta OS");
    const nome = tipo === "produto"
      ? (await tx.osItemProduto.findUniqueOrThrow({ where: { id: itemId }, include: { produto: { select: { nome: true } } } })).produto.nome
      : (await tx.osItemServico.findUniqueOrThrow({ where: { id: itemId }, include: { servico: { select: { nome: true } } } })).servico.nome;
    await historico(tx, osId, u, instalado ? `${nome}: ${tipo === "produto" ? "instalado" : "feito"}` : `${nome}: desmarcado como ${tipo === "produto" ? "instalado" : "feito"}`);
  });
}

export const FOTO_MAX = 5 * 1024 * 1024;
const TIPOS_FOTO = /^image\/(jpeg|png|webp)$/;

/** Foto da instalação: vai para os anexos da OS (entidade OS_FOTO), ligada ao item quando informado. */
export async function anexarFoto(u: UsuarioTecnico, osId: string, foto: { nome: string; tipo: string; dados: Uint8Array<ArrayBuffer> }, itemId?: string | null) {
  if (!TIPOS_FOTO.test(foto.tipo)) throw new OsError("Envie uma foto (JPG, PNG ou WebP)");
  if (foto.dados.length > FOTO_MAX) throw new OsError("A foto passa de 5 MB");
  if (!foto.dados.length) throw new OsError("Foto vazia");
  return prisma.$transaction(async (tx) => {
    const o = await exigirOs(tx, u, osId);
    let legenda = "";
    if (itemId) {
      const p = await tx.osItemProduto.findFirst({ where: { id: itemId, osId }, include: { produto: { select: { nome: true } } } });
      const s = p ? null : await tx.osItemServico.findFirst({ where: { id: itemId, osId }, include: { servico: { select: { nome: true } } } });
      if (!p && !s) throw new OsError("Item não encontrado nesta OS");
      legenda = p?.produto.nome ?? s!.servico.nome;
    }
    const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(/[/:,\s]+/g, "-");
    const ext = foto.tipo === "image/png" ? "png" : foto.tipo === "image/webp" ? "webp" : "jpg";
    const nome = `OS${o.numero}-${legenda ? legenda.slice(0, 40).replace(/[^\p{L}\p{N}]+/gu, "-") + "-" : ""}${quando}.${ext}`;
    const a = await tx.anexo.create({ data: { entidade: "OS_FOTO", entidadeId: osId, referencia: itemId || null, nome, tipo: foto.tipo, tamanho: foto.dados.length, dados: foto.dados, usuarioId: u.id }, select: { id: true } });
    await historico(tx, osId, u, `Foto da instalação anexada${legenda ? ` (${legenda})` : ""}`);
    return a;
  });
}

/** Apaga uma foto: quem tirou ou a gerência. */
export async function excluirFoto(u: UsuarioTecnico, osId: string, anexoId: string) {
  return prisma.$transaction(async (tx) => {
    await exigirOs(tx, u, osId);
    const a = await tx.anexo.findFirst({ where: { id: anexoId, entidade: "OS_FOTO", entidadeId: osId } });
    if (!a) throw new OsError("Foto não encontrada");
    if (!ehGerencia(u) && a.usuarioId !== u.id) throw new OsError("Só quem tirou a foto pode apagar");
    await tx.anexo.delete({ where: { id: anexoId } });
    await historico(tx, osId, u, "Foto da instalação apagada");
  });
}

/** Anotação do técnico na OS (aparece na aba Anotações). */
export async function anotarTecnico(u: UsuarioTecnico, osId: string, texto: string) {
  const t = texto.trim();
  if (!t) throw new OsError("Escreva a anotação");
  if (!(await podeMexerNaOs(prisma, u, osId))) throw new OsError("Você não é técnico desta OS nem da equipe dela");
  await prisma.anotacao.create({ data: { entidade: "OS", entidadeId: osId, texto: t.slice(0, 4000), usuarioId: u.id } });
}
