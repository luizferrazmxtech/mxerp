"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as v from "@/lib/vendas/vendas";
import type { Pagamento } from "@/lib/financeiro/lancamentos";
import { exigirUsuario } from "@/lib/auth/atual";
import { lerNumero } from "@/lib/itens/tipos";
import { abrirCaixa, caixaAberto, fecharCaixa, movimentarCaixa } from "@/lib/pdv/caixa";

const num = (x: FormDataEntryValue | null) => lerNumero(String(x ?? "")) ?? NaN;
const msg = (e: unknown, padrao: string) => (e instanceof Error && !(e as { code?: string }).code ? e.message : padrao);

export type ResultadoSimples = { ok: boolean; mensagem: string; vendaId?: string; numero?: number } | null;

/** PDV: recebe o carrinho inteiro e fecha a venda. */
export async function fecharBalcao(dados: {
  clienteId?: string;
  itens: { produtoId: string; quantidade: number; valorUnit: number }[];
  pagamentos: Pagamento[];
  desconto?: number;
}): Promise<ResultadoSimples> {
  const u = await exigirUsuario();
  try {
    const caixa = await caixaAberto(u.id);
    if (!caixa) return { ok: false, mensagem: "Abra o caixa antes de vender" };
    const venda = await v.vendaBalcao({ ...dados, usuarioId: u.id, caixaId: caixa.id });
    revalidatePath("/vendas");
    return { ok: true, mensagem: `Venda ${venda.numero} concluída.`, vendaId: venda.id, numero: venda.numero };
  } catch (e) {
    return { ok: false, mensagem: msg(e, "Erro ao fechar a venda") };
  }
}

export async function abrirCaixaAcao(_: ResultadoSimples, form: FormData): Promise<ResultadoSimples> {
  const u = await exigirUsuario();
  try {
    await abrirCaixa(u.id, num(form.get("valor") || "0"), form.get("recebimento") === "on");
  } catch (e) {
    return { ok: false, mensagem: msg(e, "Erro ao abrir o caixa") };
  }
  revalidatePath("/pdv");
  redirect("/pdv");
}

export async function fecharCaixaAcao(_: ResultadoSimples, form: FormData): Promise<ResultadoSimples> {
  const u = await exigirUsuario();
  try {
    await fecharCaixa(String(form.get("caixaId")), u.id, num(form.get("valor") || "0"), String(form.get("observacao") || ""));
  } catch (e) {
    return { ok: false, mensagem: msg(e, "Erro ao fechar o caixa") };
  }
  revalidatePath("/pdv");
  redirect("/vendas/balcao");
}

export async function movimentarCaixaAcao(_: ResultadoSimples, form: FormData): Promise<ResultadoSimples> {
  const u = await exigirUsuario();
  const tipo = form.get("tipo") === "SUPRIMENTO" ? "SUPRIMENTO" : "SANGRIA";
  try {
    const caixa = await caixaAberto(u.id);
    if (!caixa) return { ok: false, mensagem: "Abra o caixa antes" };
    await movimentarCaixa(caixa.id, u.id, { tipo, valor: num(form.get("valor")), motivo: String(form.get("motivo") || ""), contaId: String(form.get("contaId") || "") || null });
  } catch (e) {
    return { ok: false, mensagem: msg(e, tipo === "SANGRIA" ? "Erro ao registrar a sangria" : "Erro ao registrar o suprimento") };
  }
  revalidatePath("/pdv");
  redirect("/pdv");
}
