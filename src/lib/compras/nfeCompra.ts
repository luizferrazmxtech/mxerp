import { prisma } from "@/lib/db";

/**
 * XML da NF-e de uma compra, para mostrar a nota (DANFE) em PDF: a nota baixada da SEFAZ (Notas recebidas)
 * pela chave, ou o XML importado de arquivo que ficou nos anexos da compra.
 */
export async function xmlDaCompra(compraId: string): Promise<string | null> {
  const c = await prisma.compra.findUnique({ where: { id: compraId }, select: { chaveNfe: true } });
  if (!c) return null;
  if (c.chaveNfe) {
    const n = await prisma.notaRecebida.findUnique({ where: { chave: c.chaveNfe }, select: { xml: true } });
    if (n?.xml) return n.xml;
  }
  const anexos = await prisma.anexo.findMany({
    where: { entidade: "COMPRA", entidadeId: compraId, nome: { endsWith: ".xml", mode: "insensitive" } },
    select: { dados: true }, orderBy: { createdAt: "desc" },
  });
  for (const a of anexos) {
    const xml = Buffer.from(a.dados).toString("utf8");
    if (/<infNFe/.test(xml) && (!c.chaveNfe || xml.includes(c.chaveNfe))) return xml;
  }
  return null;
}
