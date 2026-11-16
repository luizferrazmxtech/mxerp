/** Tipos dos formulários de produto e serviço (sem banco: podem ir para o navegador). */

export type ValorForm = { tipoValorId: string; nome: string; lucroSugerido: string; lucroUtilizado: string; valor: string; ativo: boolean };
export type FornecedorForm = { fornecedorId: string; nome: string; codigo: string };
export type ComponenteForm = { componenteId: string; nome: string; quantidade: string };
export type VariacaoForm = { nome: string; codigo: string; gtin: string };

export type DadosProduto = {
  nome: string; codigo: string; gtin: string; grupoId: string;
  controlaEstoque: boolean; emiteNota: boolean; possuiVariacoes: boolean; possuiComposicao: boolean;
  unidade: string; converte: boolean; unidadeCompra: string; fatorConversao: string;
  ativo: boolean; vendidoSeparadamente: boolean; vendePdv: boolean; comissao: string;
  camposExtras: Record<string, string>; peso: string; largura: string; altura: string; comprimento: string; descricao: string;
  custo: string; despesasAcessorias: string; outrasDespesas: string; valores: ValorForm[];
  estoqueMinimo: string; estoqueMaximo: string; quantidadeInicial: string; localId: string;
  ncm: string; cest: string; origem: string; codigoBeneficio: string; pesoLiquido: string; pesoBruto: string; numeroFci: string; produtoEspecifico: string;
  cfopInterno: string; cfopExterno: string; csosn: string; cstIcms: string; aliquotaIcms: string; cstPis: string; cstCofins: string; cClassTrib: string;
  fornecedores: FornecedorForm[]; lojas: string[]; variacoes: VariacaoForm[]; componentes: ComponenteForm[];
};

export type DadosServico = {
  nome: string; codigo: string; comissao: string; custo: string; preco: string; descricao: string; ativo: boolean;
  camposExtras: Record<string, string>;
  atividade: string; codigoLc116: string; codigoTributacaoMunicipal: string; codigoTributacaoNacional: string; codigoNbs: string; cnae: string; descricaoAtividade: string;
  aliquotaIss: string; aliquotaCofins: string; aliquotaPis: string; aliquotaCsll: string; aliquotaIr: string; aliquotaInss: string;
  descontarImpostos: boolean; descontarDeducoes: boolean; construcaoCivil: boolean; reterIss: boolean;
  fornecedores: FornecedorForm[]; lojas: string[];
};

/** "1.234,56", "1234,56" ou "1234.56" → número (vazio → null). */
export function lerNumero(s: string | number | null | undefined): number | null {
  if (s == null) return null;
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  const t = s.trim();
  if (!t) return null;
  const v = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(v) ? v : null;
}

/** Valor sugerido = custo final × (1 + lucro%). */
export const valorSugerido = (custoFinal: number, lucro: number) => Math.round(custoFinal * (1 + lucro / 100) * 100) / 100;
/** Lucro utilizado (%) a partir do valor de venda. */
export const lucroDe = (custoFinal: number, valor: number) => (custoFinal > 0 ? Math.round(((valor - custoFinal) / custoFinal) * 10000) / 100 : 0);

export const ORIGENS = [
  "0 – Nacional, exceto as indicadas nos códigos 3 a 5",
  "1 – Estrangeira, importação direta, exceto a indicada no código 6",
  "2 – Estrangeira, adquirida no mercado interno, exceto a indicada no código 7",
  "3 – Nacional, conteúdo de importação superior a 40% e inferior ou igual a 70%",
  "4 – Nacional, produzida conforme processos produtivos básicos",
  "5 – Nacional, conteúdo de importação inferior ou igual a 40%",
  "6 – Estrangeira, importação direta, sem similar nacional (lista CAMEX)",
  "7 – Estrangeira, adquirida no mercado interno, sem similar nacional (lista CAMEX)",
  "8 – Nacional, conteúdo de importação superior a 70%",
];
export const PRODUTOS_ESPECIFICOS = ["Não usar", "Veículo novo", "Medicamento", "Armamento", "Combustível", "Papel imune", "Agrotóxico", "Agropecuário"];
