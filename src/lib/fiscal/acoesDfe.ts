"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/lib/auth/atual";
import { baixarXmlCompleto, manifestar, sincronizarDfe, MANIFESTACOES, type TipoManifestacao } from "./dfe";

type Res = { ok: boolean; mensagem: string } | null;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const CAMINHO = "/compras/notas-recebidas";

export async function sincronizarDfeAcao(_: Res, form: FormData): Promise<Res> {
  void form;
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const r = await sincronizarDfe();
    revalidatePath(CAMINHO);
    return { ok: !r.aguardar, mensagem: r.mensagem };
  } catch (e) {
    return { ok: false, mensagem: msg(e) };
  }
}

export async function manifestarAcao(_: Res, form: FormData): Promise<Res> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  const tipo = String(form.get("tipo")) as TipoManifestacao;
  if (!(tipo in MANIFESTACOES)) return { ok: false, mensagem: "Escolha a manifestação" };
  try {
    const n = await manifestar(String(form.get("id")), tipo, String(form.get("justificativa") ?? "") || undefined);
    revalidatePath(CAMINHO);
    return { ok: true, mensagem: `${MANIFESTACOES[tipo].rotulo} registrada${n.xml ? ". XML completo baixado." : ". O XML completo pode levar alguns minutos para ficar disponível."}` };
  } catch (e) {
    return { ok: false, mensagem: msg(e) };
  }
}

export async function baixarXmlAcao(_: Res, form: FormData): Promise<Res> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    await baixarXmlCompleto(String(form.get("id")));
    revalidatePath(CAMINHO);
    return { ok: true, mensagem: "XML completo baixado" };
  } catch (e) {
    return { ok: false, mensagem: msg(e) };
  }
}
