"use server";

import { exigirAcao, exigirUsuario } from "@/lib/auth/atual";
import { revalidatePath } from "next/cache";
import type { RegimeTributario, AmbienteFiscal } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cancelarNfse, cancelarNota, consultarNota, emitirNfseOs, emitirNfseVenda, emitirNotaOs, emitirNotaVenda, empresa } from "@/lib/fiscal/emissao";
import { certificadoDoAmbiente } from "@/lib/fiscal/certificado";
import { ClienteSefaz } from "@/lib/fiscal/sefaz";
import { cartaCorrecao, inutilizarNumeracao } from "@/lib/fiscal/inutilizacao";

export type Res = { ok: boolean; mensagem: string; notaId?: string } | null;
const s = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const msg = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado");

export async function salvarEmpresa(_: Res, form: FormData): Promise<Res> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const dados = {
      razaoSocial: s(form.get("razaoSocial")), nomeFantasia: s(form.get("nomeFantasia")) || null,
      cnpj: s(form.get("cnpj")).replace(/\D/g, ""), inscricaoEstadual: s(form.get("ie")).replace(/\D/g, "") || null,
      inscricaoMunicipal: s(form.get("im")) || null, cnae: s(form.get("cnae")).replace(/\D/g, "") || null,
      regimeTributario: s(form.get("regime")) as RegimeTributario,
      logradouro: s(form.get("logradouro")) || null, numero: s(form.get("numero")) || null, bairro: s(form.get("bairro")) || null,
      cidade: s(form.get("cidade")) || null, codigoMunicipio: s(form.get("codigoMunicipio")).replace(/\D/g, "") || null,
      uf: s(form.get("uf")).toUpperCase() || null, cep: s(form.get("cep")).replace(/\D/g, "") || null,
      telefone: s(form.get("telefone")) || null, email: s(form.get("email")) || null,
      ambienteFiscal: s(form.get("ambiente")) as AmbienteFiscal,
      serieNfe: Number(form.get("serieNfe") || 1), serieNfce: Number(form.get("serieNfce") || 1),
      cscId: s(form.get("cscId")) || null,
      ...(s(form.get("cscToken")) ? { cscToken: s(form.get("cscToken")) } : {}),
    };
    const atual = await prisma.empresa.findFirst();
    if (atual) await prisma.empresa.update({ where: { id: atual.id }, data: dados });
    else await prisma.empresa.create({ data: dados });
    revalidatePath("/fiscal");
    return { ok: true, mensagem: "Dados salvos." };
  } catch (e) {
    return { ok: false, mensagem: msg(e) };
  }
}

export async function consultarStatus(_: Res, form: FormData): Promise<Res> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const e = await empresa();
    const modelo = Number(form.get("modelo")) === 65 ? 65 : 55;
    const r = await new ClienteSefaz(certificadoDoAmbiente(), e.uf!, e.ambienteFiscal === "PRODUCAO" ? 1 : 2).status(modelo);
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
