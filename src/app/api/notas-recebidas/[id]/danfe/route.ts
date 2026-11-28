import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { podeAcessar } from "@/lib/auth/permissoes";
import { respostaDanfe } from "@/lib/compras/danfeRecebida";

/** DANFE (PDF) de uma nota de compra baixada da SEFAZ (Compras › Notas recebidas). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await usuarioAtual();
  if (!u || !podeAcessar(u.papel, "/compras/notas-recebidas")) return new Response("não autorizado", { status: 401 });
  const { id } = await params;
  const n = await prisma.notaRecebida.findUnique({ where: { id } });
  if (!n?.xml) return new Response("O XML completo desta nota ainda não foi baixado da SEFAZ", { status: 404 });
  return respostaDanfe(req, n.xml, n.chave, n.situacao === "CANCELADA");
}
