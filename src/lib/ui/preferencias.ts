"use server";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth/atual";

type Prefs = { colunas?: Record<string, string[]> };

/** Grava as colunas escolhidas em "Gerenciar colunas" para o usuário logado. */
export async function salvarColunas(lista: string, colunas: string[]) {
  const u = await exigirUsuario();
  const atual = (u.preferencias ?? {}) as Prefs;
  const novo: Prefs = { ...atual, colunas: { ...(atual.colunas ?? {}), [lista]: colunas.slice(0, 30).map(String) } };
  await prisma.usuario.update({ where: { id: u.id }, data: { preferencias: novo as Prisma.InputJsonValue } });
}
