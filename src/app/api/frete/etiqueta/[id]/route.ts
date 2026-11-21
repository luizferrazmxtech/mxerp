import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth/atual";
import { linkEtiqueta } from "@/lib/frete/melhorEnvio";

/** Imprimir etiqueta: pede ao Melhor Envio o link do PDF e redireciona. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await usuarioAtual())) return NextResponse.json({ erro: "Entre no sistema" }, { status: 401 });
  try {
    return NextResponse.redirect(await linkEtiqueta((await params).id));
  } catch (e) {
    return new NextResponse(`Não foi possível abrir a etiqueta: ${e instanceof Error ? e.message : String(e)}`, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
