import { prisma } from "@/lib/db";

export type ConfigOrcamento = {
  introducao: string; observacoes: string; formatoA4: string; fonteA4: number; fonteCupom: number;
  documentos: Record<string, boolean>;
};

export const DOCUMENTOS: { grupo: string; itens: [string, string][] }[] = [
  { grupo: "Produtos", itens: [["numeroItem", "Número do item"], ["codigoProduto", "Código do produto"], ["unidade", "Unidade"], ["imagemProduto", "Imagem do produto"], ["descricaoProduto", "Descrição do produto"], ["ncm", "NCM"], ["valorUnitario", "Valor unitário"], ["subtotal", "Subtotal"]] },
  { grupo: "Serviços", itens: [["descricaoServico", "Descrição do serviço"], ["imagemServico", "Imagem do serviço"]] },
  { grupo: "Anexos", itens: [["anexos", "Anexos do pedido"], ["imagemAnexo", "Imagem do anexo"]] },
];

const PADRAO: ConfigOrcamento = {
  introducao: "", observacoes: "", formatoA4: "PDF", fonteA4: 11, fonteCupom: 9,
  documentos: { numeroItem: true, codigoProduto: true, unidade: true, imagemProduto: false, descricaoProduto: false, ncm: false, valorUnitario: true, subtotal: true, descricaoServico: true, imagemServico: false, anexos: false, imagemAnexo: false },
};

export async function configOrcamento(): Promise<ConfigOrcamento> {
  const c = await prisma.configuracao.findUnique({ where: { chave: "orcamento" } });
  const v = (c?.valor ?? {}) as Partial<ConfigOrcamento>;
  return { ...PADRAO, ...v, documentos: { ...PADRAO.documentos, ...(v.documentos ?? {}) } };
}
