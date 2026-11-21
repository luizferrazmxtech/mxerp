"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { entrada, saida, transferir } from "@/lib/estoque/estoque";
import { exigirUsuario } from "@/lib/auth/atual";
import { lerNumero } from "@/lib/itens/tipos";
import { criarEstoqueEquipe } from "@/lib/estoque/carro";

const num = (v: FormDataEntryValue | null) => lerNumero(String(v ?? "")) ?? NaN;
// toda ação exige login (o middleware só olha o caminho da página, e uma ação pode ser chamada de qualquer página)
const ESTOQUE = ["ADMIN", "GERENTE", "OPERADOR", "TECNICO", "CAIXA"] as const;

export async function darEntrada(form: FormData) {
  const u = await exigirUsuario([...ESTOQUE]);
  const produtoId = String(form.get("produtoId"));
  await prisma.$transaction((tx) =>
    entrada(tx, {
      produtoId,
      localId: String(form.get("localId")),
      quantidade: num(form.get("quantidade")),
      custoUnit: form.get("custoUnit") ? num(form.get("custoUnit")) : undefined,
      origemTipo: "AJUSTE",
      observacao: String(form.get("observacao") ?? "") || "Entrada manual",
      usuarioId: u.id,
    }),
  );
  revalidatePath(`/estoque/produto/${produtoId}`);
}

export async function darSaida(form: FormData) {
  const u = await exigirUsuario([...ESTOQUE]);
  const produtoId = String(form.get("produtoId"));
  await prisma.$transaction((tx) =>
    saida(tx, {
      produtoId,
      localId: String(form.get("localId")),
      quantidade: num(form.get("quantidade")),
      origemTipo: "AJUSTE",
      observacao: String(form.get("observacao") ?? "") || "Saída manual",
      usuarioId: u.id,
    }),
  );
  revalidatePath(`/estoque/produto/${produtoId}`);
}

export async function fazerTransferencia(form: FormData) {
  const u = await exigirUsuario([...ESTOQUE]);
  const produtoId = String(form.get("produtoId"));
  await prisma.$transaction((tx) =>
    transferir(tx, {
      produtoId,
      deLocalId: String(form.get("deLocalId")),
      paraLocalId: String(form.get("paraLocalId")),
      quantidade: num(form.get("quantidade")),
      usuarioId: u.id,
    }),
  );
  revalidatePath(`/estoque/produto/${produtoId}`);
}

export async function definirLocalPadrao(form: FormData) {
  await exigirUsuario([...ESTOQUE]);
  const produtoId = String(form.get("produtoId"));
  const localId = String(form.get("localId") || "") || null;
  await prisma.produto.update({ where: { id: produtoId }, data: { localPadraoId: localId } });
  revalidatePath(`/estoque/produto/${produtoId}`);
}

export async function criarLocal(form: FormData) {
  await exigirUsuario([...ESTOQUE]);
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

export async function salvarFiscalProduto(form: FormData) {
  await exigirUsuario(["ADMIN", "GERENTE", "OPERADOR"]);
  const produtoId = String(form.get("produtoId"));
  const s = (k: string) => String(form.get(k) ?? "").trim() || null;
  await prisma.produto.update({
    where: { id: produtoId },
    data: {
      ncm: s("ncm")?.replace(/\D/g, "") ?? null, cest: s("cest")?.replace(/\D/g, "") ?? null, gtin: s("gtin"),
      cfopInterno: s("cfopInterno"), cfopExterno: s("cfopExterno"), csosn: s("csosn"), origem: Number(form.get("origem") || 0),
    },
  });
  revalidatePath(`/estoque/produto/${produtoId}`);
}

/** Cria o estoque do carro de uma equipe: depósito próprio, fora do disponível da loja. */
export async function criarEstoqueEquipeAcao(form: FormData) {
  await exigirUsuario(["ADMIN", "GERENTE", "OPERADOR"]);
  const equipeId = String(form.get("equipeId") || "");
  if (!equipeId) return;
  await criarEstoqueEquipe(equipeId, String(form.get("nome") || "") || undefined);
  revalidatePath("/estoque/locais");
}
