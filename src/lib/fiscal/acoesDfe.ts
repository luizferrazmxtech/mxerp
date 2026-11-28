"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { baixarXmlCompleto, baixarXmlsPendentes, manifestar, sincronizarDfe, MANIFESTACOES, PRAZO_MANIFESTACAO_DIAS, type TipoManifestacao } from "./dfe";

type Res = { ok: boolean; mensagem: string } | null;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const CAMINHO = "/compras/notas-recebidas";

export async function sincronizarDfeAcao(_: Res, form: FormData): Promise<Res> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    // sem empresa no formulário: a loja atual
    const r = await sincronizarDfe({ empresaId: String(form.get("empresaId") ?? "") || undefined });
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
    return { ok: true, mensagem: `${MANIFESTACOES[tipo].rotulo} registrada${tipo === "CIENCIA" || (tipo === "CONFIRMADA" && !n.xml) ? ". O XML completo chega sozinho na próxima busca (a SEFAZ leva de minutos a algumas horas para liberar)." : "."}` };
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

/** Ciência da operação em lote nas notas sem manifestação (libera o XML completo de todas). Até 20 por vez. */
export async function cienciaEmLoteAcao(_: Res, form: FormData): Promise<Res> {
  void form;
  await exigirUsuario(["ADMIN", "GERENTE"]);
  const notas = await prisma.notaRecebida.findMany({
    where: { manifestacao: null, situacao: "AUTORIZADA", emissao: { gt: new Date(Date.now() - PRAZO_MANIFESTACAO_DIAS * 86400_000) } },
    orderBy: { emissao: "asc" }, take: 20, select: { id: true },
  });
  if (!notas.length) return { ok: true, mensagem: "Nenhuma nota sem manifestação" };
  let ok = 0;
  const erros: string[] = [];
  for (const n of notas) {
    try { await manifestar(n.id, "CIENCIA"); ok++; } catch (e) { erros.push(msg(e)); if (erros.length >= 3) break; }
  }
  revalidatePath(CAMINHO);
  return { ok: !erros.length, mensagem: `Ciência registrada em ${ok} nota(s)${erros.length ? `. Erro: ${erros[0]}` : ". Os XMLs completos chegam sozinhos nas próximas buscas."}` };
}

/** Pede de novo agora o XML completo das notas com ciência que ainda não têm (loja atual). */
export async function baixarXmlsPendentesAcao(_: Res, form: FormData): Promise<Res> {
  void form;
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const r = await baixarXmlsPendentes({ limite: 20 });
    revalidatePath(CAMINHO);
    if (r.espera && !r.baixados) return { ok: false, mensagem: r.espera };
    return { ok: !!r.baixados || !r.aguardando, mensagem: r.baixados || r.aguardando ? `${r.baixados} XML(s) baixado(s)${r.aguardando ? `, ${r.aguardando} ainda não liberado(s) pela SEFAZ (o agendador tenta de hora em hora)` : ""}${r.espera ? `. ${r.espera}` : ""}` : "Nenhuma nota aguardando XML há mais de 1 hora (as recentes chegam sozinhas na busca, e cada nota é pedida no máximo uma vez por hora)" };
  } catch (e) {
    return { ok: false, mensagem: msg(e) };
  }
}
