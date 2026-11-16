import { prisma } from "@/lib/db";

export type ConfigVenda = {
  observacoes: string; validadeVale: number; estoqueNegativo: boolean; documentos: Record<string, boolean>;
  balanca: { prefixo: string; digitosCodigo: 4 | 5; conteudo: "PRECO" | "PESO" };
};

const PADRAO: ConfigVenda = {
  observacoes: "", validadeVale: 90, estoqueNegativo: true,
  documentos: { numeroItem: true, codigoProduto: true, unidade: true, imagemProduto: false, descricaoProduto: false, ncm: false, valorUnitario: true, subtotal: true, descricaoServico: true, imagemServico: false, anexos: false, imagemAnexo: false },
  balanca: { prefixo: "2", digitosCodigo: 4, conteudo: "PRECO" },
};

export async function configVenda(): Promise<ConfigVenda> {
  const c = await prisma.configuracao.findUnique({ where: { chave: "venda" } });
  const v = (c?.valor ?? {}) as Partial<ConfigVenda>;
  return { ...PADRAO, ...v, documentos: { ...PADRAO.documentos, ...(v.documentos ?? {}) }, balanca: { ...PADRAO.balanca, ...(v.balanca ?? {}) } };
}
