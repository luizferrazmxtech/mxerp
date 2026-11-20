import { cookies } from "next/headers";
import type { Empresa } from "@prisma/client";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { COOKIE_LOJA, escolherLoja, lojasPermitidas } from "./loja";

/** Lojas (empresas) que o usuário logado pode usar, na ordem de cadastro. */
export async function lojasDoUsuario(): Promise<Empresa[]> {
  const u = await usuarioAtual();
  if (!u) return [];
  const todas = await prisma.empresa.findMany({ orderBy: { createdAt: "asc" } });
  const ids = new Set(lojasPermitidas(todas, u.lojas ?? []).map((e) => e.id));
  return todas.filter((e) => ids.has(e.id));
}

/** Empresa da loja atual (a do cookie, se permitida; senão a primeira). null se nenhuma empresa foi cadastrada. */
export async function lojaAtual(): Promise<Empresa | null> {
  const lojas = await lojasDoUsuario();
  const id = escolherLoja(lojas, (await cookies()).get(COOKIE_LOJA)?.value);
  return lojas.find((e) => e.id === id) ?? null;
}

/** Empresa dona de um documento; sem loja gravada, a loja atual (ou a primeira cadastrada). */
export async function empresaDoDocumento(empresaId: string | null | undefined): Promise<Empresa | null> {
  if (empresaId) {
    const e = await prisma.empresa.findUnique({ where: { id: empresaId } });
    if (e) return e;
  }
  try {
    const atual = await lojaAtual();
    if (atual) return atual;
  } catch { /* fora de uma requisição (agendador) */ }
  return prisma.empresa.findFirst({ orderBy: { createdAt: "asc" } });
}

export const nomeLoja = (e: { nomeFantasia: string | null; razaoSocial: string }) => e.nomeFantasia || e.razaoSocial;
