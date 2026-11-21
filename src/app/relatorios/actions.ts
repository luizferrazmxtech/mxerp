"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { enviarResumoSemanal, salvarConfigResumo } from "@/lib/relatorios/resumoSemanal";
import { normalizarFavorito, type Favorito } from "@/lib/relatorios/favoritos";
import type { Resultado } from "@/components/financeiro/FormAcao";

const erro = (e: unknown): Resultado => ({ ok: false, mensagem: e instanceof Error ? e.message : String(e) });

export async function salvarResumoAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    await salvarConfigResumo({ ativo: form.get("ativo") === "1", numeros: String(form.get("numeros") ?? ""), diaSemana: Number(form.get("dia") ?? 1), hora: Number(form.get("hora") ?? 8) });
    revalidatePath("/relatorios/resumo-whatsapp");
    return { ok: true, mensagem: "Resumo semanal salvo" };
  } catch (e) { return erro(e); }
}

export async function testarResumoAcao(): Promise<Resultado> {
  const u = await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const r = await enviarResumoSemanal({ forcar: true, usuarioNome: u.nome });
    if (!r.enviado) return { ok: false, mensagem: r.motivo ?? "Não foi enviado" };
    return { ok: true, mensagem: `Resumo mandado para ${r.enviado} número(s).${r.erros?.length ? ` Falhou em ${r.erros.length}: ${r.erros[0]}` : ""}` };
  } catch (e) { return erro(e); }
}

type Prefs = { favoritosRelatorios?: Favorito[] };

/** Guarda o filtro atual (endereço do relatório com período, loja, vendedor…) com um nome, para o usuário logado. */
export async function salvarFavoritoAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario();
  try {
    const f = normalizarFavorito(String(form.get("nome") ?? ""), String(form.get("url") ?? ""));
    const atual = (u.preferencias ?? {}) as Prefs;
    const lista = [f, ...(atual.favoritosRelatorios ?? []).filter((x) => x.nome !== f.nome)].slice(0, 20);
    await prisma.usuario.update({ where: { id: u.id }, data: { preferencias: { ...atual, favoritosRelatorios: lista } as Prisma.InputJsonValue } });
    revalidatePath("/relatorios", "layout");
    return { ok: true, mensagem: `Filtro "${f.nome}" salvo` };
  } catch (e) { return erro(e); }
}

export async function excluirFavoritoAcao(nome: string) {
  const u = await exigirUsuario();
  const atual = (u.preferencias ?? {}) as Prefs;
  await prisma.usuario.update({ where: { id: u.id }, data: { preferencias: { ...atual, favoritosRelatorios: (atual.favoritosRelatorios ?? []).filter((x) => x.nome !== nome) } as Prisma.InputJsonValue } });
  revalidatePath("/relatorios", "layout");
}
