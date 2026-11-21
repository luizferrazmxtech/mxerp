import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, adminDoToken } from "@/lib/auth";

const LIVRES = ["/login", "/primeiro-acesso", "/api/licenca", "/api/processar", "/api/saude"];

export async function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  if (LIVRES.includes(p) || p.startsWith("/api/inter/webhook/") || p.startsWith("/boleto/") || p.startsWith("/marca/")) return NextResponse.next();
  if (await adminDoToken(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (p.startsWith("/api/")) return NextResponse.json({ erro: "faça login" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = { runtime: "nodejs", matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
