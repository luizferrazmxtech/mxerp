"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/lib/auth/atual";
import { enviarPacote, salvarConfigContador } from "./contador";

export type Resultado = { ok: boolean; mensagem: string } | null;
const str = (x: FormDataEntryValue | null) => String(x ?? "").trim();
const erro = (e: unknown) => ({ ok: false, mensagem: e instanceof Error ? e.message : String(e) });

export async function salvarContadorAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    await salvarConfigContador({
      ativo: form.get("ativo") === "on", escritorio: str(form.get("escritorio")), emails: str(form.get("emails")), diaEnvio: Number(str(form.get("diaEnvio"))) || 5,
      incluirRecebidas: form.get("incluirRecebidas") === "on", mensagem: String(form.get("mensagem") ?? ""),
      cienciaAutomatica: form.get("cienciaAutomatica") === "on", confirmarCompra: form.get("confirmarCompra") === "on",
    });
    revalidatePath("/contador");
    return { ok: true, mensagem: "Configuração do contador salva" };
  } catch (e) { return erro(e); }
}

export async function enviarContadorAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const e = await enviarPacote(str(form.get("empresaId")), str(form.get("mes")), { usuarioNome: u.nome });
    revalidatePath("/contador");
    return { ok: true, mensagem: `Enviado para ${e.destinatarios} (${e.arquivos} arquivos)` };
  } catch (e) { revalidatePath("/contador"); return erro(e); }
}
