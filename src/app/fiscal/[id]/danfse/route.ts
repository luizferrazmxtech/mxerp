import { usuarioAtual } from "@/lib/auth/atual";
import { danfseDaNota } from "@/lib/fiscal/danfse";

/** DANFSe da NFS-e: baixado do portal nacional com o certificado da empresa emissora (sem pedir certificado no navegador). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await usuarioAtual())) return new Response("Faça login", { status: 401 });
  const { id } = await params;
  try {
    const d = await danfseDaNota(id);
    const baixar = new URL(req.url).searchParams.get("baixar");
    return new Response(new Uint8Array(d.pdf), {
      headers: {
        "Content-Type": "application/pdf", "Content-Disposition": `${baixar ? "attachment" : "inline"}; filename="${d.nome}"`, "Cache-Control": "no-store",
        "X-Danfse": d.oficial ? "oficial" : `simplificado: ${encodeURIComponent(d.motivo ?? "")}`,
      },
    });
  } catch (e) {
    return new Response((e as Error).message, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
