import { prisma } from "@/lib/db";

const IMAGENS = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Foto da instalação no link público da OS: só fotos (OS_FOTO) da OS desse link. */
export async function GET(_: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const os = await prisma.ordemServico.findFirst({ where: { token }, select: { id: true, situacaoCfg: { select: { exibirCobranca: true } } } });
  if (!os || os.situacaoCfg?.exibirCobranca === false) return new Response("não encontrado", { status: 404 });
  const a = await prisma.anexo.findFirst({ where: { id, entidade: "OS_FOTO", entidadeId: os.id, tipo: { in: IMAGENS } } });
  if (!a) return new Response("não encontrado", { status: 404 });
  return new Response(new Uint8Array(a.dados), {
    headers: { "Content-Type": a.tipo, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(a.nome)}`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600" },
  });
}
