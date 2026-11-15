"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SituacaoOs } from "@prisma/client";
import { prisma } from "@/lib/db";
import * as os from "@/lib/os/os";
import { EstoqueError } from "@/lib/estoque/estoque";

const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(",", "."));

export type Resultado = { ok: boolean; mensagem: string; pegar?: { local: string; quantidade: number }[] } | null;

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
  const osId = String(form.get("osId"));
  try {
    const quantidade = num(form.get("quantidade"));
    if (!(quantidade > 0)) return { ok: false, mensagem: "Informe a quantidade" };
    const { alocacoes } = await os.adicionarProduto(osId, {
      produtoId: String(form.get("produtoId")),
      quantidade,
      valorUnit: form.get("valorUnit") ? num(form.get("valorUnit")) : undefined,
    });
    const locais = await prisma.local.findMany({
      where: { id: { in: alocacoes.map((a) => a.localId).filter((x): x is string => !!x) } },
    });
    const cod = new Map(locais.map((l) => [l.id, l.codigo]));
    const pegar = alocacoes.map((a) => ({ local: a.localId ? cod.get(a.localId)! : "EM FALTA", quantidade: a.quantidade }));
    revalidatePath(`/os/${osId}`);
    const falta = alocacoes.find((a) => !a.localId);
    return {
      ok: !falta,
      mensagem: falta ? `Reservado, mas faltam ${falta.quantidade} no estoque.` : "Reservado no estoque.",
      pegar,
    };
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
    });
    revalidatePath(`/os/${osId}`);
    return { ok: true, mensagem: "Situação atualizada." };
  } catch (e) {
    return { ok: false, mensagem: e instanceof EstoqueError ? e.message : "Erro ao mudar a situação" };
  }
}

export async function marcarSeparado(form: FormData) {
  const osId = String(form.get("osId"));
  await prisma.reserva.update({
    where: { id: String(form.get("reservaId")) },
    data: { separado: form.get("separado") === "1" },
  });
  revalidatePath(`/os/${osId}/separacao`);
  revalidatePath(`/os/${osId}`);
}
