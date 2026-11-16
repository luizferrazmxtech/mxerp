import type { ContribuinteIcms, TipoPessoa } from "@prisma/client";

/** Tipos e valores dos formulários de cadastro (sem acesso ao banco: podem ir para o navegador). */
export type PapelPessoa = "cliente" | "fornecedor" | "transportadora";

export type EnderecoForm = { tipo: string; cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; codigoMunicipio: string; uf: string };
export type ContatoForm = { tipo: string; nome: string; contato: string; cargo: string; observacao: string };
export const enderecoVazio = (): EnderecoForm => ({ tipo: "", cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", codigoMunicipio: "", uf: "" });
export const contatoVazio = (): ContatoForm => ({ tipo: "", nome: "", contato: "", cargo: "", observacao: "" });

export type DadosPessoa = {
  tipoPessoa: TipoPessoa; ativo: boolean; nome: string; email: string;
  documento: string; nomeSocial: string; rg: string; nascimento: string;
  razaoSocial: string; inscricaoEstadual: string; ieIsento: boolean; inscricaoMunicipal: string; suframa: string; responsavel: string;
  contribuinteIcms: ContribuinteIcms; telefone: string; celular: string; fax: string; site: string; vendedorId: string; pais: string;
  enderecos: EnderecoForm[]; contatos: ContatoForm[];
  limiteCredito: string; excederLimite: boolean; observacoes: string;
  camposExtras: Record<string, string | string[]>;
};


/** Entidades que têm campos extras próprios (cada uma na sua lista de /campos-extras). */
export const ENTIDADES_CAMPO = ["CLIENTE", "PRODUTO", "ORCAMENTO", "VENDA", "OS", "COMPRA"] as const;
export type EntidadeCampo = (typeof ENTIDADES_CAMPO)[number];
export const entidadeCampo = (x: unknown): EntidadeCampo => (ENTIDADES_CAMPO.includes(x as EntidadeCampo) ? (x as EntidadeCampo) : "CLIENTE");
export const baseCampos = (e: EntidadeCampo) => (e === "CLIENTE" ? "/campos-extras" : `/campos-extras?entidade=${e}`);
export const ROTULO_CAMPOS: Record<EntidadeCampo, string> = { CLIENTE: "Campos extras de clientes", PRODUTO: "Campos extras de produtos", ORCAMENTO: "Campos extras de orçamentos", VENDA: "Campos extras de vendas", OS: "Campos extras de OS", COMPRA: "Campos extras de compras" };
