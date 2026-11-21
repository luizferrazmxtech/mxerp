"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth/atual";

/** Equipes de técnicos (Ordens de serviços › Opções auxiliares › Equipes). */

export type Resultado = { ok: boolean; mensagem: string } | null;
const GER = ["ADMIN", "GERENTE"] as const;

export async function salvarEquipeAcao(_: Resultado, f: FormData): Promise<Resultado> {
  await exigirUsuario([...GER]);
  const id = String(f.get("id") ?? "").trim();
  const nome = String(f.get("nome") ?? "").trim();
  const ativo = f.get("ativo") !== "0";
  const membros = [...new Set(f.getAll("membros").map(String).filter(Boolean))];
  if (!nome) return { ok: false, mensagem: "Informe o nome da equipe" };
  if (!membros.length) return { ok: false, mensagem: "Marque ao menos um técnico" };
  try {
    const existentes = await prisma.usuario.count({ where: { id: { in: membros } } });
    if (existentes !== membros.length) return { ok: false, mensagem: "Funcionário não encontrado" };
    if (id) await prisma.equipe.update({ where: { id }, data: { nome, ativo, membros } });
    else await prisma.equipe.create({ data: { nome, ativo, membros } });
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error && /Unique/.test(e.message) ? `Já existe a equipe ${nome}` : e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/os/equipes");
  redirect("/os/equipes");
}

export async function excluirEquipeAcao(id: string) {
  await exigirUsuario([...GER]);
  const n = await prisma.ordemServico.count({ where: { equipeId: id, situacao: { in: ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_PECA", "AGUARDANDO_APROVACAO"] } } });
  if (n) return { ok: false, mensagem: `${n} OS em aberto usam esta equipe. Troque a equipe delas ou desative a equipe.` };
  await prisma.equipe.delete({ where: { id } });
  revalidatePath("/os/equipes");
  return { ok: true, mensagem: "Equipe excluída" };
}
