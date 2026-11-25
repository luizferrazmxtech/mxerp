"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { caixaAberto } from "@/lib/pdv/caixa";
import { cancelarPix, conciliarTransacoes, consultarPix, criarPix, salvarConfigPagSeguro, sincronizarPagSeguro, testarPagSeguro } from "./pagseguro";
import { cancelarPixInter, consultarPixInter, criarPixInter } from "@/lib/financeiro/pixInter";

export type Resultado = { ok: boolean; mensagem: string } | null;
const erro = (e: unknown) => ({ ok: false as const, mensagem: e instanceof Error ? e.message : String(e) });
const str = (x: FormDataEntryValue | null) => String(x ?? "").trim();

/** Configurações → Integrações → PagSeguro (só o administrador). Testa a conexão depois de salvar. */
export async function salvarPagSeguroAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN"]);
  try {
    await salvarConfigPagSeguro({
      ativo: form.get("ativo") === "on", ambiente: str(form.get("ambiente")) === "SANDBOX" ? "SANDBOX" : "PRODUCAO",
      token: String(form.get("token") ?? ""), apagarToken: form.get("apagarToken") === "on",
      pix: form.get("pix") === "on", pixMinutos: Number(str(form.get("pixMinutos"))) || 15,
      edi: form.get("edi") === "on", ediUsuario: str(form.get("ediUsuario")), ediToken: String(form.get("ediToken") ?? ""), apagarEdiToken: form.get("apagarEdiToken") === "on",
      conciliarDesde: str(form.get("conciliarDesde")),
    });
    revalidatePath("/pagseguro");
    if (form.get("ativo") !== "on") return { ok: true, mensagem: "Configuração salva (PagSeguro desligado)" };
    try { return { ok: true, mensagem: `Configuração salva. Teste: ${await testarPagSeguro()}.` }; }
    catch (e) { return { ok: false, mensagem: `Configuração salva, mas o teste falhou: ${e instanceof Error ? e.message : String(e)}` }; }
  } catch (e) { return erro(e); }
}

export async function conciliarAgoraAcao() {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  try {
    const r = await sincronizarPagSeguro();
    revalidatePath("/pagseguro");
    if ("ignorado" in r) return { ok: false, mensagem: "Ligue a conciliação pelo EDI na configuração" };
    return { ok: true, mensagem: `${r.transacoes} transações lidas, ${r.ligadas} ligadas a contas, ${r.recebidas} recebidas, ${r.taxas} taxas lançadas` };
  } catch (e) { return erro(e); }
}

export async function ignorarTransacaoAcao(id: string) {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  await prisma.transacaoPagSeguro.update({ where: { id }, data: { situacao: "IGNORADA" } });
  revalidatePath("/pagseguro");
  return { ok: true, mensagem: "Transação ignorada" };
}

export async function reconsiderarTransacaoAcao(id: string) {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  await prisma.transacaoPagSeguro.update({ where: { id }, data: { situacao: "SEM_CONTA" } });
  await conciliarTransacoes();
  revalidatePath("/pagseguro");
  return { ok: true, mensagem: "Transação conciliada de novo" };
}

// ---------- PDV

export type PixTela = { ok: true; id: string; texto: string; imagem: string; valor: number; expiraEm: string } | { ok: false; mensagem: string };

export type ProvedorPix = "PAGSEGURO" | "INTER";

/** QR do Pix no PDV: pelo PagSeguro ou pelo Banco Inter (sem taxa), conforme a forma escolhida. */
export async function criarPixAcao(valor: number, clienteId?: string | null, provedor: ProvedorPix = "PAGSEGURO"): Promise<PixTela> {
  const u = await exigirUsuario();
  try {
    const caixa = await caixaAberto(u.id);
    if (!caixa) return { ok: false, mensagem: "Abra o caixa antes de vender" };
    if (provedor === "INTER") return { ok: true, ...(await criarPixInter({ valor, caixaId: caixa.id, usuarioId: u.id })) };
    const cliente = clienteId ? await prisma.pessoa.findUnique({ where: { id: clienteId }, select: { nome: true, email: true, documento: true } }) : null;
    return { ok: true, ...(await criarPix({ valor, caixaId: caixa.id, usuarioId: u.id, cliente })) };
  } catch (e) { return erro(e); }
}

export async function consultarPixAcao(id: string): Promise<{ ok: boolean; situacao: string; mensagem?: string }> {
  await exigirUsuario();
  try {
    const cob = await prisma.cobrancaPix.findUniqueOrThrow({ where: { id }, select: { provedor: true } });
    return { ok: true, situacao: (cob.provedor === "INTER" ? await consultarPixInter(id) : await consultarPix(id)).situacao };
  } catch (e) { return { ok: false, situacao: "PENDENTE", mensagem: erro(e).mensagem }; }
}

export async function cancelarPixAcao(id: string) {
  await exigirUsuario();
  try {
    const cob = await prisma.cobrancaPix.findUniqueOrThrow({ where: { id }, select: { provedor: true } });
    if (cob.provedor === "INTER") await cancelarPixInter(id); else await cancelarPix(id);
    return { ok: true, mensagem: "PIX cancelado" };
  } catch (e) { return erro(e); }
}
