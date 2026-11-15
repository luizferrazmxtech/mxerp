"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { autenticar, COOKIE, criarSessao, DURACAO_MS, encerrarSessao } from "@/lib/auth/sessao";
import { podeAcessar } from "@/lib/auth/permissoes";
import { hashSenha } from "@/lib/auth/senha";
import { prisma } from "@/lib/db";

export type EstadoLogin = { erro: string } | null;

async function ipEProtocolo() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local";
  const https = h.get("x-forwarded-proto") === "https";
  return { ip, https };
}

export async function entrar(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const email = String(form.get("email") ?? "");
  const senha = String(form.get("senha") ?? "");
  const voltar = String(form.get("voltar") ?? "/");
  const { ip, https } = await ipEProtocolo();
  let usuario;
  try {
    usuario = await autenticar(email, senha, ip);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
  if (!usuario) return { erro: "E-mail ou senha incorretos" };
  const token = await criarSessao(usuario.id, ip);
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: https, path: "/", maxAge: DURACAO_MS / 1000 });
  const destino = voltar.startsWith("/") && !voltar.startsWith("//") ? voltar : "/";
  redirect(podeAcessar(usuario.papel, destino.split("?")[0]) ? destino : "/");
}

export async function sair() {
  const c = await cookies();
  await encerrarSessao(c.get(COOKIE)?.value);
  c.delete(COOKIE);
  redirect("/login");
}

export async function criarPrimeiroAdmin(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const email = String(form.get("email") ?? "").toLowerCase().trim();
  const senha = String(form.get("senha") ?? "");
  if (senha !== String(form.get("confirma") ?? "")) return { erro: "As senhas não batem" };
  let id: string;
  try {
    const senhaHash = await hashSenha(senha);
    id = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(4242)`;
      if ((await tx.usuario.count()) > 0) throw new Error("O administrador já foi criado. Entre com e-mail e senha.");
      return (await tx.usuario.create({ data: { email, nome: String(form.get("nome") ?? "").trim() || email, papel: "ADMIN", senhaHash } })).id;
    });
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
  const { ip, https } = await ipEProtocolo();
  (await cookies()).set(COOKIE, await criarSessao(id, ip), { httpOnly: true, sameSite: "lax", secure: https, path: "/", maxAge: DURACAO_MS / 1000 });
  redirect("/usuarios");
}
