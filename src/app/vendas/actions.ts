"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SituacaoVenda } from "@prisma/client";
import * as v from "@/lib/vendas/vendas";
import { EstoqueError } from "@/lib/estoque/estoque";
import { resultadoReserva } from "@/lib/estoque/resultado";
import type { Resultado } from "@/components/AdicionarProduto";
import type { Pagamento } from "@/lib/financeiro/lancamentos";

const num = (x: FormDataEntryValue | null) => Number(String(x ?? "").replace(",", "."));
const msg = (e: unknown, padrao: string) => (e instanceof Error && !(e as { code?: string }).code ? e.message : padrao);

export async function novaVenda(form: FormData) {
  const venda = await v.criarVenda({
    clienteId: String(form.get("clienteId") || "") || undefined,
    situacao: (String(form.get("situacao")) || "ABERTA") as SituacaoVenda,
  });
  redirect(`/vendas/${venda.id}`);
}

export async function adicionarItem(_: Resultado, form: FormData): Promise<Resultado> {
  const vendaId = String(form.get("docId"));
  try {
    const quantidade = num(form.get("quantidade"));
    if (!(quantidade > 0)) return { ok: false, mensagem: "Informe a quantidade" };
    const { alocacoes } = await v.adicionarItem(vendaId, {
      produtoId: String(form.get("produtoId")),
      quantidade,
      valorUnit: form.get("valorUnit") ? num(form.get("valorUnit")) : undefined,
    });
    revalidatePath(`/vendas/${vendaId}`);
    return await resultadoReserva(alocacoes);
  } catch (e) {
    return { ok: false, mensagem: e instanceof EstoqueError ? e.message : "Erro ao adicionar item" };
  }
}

export async function removerItem(form: FormData) {
  const vendaId = String(form.get("vendaId"));
  await v.removerItem(vendaId, String(form.get("itemId")));
  revalidatePath(`/vendas/${vendaId}`);
}

export type ResultadoSimples = { ok: boolean; mensagem: string; vendaId?: string; numero?: number } | null;

export async function mudarSituacao(_: ResultadoSimples, form: FormData): Promise<ResultadoSimples> {
  const vendaId = String(form.get("vendaId"));
  try {
    await v.alterarSituacaoVenda(vendaId, String(form.get("situacao")) as Exclude<SituacaoVenda, "CONCLUIDA">, {
      forcar: form.get("forcar") === "on",
    });
    revalidatePath(`/vendas/${vendaId}`);
    return { ok: true, mensagem: "Situação atualizada." };
  } catch (e) {
    return { ok: false, mensagem: msg(e, "Erro ao mudar a situação") };
  }
}

export async function concluir(_: ResultadoSimples, form: FormData): Promise<ResultadoSimples> {
  const vendaId = String(form.get("vendaId"));
  try {
    const pagamentos = JSON.parse(String(form.get("pagamentos") || "[]")) as Pagamento[];
    await v.concluirVenda(vendaId, pagamentos, { permitirNegativo: form.get("negativo") === "on" });
    revalidatePath(`/vendas/${vendaId}`);
    return { ok: true, mensagem: "Venda concluída." };
  } catch (e) {
    return { ok: false, mensagem: msg(e, "Erro ao concluir") };
  }
}

/** PDV: recebe o carrinho inteiro e fecha a venda. */
export async function fecharBalcao(dados: {
  clienteId?: string;
  itens: { produtoId: string; quantidade: number; valorUnit: number }[];
  pagamentos: Pagamento[];
  desconto?: number;
}): Promise<ResultadoSimples> {
  try {
    const venda = await v.vendaBalcao(dados);
    revalidatePath("/vendas");
    return { ok: true, mensagem: `Venda ${venda.numero} concluída.`, vendaId: venda.id, numero: venda.numero };
  } catch (e) {
    return { ok: false, mensagem: msg(e, "Erro ao fechar a venda") };
  }
}
