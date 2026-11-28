import { prisma } from "@/lib/db";
import { disposicao, nomeBoleto } from "@/lib/documentos/nomeArquivo";
import { ATIVOS, BoletoEmProcessamento, pdfBoleto } from "@/lib/financeiro/boletos";
import { paginaPixBoleto } from "@/lib/financeiro/paginaPixBoleto";

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
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": disposicao((await nomeBoleto(b.id).catch(() => null)) ?? `Boleto ${b.seuNumero}`), "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof BoletoEmProcessamento) {
      const pg = await paginaPixBoleto(b.id, "O banco ainda está registrando o código de barras deste boleto, mas o Pix já pode ser pago.");
      if (pg) return pg;
    }
    return new Response("Não foi possível gerar o boleto agora. Tente de novo em alguns minutos.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
