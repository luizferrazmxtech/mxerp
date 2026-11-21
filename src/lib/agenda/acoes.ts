"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/lib/auth/atual";
import { salvarConfigAgenda, sincronizarAgenda, testarAgendas } from "./google";

export type Resultado = { ok: boolean; mensagem: string } | null;
const erro = (e: unknown) => ({ ok: false as const, mensagem: e instanceof Error ? e.message : String(e) });
const str = (x: FormDataEntryValue | null) => String(x ?? "").trim();

/** Configurações → Integrações → Google Agenda (só o administrador). Confere as agendas depois de salvar. */
export async function salvarAgendaAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN"]);
  try {
    const arq = form.get("arquivo");
    const json = arq instanceof File && arq.size ? await arq.text() : str(form.get("json"));
    const equipes: Record<string, string> = {};
    for (const [k, v] of form.entries()) if (k.startsWith("equipe:")) equipes[k.slice(7)] = String(v);
    const c = await salvarConfigAgenda({ ativo: form.get("ativo") === "on", json, apagarChave: form.get("apagarChave") === "on", agendaPadrao: str(form.get("agendaPadrao")), duracaoPadraoMin: Number(str(form.get("duracaoPadraoMin"))) || 120, equipes });
    revalidatePath("/google-agenda");
    revalidatePath("/os/agenda");
    if (!c.ativo) return { ok: true, mensagem: "Configuração salva (Google Agenda desligado)" };
    return await testarAgendas();
  } catch (e) { return erro(e); }
}

/** Reenvia todas as OS agendadas de hoje em diante (depois de ligar ou trocar a agenda de uma equipe). */
export async function reenviarAgendaAcao(_: Resultado, form: FormData): Promise<Resultado> {
  void form;
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const r = await sincronizarAgenda({ todas: true });
    revalidatePath("/os/agenda");
    if ("ignorado" in r) return { ok: false, mensagem: r.ignorado ?? "" };
    return { ok: !r.erros.length, mensagem: `${r.total} OS: ${r.criados} criadas, ${r.atualizados} atualizadas, ${r.removidos} removidas${r.erros.length ? `. ${r.erros.length} com erro: ${r.erros[0]}` : ""}` };
  } catch (e) { return erro(e); }
}
