"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as v from "@/lib/vendas/vendas";
import type { Pagamento } from "@/lib/financeiro/lancamentos";
import { exigirAcao, exigirUsuario } from "@/lib/auth/atual";
import { pode } from "@/lib/auth/permissoesAcao";
import { lerNumero } from "@/lib/itens/tipos";
import { abrirCaixa, caixaAberto, fecharCaixa, movimentarCaixa } from "@/lib/pdv/caixa";
import { prisma } from "@/lib/db";
import { conferirPixDaVenda, pixPagSeguroAtivo } from "@/lib/pagseguro/pagseguro";

const num = (x: FormDataEntryValue | null) => lerNumero(String(x ?? "")) ?? NaN;
const msg = (e: unknown, padrao: string) => (e instanceof Error && !(e as { code?: string }).code ? e.message : padrao);

export type ResultadoSimples = { ok: boolean; mensagem: string; vendaId?: string; numero?: number } | null;

/** PDV: recebe o carrinho inteiro e fecha a venda. */
export async function fecharBalcao(dados: {
  clienteId?: string;
  itens: { produtoId: string; quantidade: number; valorUnit: number }[];
  pagamentos: Pagamento[];
  desconto?: number;
  /** PIX do PagSeguro já pago (QR mostrado no caixa) */
  cobrancaPixId?: string;
}): Promise<ResultadoSimples> {
  const u = await exigirUsuario();
  try {
    const caixa = await caixaAberto(u.id);
    if (!caixa) return { ok: false, mensagem: "Abra o caixa antes de vender" };
    const { cobrancaPixId, ...venda0 } = dados;
    // PIX do PagSeguro: a venda só fecha com a cobrança paga, no mesmo valor
    const formasPix = (await prisma.formaPagamento.findMany({ where: { pagseguro: true, tPag: "17", id: { in: dados.pagamentos.map((p) => p.formaPagamentoId) } }, select: { id: true } })).map((f) => f.id);
    const valorPix = dados.pagamentos.filter((p) => formasPix.includes(p.formaPagamentoId)).reduce((s, p) => s + p.valor, 0);
    if (valorPix > 0 && (await pixPagSeguroAtivo())) {
      if (!cobrancaPixId) return { ok: false, mensagem: "Mostre o QR do PIX ao cliente e espere o pagamento" };
      await conferirPixDaVenda(cobrancaPixId, valorPix);
    }
    if ((dados.desconto ?? 0) > 0 && !(await pode(u.papel, "pdv.desconto"))) return { ok: false, mensagem: "Sem permissão para dar desconto no PDV. Fale com o gerente." };
    const venda = await v.vendaBalcao({ ...venda0, usuarioId: u.id, caixaId: caixa.id });
    if (cobrancaPixId && valorPix > 0) await prisma.cobrancaPix.update({ where: { id: cobrancaPixId }, data: { vendaId: venda.id } });
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
  const volta = String(form.get("voltar") || "");
  redirect(volta.startsWith("/") && !volta.startsWith("//") ? volta : "/pdv");
}

export async function fecharCaixaAcao(_: ResultadoSimples, form: FormData): Promise<ResultadoSimples> {
  const u = await exigirUsuario();
  const caixaId = String(form.get("caixaId"));
  // conferência por forma: campos "contado:<forma>"
  const contado: Record<string, number> = {};
  for (const [k, val] of form.entries()) if (k.startsWith("contado:")) contado[k.slice(8)] = num(val || "0");
  const qualquerOperador = form.get("outro") === "1";
  if (qualquerOperador && !(await pode(u.papel, "pdv.caixas"))) return { ok: false, mensagem: "Sem permissão para fechar o caixa de outro operador" };
  try {
    await fecharCaixa(caixaId, u.id, Object.keys(contado).length ? contado : num(form.get("valor") || "0"), String(form.get("observacao") || ""),
      { qualquerOperador, lancarDiferenca: form.get("lancar") === "on" });
  } catch (e) {
    return { ok: false, mensagem: msg(e, "Erro ao fechar o caixa") };
  }
  revalidatePath("/pdv");
  revalidatePath("/vendas/caixas");
  redirect(`/vendas/caixas/${caixaId}?fechado=1`);
}

export async function movimentarCaixaAcao(_: ResultadoSimples, form: FormData): Promise<ResultadoSimples> {
  const u = await exigirAcao("pdv.sangria");
  const tipo = form.get("tipo") === "SUPRIMENTO" ? "SUPRIMENTO" : "SANGRIA";
  try {
    const caixa = await caixaAberto(u.id);
    if (!caixa) return { ok: false, mensagem: "Abra o caixa antes" };
    await movimentarCaixa(caixa.id, u.id, { tipo, valor: num(form.get("valor")), motivo: String(form.get("motivo") || ""), contaId: String(form.get("contaId") || "") || null });
  } catch (e) {
    return { ok: false, mensagem: msg(e, tipo === "SANGRIA" ? "Erro ao registrar a sangria" : "Erro ao registrar o reforço") };
  }
  revalidatePath("/pdv");
  const volta = String(form.get("voltar") || "");
  redirect(volta.startsWith("/") && !volta.startsWith("//") ? volta : "/pdv");
}
