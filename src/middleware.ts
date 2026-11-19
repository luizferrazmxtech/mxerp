import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, usuarioDoToken } from "@/lib/auth/sessao";
import { podeAcessar } from "@/lib/auth/permissoes";

/** Toda página, ação e API exige login, menos a tela de login, a rota do agendador e o webhook do Inter (que têm senha própria). */
const LIVRES = ["/login", "/api/inter/sincronizar", "/api/contratos/processar"];

export async function middleware(req: NextRequest) {
  const caminho = req.nextUrl.pathname;
  if (LIVRES.includes(caminho) || caminho.startsWith("/api/inter/webhook/") || ["/proposta/", "/cobranca/", "/compra/", "/cotacao/"].some((p) => caminho.startsWith(p))) return NextResponse.next(); // links públicos (proposta, cobrança, compra e cotação)
  const usuario = await usuarioDoToken(req.cookies.get(COOKIE)?.value);
  const api = caminho.startsWith("/api/");
  if (!usuario) {
    if (api) return NextResponse.json({ erro: "faça login" }, { status: 401 });
    const url = new URL("/login", req.url);
    if (caminho !== "/") url.searchParams.set("voltar", caminho + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  if (!podeAcessar(usuario.papel, caminho)) {
    if (api || req.method !== "GET") return NextResponse.json({ erro: "sem permissão" }, { status: 403 });
    return NextResponse.redirect(new URL("/?negado=1", req.url));
  }
  return NextResponse.next();
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
