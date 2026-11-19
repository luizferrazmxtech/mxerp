"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PrioridadeChamado, StatusChamado } from "@prisma/client";
import { exigirUsuario } from "@/lib/auth/atual";
import { parseDia } from "@/lib/datas";
import type { Resultado } from "@/components/financeiro/FormAcao";
import { abrirChamado, atualizarChamado, comentarChamado, vincularOs, ROTULO_PRIORIDADE, ROTULO_STATUS } from "./chamados";

const str = (x: FormDataEntryValue | null) => String(x ?? "").trim();
const msg = (e: unknown) => (e instanceof Error && !(e as { code?: string }).code ? e.message : "Não foi possível salvar o chamado");
const prioridade = (x: string) => (x in ROTULO_PRIORIDADE ? (x as PrioridadeChamado) : undefined);
/** prazo vem como "AAAA-MM-DD" (fim do expediente, 18h de Brasília) ou "AAAA-MM-DDTHH:MM" */
const prazo = (x: string) => !x ? null : x.includes("T") ? new Date(`${x}:00-03:00`) : new Date(parseDia(x).getTime() + 21 * 3600_000);

export async function abrirChamadoAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario();
  let id: string;
  try {
    const c = await abrirChamado({
      clienteId: str(form.get("clienteId")) || null, contato: str(form.get("contato")), telefone: str(form.get("telefone")),
      assunto: str(form.get("assunto")), descricao: str(form.get("descricao")), canal: str(form.get("canal")), categoria: str(form.get("categoria")),
      prioridade: prioridade(str(form.get("prioridade"))), responsavelId: str(form.get("responsavelId")) || null,
      prazo: str(form.get("prazo")) ? prazo(str(form.get("prazo"))) : undefined,
    }, u);
    id = c.id;
  } catch (e) { return { ok: false, mensagem: msg(e) }; }
  revalidatePath("/chamados");
  redirect(`/chamados/${id}`);
}

export async function atualizarChamadoAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario();
  const id = str(form.get("id"));
  try {
    const status = str(form.get("status"));
    await atualizarChamado(id, {
      status: status in ROTULO_STATUS ? (status as StatusChamado) : undefined,
      prioridade: prioridade(str(form.get("prioridade"))),
      ...(form.has("responsavelId") ? { responsavelId: str(form.get("responsavelId")) || null } : {}),
      ...(form.has("prazo") ? { prazo: prazo(str(form.get("prazo"))) } : {}),
      ...(form.has("solucao") ? { solucao: str(form.get("solucao")) } : {}),
      ...(form.has("assunto") ? { assunto: str(form.get("assunto")) } : {}),
      ...(form.has("categoria") ? { categoria: str(form.get("categoria")) } : {}),
    }, u);
  } catch (e) { return { ok: false, mensagem: msg(e) }; }
  revalidatePath(`/chamados/${id}`);
  revalidatePath("/chamados");
  return { ok: true, mensagem: "Chamado atualizado" };
}

export async function comentarChamadoAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario();
  const id = str(form.get("id"));
  try {
    await comentarChamado(id, str(form.get("texto")), u, { interno: form.get("interno") === "on" });
  } catch (e) { return { ok: false, mensagem: msg(e) }; }
  revalidatePath(`/chamados/${id}`);
  return { ok: true, mensagem: "Comentário registrado" };
}

export async function vincularOsAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario();
  const id = str(form.get("id"));
  try {
    const n = Number(str(form.get("numeroOs")).replace(/\D/g, ""));
    if (!n) return { ok: false, mensagem: "Informe o número da OS" };
    await vincularOs(id, n, u);
  } catch (e) { return { ok: false, mensagem: msg(e) }; }
  revalidatePath(`/chamados/${id}`);
  return { ok: true, mensagem: "OS vinculada" };
}
