import { NextResponse } from "next/server";
import { usuarioAtual } from "@/lib/auth/atual";
import { podeAcessar } from "@/lib/auth/permissoes";
import { montarPacote, configContador } from "@/lib/contador/contador";

/** Contador → Baixar o pacote de um mês (para conferir antes de mandar ou entregar por outro meio). */
export async function GET(req: Request) {
  const u = await usuarioAtual();
  if (!u || !podeAcessar(u.papel, "/contador")) return NextResponse.json({ erro: "sem permissão" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  try {
    const p = await montarPacote(String(sp.get("empresa")), String(sp.get("mes")), { incluirRecebidas: (await configContador()).incluirRecebidas });
    return new Response(new Uint8Array(p.zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${p.nome}"` } });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
