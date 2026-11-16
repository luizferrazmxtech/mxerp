import { Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { entrada, saida } from "@/lib/estoque/estoque";
import { mesmaUnidade, textoConversao } from "./unidades";
import { lerNumero } from "./tipos";

/**
 * Trocar a conversão de unidade de um produto depois de cadastrado (ex.: o cabo estava 1 CX = 1 MT e é 1 CX = 305 MT).
 * Recalcula o custo do produto e, se pedido, corrige as compras já lançadas (quantidade que entrou no estoque) e o custo
 * gravado nas vendas/OS que usaram o custo errado (margem e DRE).
 */

export type BaseCusto = "PROPORCIONAL" | "ULTIMA" | "MEDIA" | "MANTER";
export const BASES_CUSTO: [BaseCusto, string, string][] = [
  ["PROPORCIONAL", "Proporcional", "O custo da unidade de compra continua o mesmo; o custo por unidade de venda é dividido pelo novo fator."],
  ["ULTIMA", "Última compra", "Preço da última compra recebida ÷ novo fator."],
  ["MEDIA", "Média das compras", "Média ponderada de todas as compras recebidas, já convertidas."],
  ["MANTER", "Manter o custo", "Só troca a conversão; o custo do cadastro fica como está."],
];

export type DadosConversao = { unidadeCompra: string; fator: string; base: BaseCusto; corrigirCompras: boolean; corrigirLancados: boolean };
type Usuario = { id: string; nome: string };
export class ConversaoError extends Error {}

const num = (s: string) => lerNumero(s) ?? 0;
const fatorEfetivo = (p: { unidadeCompra: string | null; fatorConversao: Prisma.Decimal }) => (p.unidadeCompra ? Number(p.fatorConversao) : 1);

/** Compras recebidas do produto e se cada linha está na unidade de compra (a que a conversão corrige). */
async function linhasCompra(tx: Tx | typeof prisma, produtoId: string) {
  const p = await tx.produto.findUniqueOrThrow({ where: { id: produtoId }, select: { unidade: true, unidadeCompra: true, precoVenda: true } });
  const itens = await tx.compraItem.findMany({
    where: { produtoId, compra: { recebida: true, tipo: "PRODUTO" } },
    include: { compra: { select: { id: true, numero: true, data: true, fornecedor: { select: { nome: true } } } } },
    orderBy: [{ compra: { data: "asc" } }, { compra: { numero: "asc" } }],
  });
  return itens.map((i) => {
    const precoNota = Number(i.quantidade) > 0 ? Number(i.subtotal) / Number(i.quantidade) : Number(i.custoUnit);
    // linha na unidade de compra: marcada na própria compra, ou (compras antigas/migradas, sem unidade) preço da nota
    // acima do preço de venda por unidade, sinal de que foi uma caixa inteira e não um metro
    const naCompra = i.unidadeCompra ? !mesmaUnidade(i.unidadeCompra, p.unidade) : Number(p.precoVenda) > 0 && precoNota > Number(p.precoVenda);
    return { ...i, precoNota, naCompra };
  });
}

/** O que vai acontecer se trocar a conversão (para o modal mostrar antes de gravar). */
export async function simularConversao(produtoId: string, unidadeCompra: string, fatorTxt: string) {
  const p = await prisma.produto.findUniqueOrThrow({ where: { id: produtoId } });
  const un = unidadeCompra.trim().toUpperCase();
  const fn = un && !mesmaUnidade(un, p.unidade) ? num(fatorTxt) : 1;
  const fa = fatorEfetivo(p);
  const linhas = await linhasCompra(prisma, produtoId);
  const conv = linhas.map((l) => ({ ...l, fatorNovo: l.naCompra ? fn : 1 }));
  const custo = Number(p.custo);
  const ultima = conv.at(-1);
  const qtdTotal = conv.reduce((s, l) => s + Number(l.quantidade) * l.fatorNovo, 0);
  const valorTotal = conv.reduce((s, l) => s + Number(l.subtotal), 0);
  const opcoes: Record<BaseCusto, number | null> = {
    PROPORCIONAL: custo > 0 && fn > 0 ? (custo * fa) / fn : null,
    ULTIMA: ultima && fn > 0 ? ultima.precoNota / ultima.fatorNovo : null,
    MEDIA: qtdTotal > 0 ? valorTotal / qtdTotal : null,
    MANTER: custo,
  };
  const corrigir = conv.filter((l) => l.naCompra && Math.abs(Number(l.fator) - fn) > 1e-9);
  return {
    produto: { id: p.id, nome: p.nome, unidade: p.unidade, unidadeCompra: p.unidadeCompra, fator: fa, custo },
    fatorNovo: fn, opcoes,
    compras: corrigir.map((l) => ({ numero: l.compra.numero, data: l.compra.data, fornecedor: l.compra.fornecedor.nome, quantidade: Number(l.quantidade), fatorAntes: Number(l.fator), entraAntes: Number(l.quantidade) * Number(l.fator), entraDepois: Number(l.quantidade) * fn })),
  };
}

export async function alterarConversao(produtoId: string, d: DadosConversao, u: Usuario) {
  const un = d.unidadeCompra.trim().toUpperCase();
  const sem = !un;
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Produto" WHERE id = ${produtoId} FOR NO KEY UPDATE`;
    const p = await tx.produto.findUniqueOrThrow({ where: { id: produtoId } });
    if (!sem && mesmaUnidade(un, p.unidade)) throw new ConversaoError(`A unidade de compra precisa ser diferente da unidade de venda (${p.unidade})`);
    const fn = sem ? 1 : num(d.fator);
    if (!(fn > 0)) throw new ConversaoError(`Informe quantos ${p.unidade} vêm em 1 ${un}`);
    const fa = fatorEfetivo(p);
    const custoAntes = Number(p.custo);
    const linhas = await linhasCompra(tx, produtoId);
    const avisos: string[] = [];

    // 1) compras já lançadas: a linha passa a valer o novo fator; se a compra deu entrada no estoque, entra/sai a diferença
    let corrigidas = 0;
    if (d.corrigirCompras) {
      const localPadrao = p.localPadraoId ?? (await tx.local.findFirst({ orderBy: { codigo: "asc" }, select: { id: true } }))?.id;
      for (const l of linhas.filter((x) => x.naCompra && Math.abs(Number(x.fator) - fn) > 1e-9)) {
        const delta = Math.round(Number(l.quantidade) * (fn - Number(l.fator)) * 10000) / 10000;
        const lancou = await tx.movimentoEstoque.count({ where: { origemTipo: "COMPRA", origemId: l.compraId, produtoId, tipo: "ENTRADA" } });
        if (lancou && delta && p.controlaEstoque) {
          const localId = l.localId ?? localPadrao;
          if (!localId) throw new ConversaoError("Cadastre um local de estoque");
          const obs = `Conversão corrigida (${sem ? `1 ${p.unidade}` : textoConversao(un, fn, p.unidade)}) na compra nº ${l.compra.numero}`;
          const custoNovo = Number(l.subtotal) > 0 ? Number(l.subtotal) / (Number(l.quantidade) * fn) : undefined;
          if (delta > 0) await entrada(tx, { produtoId, localId, quantidade: delta, custoUnit: custoNovo, origemTipo: "COMPRA", origemId: l.compraId, observacao: obs, usuarioId: u.id });
          else await saida(tx, { produtoId, localId, quantidade: -delta, origemTipo: "COMPRA", origemId: l.compraId, observacao: obs, usuarioId: u.id });
          // as entradas antigas desta compra passam a mostrar o custo certo por unidade
          if (custoNovo) await tx.movimentoEstoque.updateMany({ where: { origemTipo: "COMPRA", origemId: l.compraId, produtoId, tipo: "ENTRADA" }, data: { custoUnit: custoNovo.toFixed(4) } });
        } else if (!lancou && delta) avisos.push(`Compra nº ${l.compra.numero} migrada do Gestão Click: só a conversão da linha foi corrigida (o saldo dela veio do backup).`);
        await tx.compraItem.update({ where: { id: l.id }, data: { fator: fn.toFixed(4), unidadeCompra: sem ? null : un } });
        await tx.compraHistorico.create({ data: { compraId: l.compraId, descricao: `Conversão de ${p.nome} corrigida para ${sem ? `1 ${p.unidade}` : textoConversao(un, fn, p.unidade)}${lancou && delta ? ` (${delta > 0 ? "+" : ""}${delta.toLocaleString("pt-BR")} ${p.unidade} no estoque)` : ""}`, usuarioNome: u.nome, usuarioId: u.id } });
        corrigidas++;
      }
    }

    // 2) custo do produto pela base escolhida
    let custo = custoAntes;
    const conv = linhas.map((l) => ({ ...l, f: l.naCompra ? fn : 1 }));
    if (d.base === "PROPORCIONAL" && custoAntes > 0) custo = (custoAntes * fa) / fn;
    if (d.base === "ULTIMA" && conv.length) custo = conv.at(-1)!.precoNota / conv.at(-1)!.f;
    if (d.base === "MEDIA") {
      const q = conv.reduce((s, l) => s + Number(l.quantidade) * l.f, 0);
      if (q > 0) custo = conv.reduce((s, l) => s + Number(l.subtotal), 0) / q;
    }
    if ((d.base === "ULTIMA" || d.base === "MEDIA") && !conv.length) avisos.push("Não há compras recebidas deste produto: o custo foi recalculado de forma proporcional.");
    if ((d.base === "ULTIMA" || d.base === "MEDIA") && !conv.length && custoAntes > 0) custo = (custoAntes * fa) / fn;
    custo = Math.round(custo * 10000) / 10000;

    await tx.produto.update({ where: { id: produtoId }, data: { unidadeCompra: sem ? null : un, fatorConversao: fn.toFixed(4), custo: custo.toFixed(4) } });
    const hist = [{ campo: `Conversão (${sem ? p.unidade : un} → ${p.unidade})`, anterior: fa, novo: fn }];
    if (Math.abs(custo - custoAntes) > 0.00005) hist.push({ campo: "Valor de custo", anterior: custoAntes, novo: custo });
    await tx.historicoValor.createMany({ data: hist.map((h) => ({ ...h, produtoId, usuarioId: u.id })) });

    // 3) custo gravado nas vendas/OS/movimentos com o custo antigo (margem e DRE)
    let lancados = 0;
    if (d.corrigirLancados && Math.abs(custo - custoAntes) > 0.00005) {
      const antigo = new Prisma.Decimal(custoAntes.toFixed(4)), novo = custo.toFixed(4);
      lancados = (await Promise.all([
        tx.osItemProduto.updateMany({ where: { produtoId, custoUnit: antigo }, data: { custoUnit: novo } }),
        tx.vendaItem.updateMany({ where: { produtoId, custoUnit: antigo }, data: { custoUnit: novo } }),
        tx.movimentoEstoque.updateMany({ where: { produtoId, custoUnit: antigo, origemTipo: { not: "COMPRA" } }, data: { custoUnit: novo } }),
      ])).reduce((s, x) => s + x.count, 0);
    }
    return { custoAntes, custo, fatorAntes: fa, fator: fn, corrigidas, lancados, avisos };
  }, { timeout: 60000 });
}
