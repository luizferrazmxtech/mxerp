import { prisma } from "@/lib/db";

/** Configurações › módulo OS (Gestão Click: regras de estoque, textos padrão e documentos). */
export type ConfigOs = {
  observacoes: string; garantia: string; estoqueNegativo: boolean; semCondicao: boolean; documentos: Record<string, boolean>;
};

const PADRAO: ConfigOs = {
  observacoes: "", garantia: "", estoqueNegativo: true, semCondicao: true,
  documentos: { numeroItem: true, codigoProduto: true, unidade: true, imagemProduto: false, descricaoProduto: false, ncm: false, valorUnitario: true, subtotal: true, descricaoServico: true, imagemServico: false, atividades: false, anexos: false, imagemAnexo: false },
};

export async function configOs(): Promise<ConfigOs> {
  const c = await prisma.configuracao.findUnique({ where: { chave: "os" } });
  const v = (c?.valor ?? {}) as Partial<ConfigOs>;
  return { ...PADRAO, ...v, documentos: { ...PADRAO.documentos, ...(v.documentos ?? {}) } };
}
