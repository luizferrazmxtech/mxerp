"use server";

import { prisma } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth/atual";
import { conferirSenha, hashSenha } from "@/lib/auth/senha";

export type Estado = { ok: boolean; mensagem: string } | null;

export async function trocarSenha(_: Estado, form: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  const nova = String(form.get("nova") ?? "");
  if (nova !== String(form.get("confirma") ?? "")) return { ok: false, mensagem: "A confirmação não bate com a nova senha" };
  if (!u.senhaHash || !(await conferirSenha(String(form.get("atual") ?? ""), u.senhaHash))) return { ok: false, mensagem: "Senha atual incorreta" };
  try {
    await prisma.usuario.update({ where: { id: u.id }, data: { senhaHash: await hashSenha(nova) } });
    return { ok: true, mensagem: "Senha trocada" };
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : String(e) };
  }
}
