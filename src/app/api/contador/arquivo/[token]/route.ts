import { pacoteDoLink } from "@/lib/contador/contador";

/** Link do e-mail do contador: baixa o .zip do mês sem login (o token é secreto e vale 60 dias). */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const p = await pacoteDoLink((await params).token);
  if (!p) return new Response("Link vencido ou inválido. Peça um novo envio à empresa.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(new Uint8Array(p.zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${p.nome}"` } });
}
