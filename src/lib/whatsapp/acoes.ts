"use server";

import { revalidatePath } from "next/cache";
import type { PapelUsuario } from "@prisma/client";
import { exigirUsuario } from "@/lib/auth/atual";
import { enviarWhatsapp, salvarConfigWhatsapp } from "./mxchat";
import { enviarWhatsappOsTela } from "./os";

export type Resultado = { ok: boolean; mensagem: string } | null;
const ATENDE: PapelUsuario[] = ["ADMIN", "GERENTE", "OPERADOR", "TECNICO", "CAIXA"];
const erro = (e: unknown) => ({ ok: false, mensagem: e instanceof Error ? e.message : String(e) });
const str = (x: FormDataEntryValue | null) => String(x ?? "").trim();

/** Configurações → WhatsApp (MXChat): só o administrador salva o token. Com número de teste, manda uma mensagem de teste. */
export async function salvarWhatsappAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario(["ADMIN"]);
  try {
    await salvarConfigWhatsapp({
      ativo: form.get("ativo") === "on", url: str(form.get("url")), token: String(form.get("token") ?? ""), apagarToken: form.get("apagarToken") === "on",
      salvarNoTicket: form.get("salvarNoTicket") === "on", convidarAreaCliente: form.get("convidarAreaCliente") === "on",
    });
    revalidatePath("/whatsapp");
    const teste = str(form.get("teste"));
    if (teste) {
      const m = await enviarWhatsapp({ numero: teste, texto: "Teste do MXERP: se você recebeu esta mensagem, o envio por WhatsApp (MXChat) está funcionando.", entidade: "TESTE", usuarioNome: u.nome });
      revalidatePath("/whatsapp");
      return { ok: true, mensagem: `Configuração salva e mensagem de teste enviada para ${m.numero}` };
    }
    return { ok: true, mensagem: "Configuração do WhatsApp salva" };
  } catch (e) { revalidatePath("/whatsapp"); return erro(e); }
}

/** Visualização da OS → Compartilhar → WhatsApp (MXChat). */
export async function enviarWhatsappOsAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario(ATENDE);
  const id = str(form.get("id"));
  try {
    const m = await enviarWhatsappOsTela(id, { numero: str(form.get("numero")), texto: String(form.get("texto") ?? ""), convidar: form.get("convidar") === "on", usuarioNome: u.nome });
    revalidatePath(`/os/${id}`);
    return { ok: true, mensagem: `Mensagem enviada para ${m.numero}. Ela fica na aba Envios.` };
  } catch (e) { revalidatePath(`/os/${id}`); return erro(e); }
}
