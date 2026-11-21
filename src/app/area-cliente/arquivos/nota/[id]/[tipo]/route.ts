import { prisma } from "@/lib/db";
import { clienteAtual } from "@/lib/portal/atual";
import { notaDoCliente } from "@/lib/portal/dados";
import { gerarDanfePdf } from "@/lib/fiscal/danfePdf";

const texto = (m: string, status: number) => new Response(m, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/** PDF (DANFE A4 / cupom da NFC-e) ou XML de uma nota do cliente logado na Área do Cliente. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; tipo: string }> }) {
  const c = await clienteAtual();
  if (!c) return texto("Entre na Área do Cliente", 401);
  const { id, tipo } = await params;
  const n = await notaDoCliente(c.id, id);
  if (!n?.xml) return texto("Nota não encontrada", 404);
  const base = `${n.modelo === "NFCE" ? "NFCe" : n.modelo === "NFSE" ? "NFSe" : "NFe"}-${n.serie}-${n.numero}`;
  if (tipo === "xml") {
    return new Response(n.xml, {
      headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${n.chave ?? base}${n.modelo !== "NFSE" ? "-procNFe" : ""}.xml"`, "Cache-Control": "private, no-store" },
    });
  }
  if (tipo !== "pdf" || n.modelo === "NFSE") return texto("Formato inválido", 404);
  const emp = n.empresaId ? await prisma.empresa.findUnique({ where: { id: n.empresaId }, select: { logo: true } }) : null;
  const aviso = n.ambiente === "HOMOLOGACAO" ? "SEM VALOR FISCAL - HOMOLOGAÇÃO" : n.status === "CANCELADA" ? "NOTA CANCELADA" : null;
  const pdf = await gerarDanfePdf(n.xml, { logo: emp?.logo ? Buffer.from(emp.logo) : null, aviso });
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="DANFE-${base}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
