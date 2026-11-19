import { prisma } from "@/lib/db";

/** XML de um evento da nota (cancelamento, carta de correção), para enviar ao cliente ou ao contador. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ev = await prisma.notaEvento.findUnique({ where: { id }, include: { nota: { select: { chave: true } } } });
  if (!ev?.xml) return new Response("Evento sem XML", { status: 404 });
  const nome = `${ev.tipo}-${ev.nota.chave ?? ev.notaId}-${String(ev.sequencia).padStart(2, "0")}.xml`;
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><procEventoNFe versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe">${ev.xml.replace(/<\?xml[^>]*>/g, "")}</procEventoNFe>`, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${nome}"` },
  });
}
