"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { entrada, saida, transferir } from "@/lib/estoque/estoque";

const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(",", "."));

export async function darEntrada(form: FormData) {
  const produtoId = String(form.get("produtoId"));
  await prisma.$transaction((tx) =>
    entrada(tx, {
      produtoId,
      localId: String(form.get("localId")),
      quantidade: num(form.get("quantidade")),
      custoUnit: form.get("custoUnit") ? num(form.get("custoUnit")) : undefined,
      origemTipo: "AJUSTE",
      observacao: String(form.get("observacao") ?? "") || "Entrada manual",
    }),
  );
  revalidatePath(`/estoque/produto/${produtoId}`);
}

export async function darSaida(form: FormData) {
  const produtoId = String(form.get("produtoId"));
  await prisma.$transaction((tx) =>
    saida(tx, {
      produtoId,
      localId: String(form.get("localId")),
      quantidade: num(form.get("quantidade")),
      origemTipo: "AJUSTE",
      observacao: String(form.get("observacao") ?? "") || "Saída manual",
    }),
  );
  revalidatePath(`/estoque/produto/${produtoId}`);
}

export async function fazerTransferencia(form: FormData) {
  const produtoId = String(form.get("produtoId"));
  await prisma.$transaction((tx) =>
    transferir(tx, {
      produtoId,
      deLocalId: String(form.get("deLocalId")),
      paraLocalId: String(form.get("paraLocalId")),
      quantidade: num(form.get("quantidade")),
    }),
  );
  revalidatePath(`/estoque/produto/${produtoId}`);
}

export async function definirLocalPadrao(form: FormData) {
  const produtoId = String(form.get("produtoId"));
  const localId = String(form.get("localId") || "") || null;
  await prisma.produto.update({ where: { id: produtoId }, data: { localPadraoId: localId } });
  revalidatePath(`/estoque/produto/${produtoId}`);
}

export async function criarLocal(form: FormData) {
  const depositoNome = String(form.get("deposito") || "Principal").trim();
  const corredor = String(form.get("corredor") || "").trim().toUpperCase() || null;
  const prateleira = String(form.get("prateleira") || "").trim().toUpperCase() || null;
  const nivel = String(form.get("nivel") || "").trim().toUpperCase() || null;
  const deposito = await prisma.deposito.upsert({
    where: { nome: depositoNome },
    create: { nome: depositoNome },
    update: {},
  });
  const codigo =
    String(form.get("codigo") || "").trim().toUpperCase() ||
    [depositoNome.slice(0, 4).toUpperCase(), corredor, prateleira, nivel].filter(Boolean).join("-");
  await prisma.local.create({
    data: { depositoId: deposito.id, corredor, prateleira, nivel, codigo, descricao: String(form.get("descricao") || "") || null },
  });
  revalidatePath("/estoque/locais");
}
