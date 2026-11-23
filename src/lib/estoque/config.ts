import { prisma } from "@/lib/db";

/** Configurações › módulo Estoque (Gestão Click: custo nas compras, lote/localização, avisos, textos e importação do XML). */
export type ConfigEstoque = {
  custoCompra: "MEDIA" | "ULTIMA" | "NAO";
  controleLote: boolean; saidaLotePdv: "VENCER" | "ENTRAR" | "MANUAL"; loteVendas: "VENCER" | "ENTRAR" | "MANUAL";
  localizacao: boolean;
  /** estoque (depósito) padrão onde as compras entram; "" = o primeiro da loja que não é carro */
  depositoEntrada: string;
  avisoCotacao: "AMBOS" | "SISTEMA" | "EMAIL" | "NAO";
  textoCompras: string; textoCotacoes: string;
  documentos: Record<string, boolean>;
  xml: { frete: boolean; desconto: boolean; impostos: boolean; outras: boolean; vincularPor: "NOME" | "CODIGO" | "AMBOS" };
};

export const PADRAO_ESTOQUE: ConfigEstoque = {
  custoCompra: "MEDIA", controleLote: false, saidaLotePdv: "VENCER", loteVendas: "VENCER", localizacao: true, depositoEntrada: "", avisoCotacao: "SISTEMA",
  textoCompras: "", textoCotacoes: "",
  documentos: { numeroItem: true, codigoProduto: true, unidade: true, imagemProduto: false, ncm: false, valorUnitario: true, subtotal: true },
  xml: { frete: true, desconto: true, impostos: true, outras: true, vincularPor: "AMBOS" },
};

export async function configEstoque(): Promise<ConfigEstoque> {
  const c = await prisma.configuracao.findUnique({ where: { chave: "estoque" } });
  const v = (c?.valor ?? {}) as Partial<ConfigEstoque>;
  return { ...PADRAO_ESTOQUE, ...v, documentos: { ...PADRAO_ESTOQUE.documentos, ...(v.documentos ?? {}) }, xml: { ...PADRAO_ESTOQUE.xml, ...(v.xml ?? {}) } };
}
