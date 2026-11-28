import { prisma, type Tx } from "@/lib/db";
import { gerarCodigoProduto, salvarProduto } from "@/lib/itens/produtos";
import { lerNumero, type DadosProduto } from "@/lib/itens/tipos";

/** O que o "Cadastrar produto da nota" manda para o servidor (tudo editável no formulário). */
export type ProdutoDaNota = {
  fornecedorId: string; codigoFornecedor: string;
  codigo: string; nome: string; unidade: string; gtin: string;
  converte: boolean; unidadeCompra: string; fatorConversao: string;
  /** custo na unidade da nota; vira custo por unidade do produto pela conversão */
  custoNota: string; precoVenda: string;
  ncm: string; cest: string; origem: string; cfopInterno: string; cfopExterno: string; csosn: string; cstIcms: string;
};

export type ProdutoCriado = { id: string; codigo: string; nome: string; unidade: string; unidadeCompra: string | null; fatorConversao: number };

/**
 * Cadastra o produto a partir do item da NF-e do fornecedor: descrição, código de barras, NCM, CEST, origem e
 * a sugestão fiscal (ST ou não), a conversão de unidade (1 CX = 305 MT) e o código do fornecedor, para a
 * próxima nota já se ligar sozinha. O custo fica por unidade do produto; o estoque só entra ao salvar a compra.
 */
export async function criarProdutoDaNota(d: ProdutoDaNota, usuarioId: string): Promise<ProdutoCriado> {
  const fator = d.converte ? lerNumero(d.fatorConversao) ?? 0 : 1;
  if (d.converte && !(fator > 0)) throw new Error("Informe quantas unidades do produto vêm em 1 unidade da nota");
  const custo = (lerNumero(d.custoNota) ?? 0) / (fator || 1);
  const [tipos, empresas] = await Promise.all([
    prisma.tipoValor.findMany({ orderBy: [{ padrao: "desc" }, { nome: "asc" }] }),
    prisma.empresa.findMany({ select: { id: true } }),
  ]);
  const padrao = tipos.find((t) => t.padrao) ?? tipos[0];
  // sem preço informado, vale a margem do tipo de valor padrão sobre o custo
  const lucroPadrao = Number(padrao?.lucro ?? 0);
  const preco = lerNumero(d.precoVenda) || Math.round(custo * (1 + lucroPadrao / 100) * 100) / 100;
  const lucro = custo > 0 && preco > 0 ? Math.round(((preco - custo) / custo) * 10000) / 100 : lucroPadrao;
  const fmt = (v: number, c = 2) => v.toFixed(c).replace(".", ",");
  const codigo = d.codigo.trim() || (await gerarCodigoProduto());
  const dados: DadosProduto = {
    nome: d.nome, codigo, gtin: d.gtin, grupoId: "", controlaEstoque: true, emiteNota: true, possuiVariacoes: false, possuiComposicao: false,
    unidade: d.unidade, converte: d.converte, unidadeCompra: d.unidadeCompra, fatorConversao: String(fator).replace(".", ","),
    ativo: true, vendidoSeparadamente: true, vendePdv: true, comissao: "", camposExtras: {}, peso: "", largura: "", altura: "", comprimento: "", descricao: "",
    custo: fmt(custo, 4), despesasAcessorias: "0", outrasDespesas: "0",
    valores: padrao ? [{ tipoValorId: padrao.id, nome: padrao.nome, lucroSugerido: String(Number(padrao.lucro)), lucroUtilizado: fmt(lucro), valor: fmt(preco), ativo: true }] : [],
    estoqueMinimo: "", estoqueMaximo: "", quantidadeInicial: "", localId: "",
    ncm: d.ncm, cest: d.cest, origem: d.origem || "0", codigoBeneficio: "", pesoLiquido: "", pesoBruto: "", numeroFci: "", produtoEspecifico: "Não usar",
    cfopInterno: d.cfopInterno, cfopExterno: d.cfopExterno, csosn: d.csosn, cstIcms: d.cstIcms, aliquotaIcms: "", cstPis: "", cstCofins: "", cClassTrib: "",
    fornecedores: d.fornecedorId ? [{ fornecedorId: d.fornecedorId, nome: "", codigo: d.codigoFornecedor }] : [],
    lojas: empresas.map((e) => e.id), variacoes: [], componentes: [],
  };
  const p = await salvarProduto(dados, usuarioId);
  return { id: p.id, codigo: p.codigo, nome: p.nome, unidade: p.unidade, unidadeCompra: p.unidadeCompra, fatorConversao: Number(p.fatorConversao) };
}

/**
 * Completa o cadastro fiscal de produtos já existentes com o que veio na nota, só nos campos vazios
 * (NCM, CEST e código de barras): não muda nada que alguém já tenha preenchido.
 */
export async function completarFiscal(tx: Tx, produtoId: string, nota: { ncm: string; cest: string; ean: string; origem: string }) {
  const p = await tx.produto.findUnique({ where: { id: produtoId }, select: { ncm: true, cest: true, gtin: true } });
  if (!p) return;
  const dados: { ncm?: string; cest?: string; gtin?: string; origem?: number } = {};
  if (!p.ncm && /^\d{8}$/.test(nota.ncm)) {
    dados.ncm = nota.ncm;
    // origem só junto com o NCM: produto sem NCM nunca teve a parte fiscal conferida
    if (/^[0-8]$/.test(nota.origem)) dados.origem = Number(nota.origem);
  }
  if (!p.cest && /^\d{7}$/.test(nota.cest)) dados.cest = nota.cest;
  if (!p.gtin && nota.ean && !(await tx.produto.findFirst({ where: { gtin: nota.ean }, select: { id: true } }))) dados.gtin = nota.ean;
  if (Object.keys(dados).length) await tx.produto.update({ where: { id: produtoId }, data: dados });
}
