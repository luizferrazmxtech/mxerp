import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { podeAcessar } from "@/lib/auth/permissoes";

/** XML completo (procNFe) de uma nota de compra baixada da SEFAZ. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await usuarioAtual();
  if (!u || !podeAcessar(u.papel, "/compras/notas-recebidas")) return new Response("não autorizado", { status: 401 });
  const { id } = await params;
  const n = await prisma.notaRecebida.findUnique({ where: { id } });
  if (!n?.xml) return new Response("XML completo ainda não baixado", { status: 404 });
  return new Response(n.xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${n.chave}-procNFe.xml"` } });
}
