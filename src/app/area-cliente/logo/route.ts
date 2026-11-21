import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";

/** Logo da empresa no topo da Área do Cliente (a primeira loja com logo; sem logo, a marca MXTECH). */
export async function GET() {
  const e = await prisma.empresa.findFirst({ where: { logo: { not: null }, ativa: true }, orderBy: { createdAt: "asc" }, select: { logo: true, logoTipo: true } });
  if (!e?.logo) {
    // a pasta public passa pelo login do ERP; o portal lê o arquivo direto
    const svg = await readFile(path.join(process.cwd(), "public", "marca", "logo-claro.svg")).catch(() => null);
    if (!svg) return new Response("Sem logo", { status: 404 });
    return new Response(new Uint8Array(svg), { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=300" } });
  }
  return new Response(new Uint8Array(e.logo), { headers: { "Content-Type": e.logoTipo ?? "image/png", "Cache-Control": "public, max-age=300" } });
}
