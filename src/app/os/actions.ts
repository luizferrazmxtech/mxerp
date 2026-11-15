"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SituacaoOs } from "@prisma/client";
import { prisma } from "@/lib/db";
import * as os from "@/lib/os/os";
import { EstoqueError } from "@/lib/estoque/estoque";
import { resultadoReserva } from "@/lib/estoque/resultado";

const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(",", "."));

import type { Resultado } from "@/components/AdicionarProduto";
export type { Resultado };

export async function novaOs(form: FormData) {
  const o = await os.criarOs({
    clienteId: String(form.get("clienteId")),
    tecnicoId: String(form.get("tecnicoId") || "") || undefined,
    equipamento: String(form.get("equipamento") || "") || undefined,
    defeito: String(form.get("defeito") || "") || undefined,
  });
  redirect(`/os/${o.id}`);
}

export async function adicionarProduto(_: Resultado, form: FormData): Promise<Resultado> {
  const osId = String(form.get("docId"));
  try {
    const quantidade = num(form.get("quantidade"));
    if (!(quantidade > 0)) return { ok: false, mensagem: "Informe a quantidade" };
    const { alocacoes } = await os.adicionarProduto(osId, {
      produtoId: String(form.get("produtoId")),
      quantidade,
      valorUnit: form.get("valorUnit") ? num(form.get("valorUnit")) : undefined,
    });
    revalidatePath(`/os/${osId}`);
    return await resultadoReserva(alocacoes);
  } catch (e) {
    return { ok: false, mensagem: e instanceof EstoqueError ? e.message : "Erro ao adicionar produto" };
  }
}

export async function removerProduto(form: FormData) {
  const osId = String(form.get("osId"));
  await os.removerProduto(osId, String(form.get("itemId")));
  revalidatePath(`/os/${osId}`);
}

export async function alterarQuantidade(form: FormData) {
  const osId = String(form.get("osId"));
  await os.alterarQuantidade(osId, String(form.get("itemId")), num(form.get("quantidade")));
  revalidatePath(`/os/${osId}`);
}

export async function adicionarServico(form: FormData) {
  const osId = String(form.get("osId"));
  await os.adicionarServico(osId, {
    servicoId: String(form.get("servicoId")),
    valorUnit: form.get("valorUnit") ? num(form.get("valorUnit")) : undefined,
  });
  revalidatePath(`/os/${osId}`);
}

export async function removerServico(form: FormData) {
  const osId = String(form.get("osId"));
  await os.removerServico(osId, String(form.get("itemId")));
  revalidatePath(`/os/${osId}`);
}

export async function mudarSituacao(_: Resultado, form: FormData): Promise<Resultado> {
  const osId = String(form.get("osId"));
  try {
    await os.alterarSituacao(osId, String(form.get("situacao")) as SituacaoOs, {
      permitirNegativo: form.get("negativo") === "on",
      forcar: form.get("forcar") === "on",
    });
    revalidatePath(`/os/${osId}`);
    return { ok: true, mensagem: "Situação atualizada." };
  } catch (e) {
    return { ok: false, mensagem: erro(e, "Erro ao mudar a situação") };
  }
}

export async function faturar(_: Resultado, form: FormData): Promise<Resultado> {
  const osId = String(form.get("osId"));
  try {
    await os.faturarOs(osId, JSON.parse(String(form.get("pagamentos") || "[]")), {
      permitirNegativo: form.get("negativo") === "on",
    });
    revalidatePath(`/os/${osId}`);
    return { ok: true, mensagem: "OS faturada." };
  } catch (e) {
    return { ok: false, mensagem: erro(e, "Erro ao faturar") };
  }
}

const erro = (e: unknown, padrao: string) =>
  e instanceof EstoqueError || (e instanceof Error && !(e as { code?: string }).code) ? (e as Error).message : padrao;

export async function marcarSeparado(form: FormData) {
  const osId = String(form.get("osId"));
  await prisma.reserva.update({
    where: { id: String(form.get("reservaId")) },
    data: { separado: form.get("separado") === "1" },
  });
  revalidatePath(`/os/${osId}/separacao`);
  revalidatePath(`/os/${osId}`);
}
