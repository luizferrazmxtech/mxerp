import { NextResponse, type NextRequest } from "next/server";
import { lojasDoUsuario } from "@/lib/empresa/atual";
import { COOKIE_LOJA } from "@/lib/empresa/loja";
import { destinoSeguro } from "@/lib/empresa/abrirNaEmpresa";

/**
 * Abre um documento de outra empresa do grupo: troca a empresa selecionada (se o usuário tem acesso a ela) e vai
 * para a tela pedida. Ex.: NFS-e da VFX gerada por uma OS da MXTECH → "Abrir OS #7097 na MXTECH".
 */
export async function GET(req: NextRequest) {
  const loja = req.nextUrl.searchParams.get("loja") ?? "";
  const ir = destinoSeguro(req.nextUrl.searchParams.get("ir"));
  const lojas = await lojasDoUsuario();
  // Location relativa: atrás do proxy (VPS) req.url é http://localhost:3000, e o navegador iria para lá
  const res = new NextResponse(null, { status: 303, headers: { Location: ir } });
  if (lojas.some((l) => l.id === loja)) {
    res.cookies.set(COOKIE_LOJA, loja, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86400 });
  }
  // sem acesso à outra empresa: abre o documento mesmo assim (a consulta por id não é filtrada), sem trocar
  return res;
}
