import { prisma } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = await prisma.notaFiscal.findUnique({ where: { id } });
  if (!n?.xml) return new Response("Nota sem XML", { status: 404 });
  const nome = `${n.chave ?? n.id}${n.status === "AUTORIZADA" || n.status === "CANCELADA" ? "-procNFe" : ""}.xml`;
  return new Response(n.xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${nome}"` },
  });
}
