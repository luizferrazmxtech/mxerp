import { prisma } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await prisma.anexo.findUnique({ where: { id } });
  if (!a) return new Response("não encontrado", { status: 404 });
  const imagemOuPdf = /^(image\/(png|jpeg|gif|webp)|application\/pdf)$/.test(a.tipo);
  return new Response(new Uint8Array(a.dados), {
    headers: {
      "Content-Type": imagemOuPdf ? a.tipo : "application/octet-stream",
      "Content-Disposition": `${imagemOuPdf ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.nome)}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
