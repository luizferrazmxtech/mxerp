import fs from "node:fs";
import { Readable } from "node:stream";
import { caminhoBackup } from "@/lib/backups";
import { exigirAdmin } from "@/lib/auth";

/** Baixar uma cópia (só administrador da Central). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; arquivo: string }> }) {
  await exigirAdmin();
  const { slug, arquivo } = await params;
  const p = caminhoBackup(slug, arquivo);
  if (!p || !fs.existsSync(p)) return new Response("Cópia não encontrada", { status: 404 });
  const st = fs.statSync(p);
  return new Response(Readable.toWeb(fs.createReadStream(p)) as ReadableStream, {
    headers: { "Content-Type": "application/octet-stream", "Content-Length": String(st.size), "Content-Disposition": `attachment; filename="${arquivo}"` },
  });
}
