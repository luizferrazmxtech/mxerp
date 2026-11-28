import { prisma } from "@/lib/db";
import { disposicao, nomeBoleto } from "@/lib/documentos/nomeArquivo";
import { BoletoEmProcessamento, pdfBoleto } from "@/lib/financeiro/boletos";
import { paginaPixBoleto } from "@/lib/financeiro/paginaPixBoleto";

/** PDF do boleto para imprimir ou baixar (usuário logado). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await prisma.boleto.findUnique({ where: { id }, select: { id: true, seuNumero: true } });
  if (!b) return new Response("Boleto não encontrado", { status: 404 });
  try {
    const pdf = await pdfBoleto(b.id);
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": disposicao((await nomeBoleto(b.id).catch(() => null)) ?? `Boleto ${b.seuNumero}`) } });
  } catch (e) {
    if (e instanceof BoletoEmProcessamento) { const pg = await paginaPixBoleto(b.id, e.message); if (pg) return pg; }
    return new Response(e instanceof Error ? e.message : String(e), { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
