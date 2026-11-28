import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { podeAcessar } from "@/lib/auth/permissoes";
import { xmlDaCompra } from "@/lib/compras/nfeCompra";
import { respostaDanfe } from "@/lib/compras/danfeRecebida";

/** DANFE (PDF) da NF-e do fornecedor ligada à compra (nota baixada da SEFAZ ou XML importado). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await usuarioAtual();
  if (!u || !podeAcessar(u.papel, "/compras")) return new Response("não autorizado", { status: 401 });
  const { id } = await params;
  const xml = await xmlDaCompra(id);
  if (!xml) return new Response("Esta compra não tem o XML da NF-e (importe pelo XML ou anexe o arquivo .xml da nota)", { status: 404 });
  const c = await prisma.compra.findUnique({ where: { id }, select: { chaveNfe: true } });
  const cancelada = c?.chaveNfe ? (await prisma.notaRecebida.findUnique({ where: { chave: c.chaveNfe }, select: { situacao: true } }))?.situacao === "CANCELADA" : false;
  return respostaDanfe(req, xml, c?.chaveNfe ?? null, cancelada);
}
