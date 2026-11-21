"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { COOKIE, autenticar, criarSessao, encerrarSessao } from "@/lib/auth";
import { hashSenha } from "@/lib/senha";

async function abrirSessao(adminId: string) {
  const https = (await headers()).get("x-forwarded-proto") === "https";
  (await cookies()).set(COOKIE, await criarSessao(adminId), { httpOnly: true, sameSite: "lax", secure: https, path: "/", maxAge: 12 * 3600 });
}

export async function entrar(_: unknown, f: FormData) {
  try {
    const a = await autenticar(String(f.get("email") ?? ""), String(f.get("senha") ?? ""));
    if (!a) return { erro: "E-mail ou senha incorretos" };
    await abrirSessao(a.id);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Erro ao entrar" };
  }
  redirect("/");
}

export async function criarPrimeiro(_: unknown, f: FormData) {
  try {
    if (await prisma.admin.count()) return { erro: "Já existe administrador. Entre pela tela de login." };
    const nome = String(f.get("nome") ?? "").trim(), email = String(f.get("email") ?? "").toLowerCase().trim();
    if (!nome || !email.includes("@")) return { erro: "Informe nome e e-mail" };
    const a = await prisma.admin.create({ data: { nome, email, senhaHash: await hashSenha(String(f.get("senha") ?? "")) } });
    await abrirSessao(a.id);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Erro" };
  }
  redirect("/");
}

export async function sair() {
  const c = await cookies();
  await encerrarSessao(c.get(COOKIE)?.value);
  c.delete(COOKIE);
  redirect("/login");
}
