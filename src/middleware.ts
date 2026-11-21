import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, usuarioDoToken } from "@/lib/auth/sessao";
import { podeAcessar } from "@/lib/auth/permissoes";
import { licencaAtual } from "@/lib/licenca/licenca";

/** Toda página, ação e API exige login, menos a tela de login, a rota do agendador e o webhook do Inter (que têm senha própria). */
const LIVRES = ["/login", "/api/saude", "/api/inter/sincronizar", "/api/contratos/processar", "/api/dfe/sincronizar"];

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
  // mensalidade da revenda em atraso (só quando o sistema é de um cliente da Central): bloqueado não entra
  const licenca = await licencaAtual();
  if (licenca?.situacao === "BLOQUEADO" && caminho !== "/licenca") {
    if (api || req.method !== "GET") return NextResponse.json({ erro: licenca.mensagem ?? "Sistema bloqueado" }, { status: 402 });
    return NextResponse.redirect(new URL("/licenca", req.url));
  }
  // "só leitura" é barrado na gravação do banco (extensão em src/lib/db.ts), para a consulta e a troca de loja seguirem
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
