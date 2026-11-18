import { prisma } from "@/lib/db";
import { ATIVOS, pdfBoleto } from "@/lib/financeiro/boletos";

/** Link público do boleto (o cliente abre sem login, pelo link mandado por WhatsApp/e-mail). */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const b = token.length >= 20 ? await prisma.boleto.findUnique({ where: { token }, select: { id: true, seuNumero: true, situacao: true } }) : null;
  if (!b) return new Response("Boleto não encontrado", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if (!ATIVOS.includes(b.situacao)) {
    const m = b.situacao === "RECEBIDO" ? "Este boleto já foi pago. Obrigado!" : "Este boleto não está mais disponível. Fale com a empresa para receber um novo.";
    return new Response(m, { status: 410, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  try {
    const pdf = await pdfBoleto(b.id);
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="boleto-${b.seuNumero}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch {
    return new Response("Não foi possível gerar o boleto agora. Tente de novo em alguns minutos.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
