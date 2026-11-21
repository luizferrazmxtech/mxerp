"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/lib/auth/atual";
import { parseDia } from "@/lib/datas";
import { atualizarNoBanco, desconectar, registrarConexao, salvarConfigOpenFinance, sincronizarOpenFinance, testarOpenFinance, tokenConexao, vincularConta } from "./openfinance";

export type Resultado = { ok: boolean; mensagem: string } | null;
const erro = (e: unknown) => ({ ok: false as const, mensagem: e instanceof Error ? e.message : String(e) });
const str = (x: FormDataEntryValue | null) => String(x ?? "").trim();
const CAMINHO = "/openfinance";

/** Configurações → Integrações → Open Finance (só o administrador). Testa as credenciais depois de salvar. */
export async function salvarOpenFinanceAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN"]);
  try {
    const c = await salvarConfigOpenFinance({
      ativo: form.get("ativo") === "on", clientId: str(form.get("clientId")), clientSecret: String(form.get("clientSecret") ?? ""),
      apagarSecret: form.get("apagarSecret") === "on", diasRetroativos: Number(str(form.get("diasRetroativos"))) || 30,
    });
    revalidatePath(CAMINHO);
    if (!c.ativo) return { ok: true, mensagem: "Configuração salva (Open Finance desligado)" };
    return { ok: true, mensagem: await testarOpenFinance() };
  } catch (e) { return erro(e); }
}

/** Token para abrir o Pluggy Connect (novo banco, ou renovar o consentimento de um já conectado). */
export async function tokenConexaoAcao(itemId?: string): Promise<{ ok: true; token: string } | { ok: false; mensagem: string }> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try { return { ok: true, token: await tokenConexao(itemId) }; } catch (e) { return erro(e); }
}

export async function registrarConexaoAcao(itemId: string): Promise<Resultado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const c = await registrarConexao(itemId);
    revalidatePath(CAMINHO);
    return { ok: true, mensagem: `${c.banco} conectado: ${c.contas.length} conta(s). Escolha abaixo em qual conta do ERP cada uma entra.` };
  } catch (e) { return erro(e); }
}

export async function vincularContaAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const desde = str(form.get("importarDesde"));
    await vincularConta(str(form.get("id")), str(form.get("contaBancariaId")) || null, desde ? parseDia(desde) : undefined);
    revalidatePath(CAMINHO);
    return { ok: true, mensagem: "Salvo" };
  } catch (e) { return erro(e); }
}

export async function sincronizarOpenFinanceAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const r = await sincronizarOpenFinance({ conexaoId: str(form.get("id")) || undefined });
    revalidatePath(CAMINHO);
    revalidatePath("/financeiro/conciliacao");
    if ("ignorado" in r) return { ok: false, mensagem: r.ignorado ?? "" };
    const msgs = Object.entries(r.bancos).map(([b, m]) => `${b}: ${m}`);
    return { ok: !msgs.some((m) => m.includes("erro:")), mensagem: msgs.join(" · ") || "Nenhum banco conectado" };
  } catch (e) { return erro(e); }
}

export async function atualizarNoBancoAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    await atualizarNoBanco(str(form.get("id")));
    revalidatePath(CAMINHO);
    return { ok: true, mensagem: "Pedido enviado ao banco. Os lançamentos novos entram na próxima sincronização (em alguns minutos)." };
  } catch (e) { return erro(e); }
}

export async function desconectarAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN"]);
  try {
    await desconectar(str(form.get("id")));
    revalidatePath(CAMINHO);
    return { ok: true, mensagem: "Banco desconectado. O extrato já importado continua na conciliação." };
  } catch (e) { return erro(e); }
}
