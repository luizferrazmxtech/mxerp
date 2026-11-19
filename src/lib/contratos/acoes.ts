"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PapelUsuario, SituacaoContrato } from "@prisma/client";
import { exigirUsuario } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { enviarEmail, salvarConfigEmail } from "@/lib/email/email";
import { configContratos, salvarConfigContratos } from "./config";
import { alterarSituacaoContrato, enviarEmailCobranca, excluirContrato, gerarCobrancaAgora, gerarVendaDaCobranca, processarContratos, salvarContrato, textoResumo } from "./contratos";
import type { DadosContrato } from "./tipos";

export type Resultado = { ok: boolean; mensagem: string } | null;
const GER: PapelUsuario[] = ["ADMIN", "GERENTE"];
const erro = (e: unknown) => ({ ok: false, mensagem: e instanceof Error ? e.message : String(e) });
const str = (x: FormDataEntryValue | null) => String(x ?? "").trim();

export async function salvarContratoForm(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario(GER);
  let destino: string;
  try {
    const d = JSON.parse(String(form.get("dados"))) as DadosContrato;
    const c = await salvarContrato(d, u, d.id);
    revalidatePath("/contratos");
    destino = `/contratos/${c.id}`;
  } catch (e) { return erro(e); }
  redirect(destino);
}

export async function situacaoContratoAcao(id: string, situacao: SituacaoContrato) {
  const u = await exigirUsuario(GER);
  try {
    await alterarSituacaoContrato(id, situacao, u);
    revalidatePath("/contratos", "layout");
    return { ok: true, mensagem: "Situação alterada" };
  } catch (e) { return erro(e); }
}

export async function excluirContratoAcao(id: string) {
  await exigirUsuario(GER);
  try { await excluirContrato(id); } catch (e) { return erro(e); }
  revalidatePath("/contratos");
  redirect("/contratos");
}

export async function gerarCobrancaAgoraAcao(id: string) {
  const u = await exigirUsuario(GER);
  try {
    const r = await gerarCobrancaAgora(id, u);
    revalidatePath("/contratos", "layout");
    return { ok: !r.erros.length, mensagem: textoResumo(r) };
  } catch (e) { return erro(e); }
}

export async function processarAgoraAcao() {
  await exigirUsuario(GER);
  try {
    const r = await processarContratos();
    revalidatePath("/contratos", "layout");
    return { ok: !r.erros.length, mensagem: textoResumo(r) };
  } catch (e) { return erro(e); }
}

export async function tentarDeNovoAcao(cobrancaId: string) {
  await exigirUsuario(GER);
  try {
    await gerarVendaDaCobranca(cobrancaId);
    await processarContratos();
    revalidatePath("/contratos", "layout");
    return { ok: true, mensagem: "Venda gerada" };
  } catch (e) { revalidatePath("/contratos", "layout"); return erro(e); }
}

export async function reenviarAcao(cobrancaId: string, tipo: "BOLETO" | "LEMBRETE") {
  await exigirUsuario(GER);
  try {
    const s = await enviarEmailCobranca(cobrancaId, tipo);
    revalidatePath("/contratos", "layout");
    if (s === "AGUARDANDO") return { ok: false, mensagem: "O boleto ainda está sendo registrado no Inter. Tente de novo em alguns minutos." };
    if (s === "PAGO") return { ok: false, mensagem: "Esta cobrança já foi paga." };
    return { ok: true, mensagem: "E-mail enviado" };
  } catch (e) {
    await prisma.contratoCobranca.update({ where: { id: cobrancaId }, data: { envioErro: (e instanceof Error ? e.message : String(e)).slice(0, 500) } }).catch(() => {});
    revalidatePath("/contratos", "layout");
    return erro(e);
  }
}

export async function salvarConfigContratosAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(GER);
  try {
    const atual = await configContratos();
    const situacaoVendaId = str(form.get("situacaoVendaId"));
    if (situacaoVendaId) {
      const s = await prisma.situacaoVendaConfig.findUnique({ where: { id: situacaoVendaId } });
      if (!s?.financeiro) return { ok: false, mensagem: "Escolha uma situação de venda que lance o financeiro" };
    }
    const int = (k: string, def: number) => { const v = Math.trunc(Number(str(form.get(k)))); return Number.isFinite(v) && v >= 0 && v <= 60 ? v : def; };
    await salvarConfigContratos({
      ...atual, situacaoVendaId, diasAntecedencia: int("diasAntecedencia", atual.diasAntecedencia), diasLembrete: int("diasLembrete", atual.diasLembrete),
      assuntoBoleto: str(form.get("assuntoBoleto")) || atual.assuntoBoleto, textoBoleto: str(form.get("textoBoleto")) || atual.textoBoleto,
      assuntoLembrete: str(form.get("assuntoLembrete")) || atual.assuntoLembrete, textoLembrete: str(form.get("textoLembrete")) || atual.textoLembrete,
    });
    revalidatePath("/contratos/configuracoes");
    return { ok: true, mensagem: "Configurações salvas" };
  } catch (e) { return erro(e); }
}

export async function salvarEmailAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN"]);
  try {
    await salvarConfigEmail({
      host: str(form.get("host")), porta: Number(str(form.get("porta"))) || 587, seguro: form.get("seguro") === "on", usuario: str(form.get("usuario")),
      senha: String(form.get("senha") ?? ""), remetente: str(form.get("remetente")), nomeRemetente: str(form.get("nomeRemetente")), copiaPara: str(form.get("copiaPara")),
    });
    revalidatePath("/contratos/configuracoes");
    const teste = str(form.get("teste"));
    if (teste) {
      await enviarEmail({ para: teste, assunto: "MXERP - teste de e-mail", texto: "Se você recebeu esta mensagem, o e-mail de envio do MXERP está funcionando." });
      return { ok: true, mensagem: `Configuração salva e e-mail de teste enviado para ${teste}` };
    }
    return { ok: true, mensagem: "Configuração de e-mail salva" };
  } catch (e) { return erro(e); }
}
