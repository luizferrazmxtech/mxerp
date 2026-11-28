"use server";

import { exigirAcao, exigirUsuario } from "@/lib/auth/atual";
import { revalidatePath } from "next/cache";
import { cancelarNfse, cancelarNota, consultarNota, emitirNfseOs, emitirNfseVenda, emitirNotaOs, emitirNotaVenda, empresa } from "@/lib/fiscal/emissao";
import { certificadoDaEmpresa } from "@/lib/fiscal/certificado";
import { ClienteSefaz } from "@/lib/fiscal/sefaz";
import { cartaCorrecao, inutilizarNumeracao } from "@/lib/fiscal/inutilizacao";
import { completarNfse } from "@/lib/fiscal/xmlNfse";
import { prisma } from "@/lib/db";

export type Res = { ok: boolean; mensagem: string; notaId?: string } | null;
const s = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const msg = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado");

export async function consultarStatus(_: Res, form: FormData): Promise<Res> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const e = await empresa();
    const modelo = Number(form.get("modelo")) === 65 ? 65 : 55;
    const r = await new ClienteSefaz(certificadoDaEmpresa(e), e.uf!, e.ambienteFiscal === "PRODUCAO" ? 1 : 2).status(modelo);
    return { ok: r.cStat === "107", mensagem: `SEFAZ-SP ${modelo === 65 ? "NFC-e" : "NF-e"}: ${r.cStat} - ${r.xMotivo}` };
  } catch (e) {
    return { ok: false, mensagem: msg(e) };
  }
}

export async function emitirVenda(_: Res, form: FormData): Promise<Res> {
  await exigirUsuario(["ADMIN", "GERENTE", "OPERADOR", "CAIXA"]);
  const vendaId = s(form.get("vendaId"));
  try {
    const n = await emitirNotaVenda(vendaId, Number(form.get("modelo")) === 55 ? 55 : 65);
    revalidatePath(`/vendas/${vendaId}`);
    return { ok: n.status === "AUTORIZADA", mensagem: n.status === "AUTORIZADA" ? `Nota ${n.numero} autorizada.` : `Nota ${n.numero} ${n.status.toLowerCase()}: ${n.motivo}`, notaId: n.id };
  } catch (e) {
    revalidatePath(`/vendas/${vendaId}`);
    return { ok: false, mensagem: msg(e) };
  }
}

export async function emitirOs(_: Res, form: FormData): Promise<Res> {
  await exigirUsuario(["ADMIN", "GERENTE", "OPERADOR", "CAIXA"]);
  const osId = s(form.get("osId"));
  try {
    const n = await emitirNotaOs(osId);
    revalidatePath(`/os/${osId}`);
    return { ok: n.status === "AUTORIZADA", mensagem: n.status === "AUTORIZADA" ? `NF-e ${n.numero} autorizada.` : `NF-e ${n.numero} ${n.status.toLowerCase()}: ${n.motivo}`, notaId: n.id };
  } catch (e) {
    revalidatePath(`/os/${osId}`);
    return { ok: false, mensagem: msg(e) };
  }
}

export async function cancelar(_: Res, form: FormData): Promise<Res> {
  await exigirAcao("nota.cancelar");
  try {
    await cancelarNota(s(form.get("notaId")), s(form.get("justificativa")));
    revalidatePath("/fiscal");
    return { ok: true, mensagem: "Nota cancelada." };
  } catch (e) {
    return { ok: false, mensagem: msg(e) };
  }
}

export async function emitirNfse(_: Res, form: FormData): Promise<Res> {
  await exigirUsuario(["ADMIN", "GERENTE", "OPERADOR", "CAIXA"]);
  const osId = s(form.get("osId"));
  const vendaId = s(form.get("vendaId"));
  try {
    const n = vendaId ? await emitirNfseVenda(vendaId) : await emitirNfseOs(osId);
    revalidatePath(vendaId ? `/vendas/${vendaId}` : `/os/${osId}`);
    return { ok: n.status === "AUTORIZADA", mensagem: n.status === "AUTORIZADA" ? "NFS-e autorizada." : `NFS-e ${n.status.toLowerCase()}: ${n.motivo}`, notaId: n.id };
  } catch (e) {
    revalidatePath(`/os/${osId}`);
    return { ok: false, mensagem: msg(e) };
  }
}

export async function cancelarServico(_: Res, form: FormData): Promise<Res> {
  await exigirAcao("nota.cancelar");
  try {
    await cancelarNfse(s(form.get("notaId")), Number(form.get("cMotivo")) as 1 | 2 | 9, s(form.get("justificativa")));
    revalidatePath("/fiscal");
    return { ok: true, mensagem: "NFS-e cancelada." };
  } catch (e) {
    return { ok: false, mensagem: msg(e) };
  }
}

export async function consultarNotaAcao(_: Res, form: FormData): Promise<Res> {
  await exigirUsuario(["ADMIN", "GERENTE", "OPERADOR", "CAIXA"]);
  try {
    const n = await consultarNota(s(form.get("notaId")));
    revalidatePath(`/fiscal/${n.id}`);
    return { ok: n.status === "AUTORIZADA", mensagem: `Nota ${n.numero}: ${n.status.toLowerCase()} (${n.motivo ?? ""})`, notaId: n.id };
  } catch (e) {
    return { ok: false, mensagem: msg(e) };
  }
}

export async function inutilizarAcao(_: Res, form: FormData): Promise<Res> {
  const u = await exigirAcao("nota.inutilizar");
  try {
    const r = await inutilizarNumeracao({
      modelo: s(form.get("modelo")) === "NFCE" ? "NFCE" : "NFE", serie: Number(form.get("serie")),
      inicio: Number(form.get("inicio")), fim: Number(form.get("fim") || form.get("inicio")), justificativa: s(form.get("justificativa")), usuarioId: u.id,
      empresaId: s(form.get("empresaId")) || null,
    });
    revalidatePath("/fiscal/inutilizacao");
    return { ok: r.status === "HOMOLOGADA", mensagem: r.status === "HOMOLOGADA" ? `Números ${r.numeroInicial} a ${r.numeroFinal} inutilizados (protocolo ${r.protocolo}).` : `SEFAZ recusou: ${r.motivo}` };
  } catch (e) {
    return { ok: false, mensagem: msg(e) };
  }
}

export async function cartaCorrecaoAcao(_: Res, form: FormData): Promise<Res> {
  await exigirAcao("nota.cce");
  try {
    const ev = await cartaCorrecao(s(form.get("notaId")), s(form.get("correcao")));
    revalidatePath(`/fiscal/${s(form.get("notaId"))}`);
    return { ok: true, mensagem: `Carta de correção nº ${ev.sequencia} registrada (protocolo ${ev.protocolo}).` };
  } catch (e) {
    return { ok: false, mensagem: msg(e) };
  }
}

/** NFS-e sem XML (ex.: emitida no Gestão Click): busca a chave pela DPS e o XML no portal nacional. */
export async function buscarXmlNfseAcao(_: Res, form: FormData): Promise<Res> {
  await exigirUsuario(["ADMIN", "GERENTE", "OPERADOR", "CAIXA"]);
  const id = s(form.get("notaId"));
  const r = await completarNfse(id);
  revalidatePath(`/fiscal/${id}`);
  return { ok: r.ok, mensagem: r.mensagem };
}

/** Todas as NFS-e da empresa atual sem XML (em lotes de 40): busca no portal nacional. */
export async function buscarXmlNfsesAcao(): Promise<Res> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  const notas = await prisma.notaFiscal.findMany({ where: { modelo: "NFSE", xml: null, status: { in: ["AUTORIZADA", "CANCELADA"] } }, select: { id: true }, orderBy: { createdAt: "desc" }, take: 40 });
  let ok = 0;
  const erros: string[] = [];
  for (const n of notas) {
    const r = await completarNfse(n.id);
    if (r.ok) ok++; else if (erros.length < 3) erros.push(r.mensagem);
  }
  revalidatePath("/fiscal");
  return { ok: ok > 0 || !notas.length, mensagem: notas.length ? `${ok} de ${notas.length} NFS-e com o XML baixado do portal nacional.${erros.length ? ` Falhas: ${erros.join("; ")}` : ""}` : "Nenhuma NFS-e sem XML." };
}
