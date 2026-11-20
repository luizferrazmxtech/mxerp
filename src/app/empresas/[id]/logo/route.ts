import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";

/** Imagem do logo da loja. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await usuarioAtual())) return new Response("Faça login", { status: 401 });
  const { id } = await params;
  const e = await prisma.empresa.findUnique({ where: { id }, select: { logo: true, logoTipo: true } });
  if (!e?.logo) return new Response("Sem logo", { status: 404 });
  return new Response(new Uint8Array(e.logo), { headers: { "Content-Type": e.logoTipo ?? "image/png", "Cache-Control": "no-store" } });
}
