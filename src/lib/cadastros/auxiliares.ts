"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { TipoCampoExtra } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth/atual";

type Tabela = "contato" | "endereco";
const rota = (t: Tabela) => (t === "contato" ? "/tipos-contatos" : "/tipos-enderecos");
export type Resultado = { ok: boolean; mensagem: string } | null;

export async function salvarTipoAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  const t = String(form.get("tabela")) as Tabela;
  const id = String(form.get("id") || "");
  const nome = String(form.get("nome") ?? "").trim();
  if (!nome) return { ok: false, mensagem: "Informe o nome" };
  try {
    const m = t === "contato" ? prisma.tipoContato : prisma.tipoEndereco;
    // @ts-expect-error mesmo formato nas duas tabelas
    await (id ? m.update({ where: { id }, data: { nome } }) : m.create({ data: { nome } }));
  } catch {
    return { ok: false, mensagem: "Já existe um tipo com esse nome" };
  }
  revalidatePath(rota(t));
  redirect(rota(t));
}

export async function excluirTipoAcao(t: Tabela, id: string) {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  if (t === "contato") await prisma.tipoContato.delete({ where: { id } });
  else await prisma.tipoEndereco.delete({ where: { id } });
  revalidatePath(rota(t));
  return { ok: true, mensagem: "Excluído" };
}

const TIPOS: TipoCampoExtra[] = ["TEXTO", "NUMEROS", "DATA", "CPF", "CNPJ", "SELECAO_UNICA", "MULTIPLA_SELECAO"];

export async function salvarCampoExtraAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  const id = String(form.get("id") || "");
  const nome = String(form.get("nome") ?? "").trim();
  const tipo = String(form.get("tipo")) as TipoCampoExtra;
  if (!nome) return { ok: false, mensagem: "Informe o nome" };
  if (!TIPOS.includes(tipo)) return { ok: false, mensagem: "Selecione o tipo" };
  const opcoes = String(form.get("opcoes") ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if ((tipo === "SELECAO_UNICA" || tipo === "MULTIPLA_SELECAO") && opcoes.length < 2) return { ok: false, mensagem: "Informe ao menos duas opções (uma por linha)" };
  const entidade = form.get("entidade") === "PRODUTO" ? "PRODUTO" : "CLIENTE";
  const dados = { nome, tipo, obrigatorio: form.get("obrigatorio") === "1", opcoes: tipo === "SELECAO_UNICA" || tipo === "MULTIPLA_SELECAO" ? opcoes : [], entidade };
  if (id) await prisma.campoExtra.update({ where: { id }, data: dados });
  else await prisma.campoExtra.create({ data: { ...dados, ordem: await prisma.campoExtra.count({ where: { entidade } }) } });
  revalidatePath("/campos-extras");
  redirect(entidade === "PRODUTO" ? "/campos-extras?entidade=PRODUTO" : "/campos-extras");
}

export async function excluirCampoExtraAcao(id: string) {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  await prisma.campoExtra.delete({ where: { id } });
  revalidatePath("/campos-extras");
  return { ok: true, mensagem: "Campo excluído (os valores já gravados ficam guardados)" };
}
