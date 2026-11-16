import { prisma } from "@/lib/db";

/** Foto do cliente (tipo "pessoa") ou do funcionário (tipo "funcionario"). */
export async function GET(_: Request, { params }: { params: Promise<{ tipo: string; id: string }> }) {
  const { tipo, id } = await params;
  const r = tipo === "funcionario"
    ? await prisma.usuario.findUnique({ where: { id }, select: { foto: true, fotoTipo: true } })
    : await prisma.pessoa.findUnique({ where: { id }, select: { foto: true, fotoTipo: true } });
  if (!r?.foto) return new Response("sem foto", { status: 404 });
  return new Response(new Uint8Array(r.foto), { headers: { "Content-Type": r.fotoTipo ?? "image/jpeg", "Cache-Control": "private, no-cache" } });
}
