import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { entrada } from "@/lib/estoque/estoque";
import { proximoNumero } from "@/lib/sequencia";
import { lerNumero, type DadosProduto } from "./tipos";

export * from "./tipos";

const t = (s: string | undefined | null) => (s ?? "").trim() || null;
const D = (v: number | null) => (v == null ? null : new Prisma.Decimal(v));

/** Próximo código interno numérico (botão "Gerar"): continua do maior código numérico existente. */
export async function gerarCodigoProduto() {
  const [{ max }] = await prisma.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(codigo::bigint)::int AS max FROM "Produto" WHERE codigo ~ '^[0-9]{1,9}$'`;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`INSERT INTO "Sequencia" (chave, valor) VALUES ('PRODUTO', ${max ?? 0})
      ON CONFLICT (chave) DO UPDATE SET valor = GREATEST("Sequencia".valor, EXCLUDED.valor)`;
    return String(await proximoNumero(tx, "PRODUTO"));
  });
}

/** Cria ou altera um produto com todas as abas do formulário. */
export async function salvarProduto(d: DadosProduto, usuarioId: string | null, id?: string) {
  if (!d.nome.trim()) throw new Error("Informe o nome do produto");
  if (!d.codigo.trim()) throw new Error("Informe o código interno");
  if (!d.unidade.trim()) throw new Error("Informe a unidade de medida");
  if (!d.lojas.length) throw new Error("Selecione ao menos uma loja");
  const fator = d.converte ? lerNumero(d.fatorConversao) : 1;
  if (d.converte && (!t(d.unidadeCompra) || !fator || fator <= 0)) throw new Error("Informe a unidade de compra e quantas unidades de venda ela tem");
  if (d.possuiComposicao && !d.componentes.some((c) => c.componenteId)) throw new Error("Adicione os componentes do produto");
  if (d.componentes.some((c) => c.componenteId === id)) throw new Error("O produto não pode ser componente dele mesmo");
  const codigo = d.codigo.trim();
  const outro = await prisma.produto.findUnique({ where: { codigo }, select: { id: true } });
  if (outro && outro.id !== id) throw new Error(`Já existe produto com o código ${codigo}`);
  if (t(d.gtin)) {
    const g = await prisma.produto.findFirst({ where: { gtin: d.gtin.trim(), NOT: id ? { id } : undefined }, select: { nome: true } });
    if (g) throw new Error(`O código de barras já está no produto ${g.nome}`);
  }
  const custo = lerNumero(d.custo) ?? 0;
  const tipos = await prisma.tipoValor.findMany();
  const valores = d.valores.filter((v) => v.tipoValorId && tipos.some((x) => x.id === v.tipoValorId));
  const padrao = valores.find((v) => tipos.find((x) => x.id === v.tipoValorId)?.padrao && v.ativo) ?? valores.find((v) => v.ativo);
  const precoVenda = lerNumero(padrao?.valor) ?? 0;

  const dados = {
    nome: d.nome.trim(), codigo, gtin: t(d.gtin), grupoId: t(d.grupoId),
    controlaEstoque: d.controlaEstoque && !d.possuiComposicao, emiteNota: d.emiteNota, possuiVariacoes: d.possuiVariacoes, possuiComposicao: d.possuiComposicao,
    unidade: d.unidade.trim().toUpperCase(), unidadeCompra: d.converte ? t(d.unidadeCompra)?.toUpperCase() ?? null : null, fatorConversao: D(fator ?? 1)!,
    ativo: d.ativo, vendidoSeparadamente: d.vendidoSeparadamente, vendePdv: d.vendePdv, comissao: D(lerNumero(d.comissao)),
    camposExtras: (d.camposExtras ?? {}) as Prisma.InputJsonValue,
    peso: D(lerNumero(d.peso)), largura: D(lerNumero(d.largura)), altura: D(lerNumero(d.altura)), comprimento: D(lerNumero(d.comprimento)), descricao: t(d.descricao),
    custo: D(custo)!, despesasAcessorias: D(lerNumero(d.despesasAcessorias) ?? 0)!, outrasDespesas: D(lerNumero(d.outrasDespesas) ?? 0)!, precoVenda: D(precoVenda)!,
    estoqueMinimo: D(lerNumero(d.estoqueMinimo) ?? 0)!, estoqueMaximo: D(lerNumero(d.estoqueMaximo)), localPadraoId: t(d.localId),
    ncm: t(d.ncm)?.replace(/\D/g, "") ?? null, cest: t(d.cest)?.replace(/\D/g, "") ?? null, origem: Number(d.origem) || 0,
    codigoBeneficio: t(d.codigoBeneficio), pesoLiquido: D(lerNumero(d.pesoLiquido)), pesoBruto: D(lerNumero(d.pesoBruto)), numeroFci: t(d.numeroFci),
    produtoEspecifico: d.produtoEspecifico && d.produtoEspecifico !== "Não usar" ? d.produtoEspecifico : null,
    cfopInterno: t(d.cfopInterno), cfopExterno: t(d.cfopExterno), csosn: t(d.csosn), cstIcms: t(d.cstIcms), aliquotaIcms: D(lerNumero(d.aliquotaIcms)),
    cstPis: t(d.cstPis), cstCofins: t(d.cstCofins), cClassTrib: t(d.cClassTrib), lojas: d.lojas,
  };
  const filhos = {
    valores: { create: valores.map((v) => ({ tipoValorId: v.tipoValorId, lucroUtilizado: D(lerNumero(v.lucroUtilizado) ?? 0)!, valor: D(lerNumero(v.valor) ?? 0)!, ativo: v.ativo })) },
    fornecedores: { create: d.fornecedores.filter((f) => f.fornecedorId).map((f) => ({ fornecedorId: f.fornecedorId, codigo: t(f.codigo) })) },
    variacoes: { create: d.possuiVariacoes ? d.variacoes.filter((v) => t(v.nome)).map((v, i) => ({ ordem: i, nome: v.nome.trim(), codigo: t(v.codigo), gtin: t(v.gtin) })) : [] },
    componentes: { create: d.possuiComposicao ? d.componentes.filter((c) => c.componenteId).map((c) => ({ componenteId: c.componenteId, quantidade: D(lerNumero(c.quantidade) ?? 1)! })) : [] },
  };

  return prisma.$transaction(async (tx) => {
    if (id) {
      const antes = await tx.produto.findUniqueOrThrow({ where: { id }, include: { valores: { include: { tipoValor: true } } } });
      const hist: { campo: string; anterior: number; novo: number }[] = [];
      if (Number(antes.custo) !== custo) hist.push({ campo: "Valor de custo", anterior: Number(antes.custo), novo: custo });
      for (const v of valores) {
        const a = antes.valores.find((x) => x.tipoValorId === v.tipoValorId);
        const novo = lerNumero(v.valor) ?? 0;
        if (Number(a?.valor ?? 0) !== novo) hist.push({ campo: tipos.find((x) => x.id === v.tipoValorId)!.nome, anterior: Number(a?.valor ?? 0), novo });
      }
      if (hist.length) await tx.historicoValor.createMany({ data: hist.map((h) => ({ ...h, produtoId: id, usuarioId })) });
      await tx.produtoValor.deleteMany({ where: { produtoId: id } });
      await tx.itemFornecedor.deleteMany({ where: { produtoId: id } });
      await tx.produtoVariacao.deleteMany({ where: { produtoId: id } });
      await tx.produtoComponente.deleteMany({ where: { produtoId: id } });
      return tx.produto.update({ where: { id }, data: { ...dados, ...filhos } });
    }
    const p = await tx.produto.create({ data: { ...dados, ...filhos, criadoPorId: usuarioId } });
    await tx.historicoValor.createMany({ data: [
      { produtoId: p.id, campo: "Valor de custo", anterior: 0, novo: custo, usuarioId },
      ...valores.map((v) => ({ produtoId: p.id, campo: tipos.find((x) => x.id === v.tipoValorId)!.nome, anterior: 0, novo: lerNumero(v.valor) ?? 0, usuarioId })),
    ] });
    const qtd = lerNumero(d.quantidadeInicial) ?? 0;
    if (qtd > 0 && dados.controlaEstoque) {
      if (!dados.localPadraoId) throw new Error("Escolha o local (prateleira) para a quantidade inicial");
      await entrada(tx, { produtoId: p.id, localId: dados.localPadraoId, quantidade: qtd, custoUnit: custo, origemTipo: "IMPLANTACAO", observacao: "Estoque inicial no cadastro", usuarioId: usuarioId ?? undefined });
    }
    return p;
  });
}

/** Excluir produto: com movimento (venda, OS, compra, estoque) só inativa. */
export async function excluirProduto(id: string) {
  const p = await prisma.produto.findUniqueOrThrow({
    where: { id },
    select: { nome: true, _count: { select: { movimentos: true, itensOs: true, itensVenda: true, itensCompra: true, reservas: true, usadoEm: true } } },
  });
  const c = p._count;
  if (c.movimentos + c.itensOs + c.itensVenda + c.itensCompra + c.reservas + c.usadoEm > 0) {
    await prisma.produto.update({ where: { id }, data: { ativo: false } });
    return { ok: true, mensagem: `${p.nome} tem movimentações e foi inativado em vez de excluído.` };
  }
  await prisma.$transaction([
    prisma.saldo.deleteMany({ where: { produtoId: id } }),
    prisma.anexo.deleteMany({ where: { entidade: "FOTO_PRODUTO", entidadeId: id } }),
    prisma.produto.delete({ where: { id } }),
  ]);
  return { ok: true, mensagem: `${p.nome} excluído.` };
}

/** "Clonar produto": copia tudo menos códigos, estoque e fotos. */
export async function clonarProduto(id: string, usuarioId: string | null) {
  const p = await prisma.produto.findUniqueOrThrow({ where: { id }, include: { valores: true, fornecedores: true, variacoes: true, componentes: true } });
  const codigo = await gerarCodigoProduto();
  const { id: _i, codigo: _c, gtin: _g, idLegado: _l, createdAt: _cr, updatedAt: _u, camposExtras, valores, fornecedores, variacoes, componentes, ...resto } = p;
  void _i; void _c; void _g; void _l; void _cr; void _u;
  return prisma.produto.create({
    data: {
      ...resto, codigo, nome: `${p.nome} (cópia)`, criadoPorId: usuarioId, camposExtras: (camposExtras ?? undefined) as Prisma.InputJsonValue | undefined,
      valores: { create: valores.map((v) => ({ tipoValorId: v.tipoValorId, lucroUtilizado: v.lucroUtilizado, valor: v.valor, ativo: v.ativo })) },
      fornecedores: { create: fornecedores.map((f) => ({ fornecedorId: f.fornecedorId, codigo: f.codigo })) },
      variacoes: { create: variacoes.map((v) => ({ ordem: v.ordem, nome: v.nome })) },
      componentes: { create: componentes.map((c) => ({ componenteId: c.componenteId, quantidade: c.quantidade })) },
    },
  });
}

/**
 * "Ajustar valores em massa": aplica % sobre o valor de venda (ou recalcula pelo lucro do tipo de valor)
 * nos produtos filtrados. Registra no histórico.
 */
export async function ajustarValoresEmMassa(where: Prisma.ProdutoWhereInput, op: { tipoValorId: string; modo: "percentual" | "lucro"; percentual?: number }, usuarioId: string | null) {
  const tipo = await prisma.tipoValor.findUniqueOrThrow({ where: { id: op.tipoValorId } });
  const ps = await prisma.produto.findMany({ where, include: { valores: { where: { tipoValorId: tipo.id } } } });
  let n = 0;
  for (const p of ps) {
    const custoFinal = Number(p.custo) + Number(p.despesasAcessorias) + Number(p.outrasDespesas);
    const atual = Number(p.valores[0]?.valor ?? (tipo.padrao ? p.precoVenda : 0));
    const novo = op.modo === "lucro"
      ? Math.round(custoFinal * (1 + Number(tipo.lucro) / 100) * 100) / 100
      : Math.round(atual * (1 + (op.percentual ?? 0) / 100) * 100) / 100;
    if (novo === atual || novo <= 0) continue;
    const lucro = custoFinal > 0 ? Math.min(9999999999, Math.round(((novo - custoFinal) / custoFinal) * 10000) / 100) : 0;
    await prisma.$transaction([
      prisma.produtoValor.upsert({
        where: { produtoId_tipoValorId: { produtoId: p.id, tipoValorId: tipo.id } },
        update: { valor: novo, lucroUtilizado: lucro }, create: { produtoId: p.id, tipoValorId: tipo.id, valor: novo, lucroUtilizado: lucro },
      }),
      ...(tipo.padrao ? [prisma.produto.update({ where: { id: p.id }, data: { precoVenda: novo } })] : []),
      prisma.historicoValor.create({ data: { produtoId: p.id, campo: tipo.nome, anterior: atual, novo, usuarioId } }),
    ]);
    n++;
  }
  return n;
}

/** Estoque por produto (físico, reservado) para as listas. */
export async function estoquesDe(ids: string[]) {
  if (!ids.length) return new Map<string, { fisico: number; reservado: number }>();
  const [s, r] = await Promise.all([
    prisma.saldo.groupBy({ by: ["produtoId"], where: { produtoId: { in: ids } }, _sum: { quantidade: true } }),
    prisma.reserva.groupBy({ by: ["produtoId"], where: { produtoId: { in: ids }, status: "ATIVA", localId: { not: null } }, _sum: { quantidade: true } }),
  ]);
  const m = new Map(ids.map((i) => [i, { fisico: 0, reservado: 0 }]));
  for (const x of s) m.get(x.produtoId)!.fisico = Number(x._sum.quantidade ?? 0);
  for (const x of r) m.get(x.produtoId)!.reservado = Number(x._sum.quantidade ?? 0);
  return m;
}
