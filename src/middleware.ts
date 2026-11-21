import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, usuarioDoToken } from "@/lib/auth/sessao";
import { podeAcessar } from "@/lib/auth/permissoes";
import { COOKIE_CLIENTE, clienteDoToken } from "@/lib/portal/sessao";

/** Área do Cliente: telas que abrem sem login do cliente. */
const PORTAL_LIVRES = ["/area-cliente/entrar", "/area-cliente/esqueci", "/area-cliente/logo"];

/** Área do Cliente (/area-cliente): sessão própria do cliente, nunca a dos funcionários. */
async function portal(req: NextRequest, caminho: string) {
  const cabecalhos = new Headers(req.headers);
  cabecalhos.set("x-mx-portal", "1"); // o layout raiz não desenha o menu do ERP
  const seguir = () => NextResponse.next({ request: { headers: cabecalhos } });
  if (PORTAL_LIVRES.includes(caminho) || caminho.startsWith("/area-cliente/senha/")) return seguir();
  if (await clienteDoToken(req.cookies.get(COOKIE_CLIENTE)?.value)) return seguir();
  if (caminho.startsWith("/area-cliente/arquivos/")) return new NextResponse("Entre na Área do Cliente", { status: 401 });
  const url = new URL("/area-cliente/entrar", req.url);
  if (caminho !== "/area-cliente") url.searchParams.set("voltar", caminho + req.nextUrl.search);
  return NextResponse.redirect(url);
}

/** Toda página, ação e API exige login, menos a tela de login, a rota do agendador e o webhook do Inter (que têm senha própria). */
const LIVRES = ["/login", "/api/saude", "/api/inter/sincronizar", "/api/contratos/processar", "/api/dfe/sincronizar"];

export async function middleware(req: NextRequest) {
  const caminho = req.nextUrl.pathname;
  if (caminho === "/area-cliente" || caminho.startsWith("/area-cliente/")) return portal(req, caminho);
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
