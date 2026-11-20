import { prisma } from "@/lib/db";
import { pdfBoleto } from "@/lib/inter";

/** PDF do boleto para o cliente (link no e-mail e na tela de bloqueio do sistema dele). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; tok: string }> }) {
  const { id, tok } = await params;
  const f = await prisma.fatura.findUnique({ where: { id }, include: { cliente: { select: { licencaToken: true } } } });
  if (!f || tok.length !== 16 || !f.cliente.licencaToken.startsWith(tok) || f.situacao !== "ABERTA") return new Response("Boleto não encontrado ou já pago.", { status: 404 });
  try {
    const pdf = await pdfBoleto(f.id);
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="boleto-${f.competencia}.pdf"` } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Boleto indisponível", { status: 503 });
  }
}
