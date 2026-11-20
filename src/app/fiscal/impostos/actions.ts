"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth/atual";
import { lojaAtual } from "@/lib/empresa/atual";
import { aliquotasDoMes, mesAnterior, soDigitos } from "@/lib/fiscal/impostos";

export type Res = { ok: boolean; mensagem: string } | null;

/** Grava as alíquotas efetivas do mês (uma linha por CNAE; "*" = demais atividades). Linha sem alíquota é apagada. */
export async function salvarAliquotas(_: Res, form: FormData): Promise<Res> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const e = await lojaAtual();
    if (!e) throw new Error("Cadastre a empresa antes");
    const competencia = String(form.get("competencia") ?? "");
    if (!/^\d{4}-\d{2}$/.test(competencia)) throw new Error("Mês inválido");
    const cnaes = form.getAll("cnae").map(String), descs = form.getAll("descricao").map(String), aliqs = form.getAll("aliquota").map(String);
    const linhas = cnaes.map((c, i) => ({ cnae: c.trim() === "*" ? "*" : soDigitos(c), descricao: descs[i]?.trim() || null, aliquota: aliqs[i]?.trim().replace(",", ".") }))
      .filter((l) => l.cnae && l.aliquota);
    for (const l of linhas) {
      const v = Number(l.aliquota);
      if (!(v >= 0 && v < 100)) throw new Error(`Alíquota inválida para o CNAE ${l.cnae}: ${l.aliquota}`);
      if (l.cnae !== "*" && l.cnae.length !== 7) throw new Error(`O CNAE tem 7 dígitos: ${l.cnae}`);
    }
    await prisma.$transaction([
      prisma.aliquotaSimples.deleteMany({ where: { empresaId: e.id, competencia, cnae: { notIn: linhas.map((l) => l.cnae) } } }),
      ...linhas.map((l) => prisma.aliquotaSimples.upsert({
        where: { empresaId_competencia_cnae: { empresaId: e.id, competencia, cnae: l.cnae } },
        create: { empresaId: e.id, competencia, cnae: l.cnae, descricao: l.descricao, aliquota: l.aliquota! },
        update: { descricao: l.descricao, aliquota: l.aliquota! },
      })),
    ]);
    revalidatePath("/fiscal");
    return { ok: true, mensagem: `Alíquotas de ${competencia.split("-").reverse().join("/")} salvas.` };
  } catch (err) {
    return { ok: false, mensagem: err instanceof Error ? err.message : "Erro inesperado" };
  }
}

/** Repete no mês as alíquotas do mês anterior (o contador costuma mudar pouco de um mês para o outro). */
export async function copiarMesAnterior(_: Res, form: FormData): Promise<Res> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  const e = await lojaAtual();
  if (!e) return { ok: false, mensagem: "Cadastre a empresa antes" };
  const competencia = String(form.get("competencia"));
  const ant = await aliquotasDoMes(e.id, mesAnterior(competencia));
  if (!ant.length) return { ok: false, mensagem: "O mês anterior não tem alíquotas" };
  for (const a of ant)
    await prisma.aliquotaSimples.upsert({
      where: { empresaId_competencia_cnae: { empresaId: e.id, competencia, cnae: a.cnae } },
      create: { empresaId: e.id, competencia, cnae: a.cnae, descricao: a.descricao, aliquota: a.aliquota },
      update: {},
    });
  revalidatePath("/fiscal");
  return { ok: true, mensagem: "Alíquotas copiadas do mês anterior: confira com o e-mail do contador." };
}
