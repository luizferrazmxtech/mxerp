"use server";

import { revalidatePath } from "next/cache";
import type { PapelUsuario } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth/atual";
import { hashSenha } from "@/lib/auth/senha";

export type Estado = { ok: boolean; mensagem: string } | null;
const str = (x: FormDataEntryValue | null) => String(x ?? "").trim();
const PAPEIS: PapelUsuario[] = ["ADMIN", "GERENTE", "OPERADOR", "TECNICO", "CAIXA"];
const papel = (x: string) => (PAPEIS.includes(x as PapelUsuario) ? (x as PapelUsuario) : "OPERADOR");

export async function criarUsuario(_: Estado, form: FormData): Promise<Estado> {
  await exigirUsuario(["ADMIN"]);
  try {
    const email = str(form.get("email")).toLowerCase();
    if (!email.includes("@")) throw new Error("E-mail inválido");
    if (await prisma.usuario.findUnique({ where: { email } })) throw new Error("Já existe usuário com esse e-mail");
    await prisma.usuario.create({
      data: {
        nome: str(form.get("nome")) || email, email, papel: papel(str(form.get("papel"))),
        tecnico: form.get("tecnico") === "on", vendedor: form.get("vendedor") === "on",
        senhaHash: await hashSenha(str(form.get("senha"))),
      },
    });
    revalidatePath("/usuarios");
    return { ok: true, mensagem: "Usuário criado. Passe a senha para a pessoa e peça para ela trocar em Minha senha." };
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : String(e) };
  }
}

export async function alterarUsuario(form: FormData) {
  const eu = await exigirUsuario(["ADMIN"]);
  const id = str(form.get("id"));
  const ativo = form.get("ativo") === "on";
  const novo = papel(str(form.get("papel")));
  if (id === eu.id && (!ativo || novo !== "ADMIN")) throw new Error("Você não pode tirar o seu próprio acesso de administrador");
  await prisma.usuario.update({ where: { id }, data: { papel: novo, ativo, tecnico: form.get("tecnico") === "on", vendedor: form.get("vendedor") === "on" } });
  if (!ativo) await prisma.sessao.deleteMany({ where: { usuarioId: id } });
  revalidatePath("/usuarios");
}

export async function redefinirSenha(_: Estado, form: FormData): Promise<Estado> {
  await exigirUsuario(["ADMIN"]);
  try {
    const id = str(form.get("id"));
    await prisma.usuario.update({ where: { id }, data: { senhaHash: await hashSenha(str(form.get("senha"))) } });
    await prisma.sessao.deleteMany({ where: { usuarioId: id } });
    return { ok: true, mensagem: "Senha redefinida" };
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : String(e) };
  }
}
