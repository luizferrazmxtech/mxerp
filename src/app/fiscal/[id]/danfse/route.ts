import { usuarioAtual } from "@/lib/auth/atual";
import { danfseDaNota } from "@/lib/fiscal/danfse";

/** DANFSe da NFS-e: o do MXERP (leiaute nacional com o logo da emissora) ou, com ?oficial=1, o PDF do portal nacional baixado com o certificado da emissora. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await usuarioAtual())) return new Response("Faça login", { status: 401 });
  const { id } = await params;
  try {
    const q = new URL(req.url).searchParams;
    const d = await danfseDaNota(id, { oficial: q.get("oficial") === "1" });
    const baixar = q.get("baixar");
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
