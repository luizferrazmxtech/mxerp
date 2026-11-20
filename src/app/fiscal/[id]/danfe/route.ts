import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { gerarDanfePdf } from "@/lib/fiscal/danfePdf";

/** DANFE A4 da NF-e em PDF (abre no navegador; ?baixar=1 para salvar o arquivo). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await usuarioAtual())) return new Response("Faça login", { status: 401 });
  const { id } = await params;
  const n = await prisma.notaFiscal.findUnique({ where: { id } });
  if (!n || !n.xml || n.modelo === "NFSE") return new Response("Nota sem XML de NF-e/NFC-e", { status: 404 });
  const emp = n.empresaId ? await prisma.empresa.findUnique({ where: { id: n.empresaId }, select: { logo: true } }) : null;
  const aviso = n.ambiente === "HOMOLOGACAO" ? "SEM VALOR FISCAL - HOMOLOGAÇÃO"
    : n.status === "CANCELADA" ? "NOTA CANCELADA" : n.status !== "AUTORIZADA" ? "SEM VALOR FISCAL" : null;
  const pdf = await gerarDanfePdf(n.xml, { logo: emp?.logo ? Buffer.from(emp.logo) : null, aviso });
  const nome = `DANFE-${n.modelo === "NFCE" ? "NFCe" : "NFe"}-${n.serie}-${n.numero}.pdf`;
  const baixar = new URL(req.url).searchParams.get("baixar");
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `${baixar ? "attachment" : "inline"}; filename="${nome}"`, "Cache-Control": "no-store" },
  });
}
