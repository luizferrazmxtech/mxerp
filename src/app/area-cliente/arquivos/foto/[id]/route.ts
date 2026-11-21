import { clienteAtual } from "@/lib/portal/atual";
import { fotoDaOs } from "@/lib/portal/dados";

/** Foto de instalação de uma OS do cliente logado. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await clienteAtual();
  if (!c) return new Response("Entre na Área do Cliente", { status: 401 });
  const a = await fotoDaOs(c.id, (await params).id);
  if (!a) return new Response("Foto não encontrada", { status: 404 });
  return new Response(new Uint8Array(a.dados), { headers: { "Content-Type": a.tipo, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
