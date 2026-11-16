"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth/atual";
import { excluirFuncionario, salvarFuncionario, type DadosFuncionario } from "./funcionarios";
import { PAPEIS, excluirPessoa, salvarPessoa, type DadosPessoa, type PapelPessoa } from "./pessoas";

export type Resultado = { ok: boolean; mensagem: string } | null;
const LIMITE_ARQUIVO = 5 * 1024 * 1024;
const papelValido = (x: unknown): PapelPessoa => {
  if (x === "cliente" || x === "fornecedor" || x === "transportadora") return x;
  throw new Error("Cadastro inválido");
};
const erro = (e: unknown) => ({ ok: false, mensagem: e instanceof Error ? e.message : String(e) });

/** Formulário de cliente/fornecedor/transportadora (dados em JSON + foto opcional). */
export async function salvarPessoaForm(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario();
  let destino: string;
  try {
    const papel = papelValido(form.get("papel"));
    const d = JSON.parse(String(form.get("dados"))) as DadosPessoa & { id?: string };
    const p = await salvarPessoa(papel, d, { id: d.id, usuarioId: u.id });
    const foto = form.get("foto");
    if (foto instanceof File && foto.size > 0) {
      if (foto.size > LIMITE_ARQUIVO) throw new Error("A foto passa de 5 MB");
      if (!/^image\/(jpeg|gif|png|webp)$/.test(foto.type)) throw new Error("A foto deve ser JPG, GIF ou PNG");
      await prisma.pessoa.update({ where: { id: p.id }, data: { foto: Buffer.from(await foto.arrayBuffer()), fotoTipo: foto.type } });
    }
    if (form.get("removerFoto") === "1") await prisma.pessoa.update({ where: { id: p.id }, data: { foto: null, fotoTipo: null } });
    for (const a of form.getAll("anexos")) await gravarAnexo("PESSOA", p.id, a, u.id);
    revalidatePath(PAPEIS[papel].base);
    destino = `${PAPEIS[papel].base}/${p.id}`;
  } catch (e) {
    return erro(e);
  }
  redirect(destino);
}

async function gravarAnexo(entidade: string, entidadeId: string, a: FormDataEntryValue, usuarioId: string) {
  if (!(a instanceof File) || a.size === 0) return;
  if (a.size > LIMITE_ARQUIVO) throw new Error(`O anexo ${a.name} passa de 5 MB`);
  await prisma.anexo.create({
    data: { entidade, entidadeId, nome: a.name.slice(0, 200), tipo: a.type || "application/octet-stream", tamanho: a.size, dados: Buffer.from(await a.arrayBuffer()), usuarioId },
  });
}

export async function excluirPessoaAcao(papel: PapelPessoa, id: string) {
  await exigirUsuario(["ADMIN", "GERENTE", "OPERADOR", "CAIXA", "TECNICO"]);
  try {
    const r = await excluirPessoa(papelValido(papel), id);
    revalidatePath(PAPEIS[papel].base);
    return r;
  } catch (e) { return erro(e); }
}

/** "Excluir clientes" em massa (Mais ações). */
export async function excluirVariasAcao(_: Resultado, form: FormData): Promise<Resultado> {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  const papel = papelValido(form.get("papel"));
  const ids = form.getAll("ids").map(String);
  if (!ids.length) return { ok: false, mensagem: "Marque ao menos um cadastro" };
  let ok = 0; const falhas: string[] = [];
  for (const id of ids) {
    const r = await excluirPessoa(papel, id).catch(erro);
    if (r.ok) ok++; else falhas.push(r.mensagem);
  }
  revalidatePath(PAPEIS[papel].base);
  return { ok: falhas.length === 0, mensagem: `${ok} excluído(s).${falhas.length ? ` ${falhas.length} não puderam ser excluídos: ${falhas.slice(0, 5).join(" ")}` : ""}` };
}

export async function anexarAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario();
  const entidade = String(form.get("entidade")), entidadeId = String(form.get("entidadeId"));
  if (!["PESSOA", "USUARIO", "ORCAMENTO", "VENDA", "OS", "COMPRA", "COTACAO"].includes(entidade)) return { ok: false, mensagem: "Inválido" };
  try {
    const arqs = form.getAll("arquivo").filter((a) => a instanceof File && a.size > 0);
    if (!arqs.length) return { ok: false, mensagem: "Escolha um arquivo" };
    for (const a of arqs) await gravarAnexo(entidade, entidadeId, a, u.id);
    revalidatePath(String(form.get("caminho") || "/"));
    return { ok: true, mensagem: `${arqs.length} anexo(s) adicionado(s)` };
  } catch (e) { return erro(e); }
}

export async function excluirAnexoAcao(id: string) {
  await exigirUsuario();
  await prisma.anexo.delete({ where: { id } });
  return { ok: true, mensagem: "Anexo excluído" };
}

export async function anotarAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario();
  const texto = String(form.get("texto") ?? "").trim();
  if (!texto) return { ok: false, mensagem: "Escreva a anotação" };
  const pessoaId = String(form.get("pessoaId"));
  await prisma.pessoaAnotacao.create({ data: { pessoaId, texto, usuarioId: u.id } });
  revalidatePath(String(form.get("caminho") || "/"));
  return { ok: true, mensagem: "Anotação registrada" };
}

export async function excluirAnotacaoAcao(id: string) {
  await exigirUsuario();
  await prisma.pessoaAnotacao.delete({ where: { id } });
  return { ok: true, mensagem: "Anotação excluída" };
}

/** Botão verde "Habilitar Área do Cliente" (o portal do cliente ainda não existe; fica marcado no cadastro). */
export async function areaClienteAcao(id: string) {
  await exigirUsuario(["ADMIN", "GERENTE", "OPERADOR"]);
  const p = await prisma.pessoa.findUniqueOrThrow({ where: { id }, select: { areaCliente: true, email: true } });
  if (!p.areaCliente && !p.email) return { ok: false, mensagem: "Cadastre o e-mail do cliente antes de habilitar a Área do Cliente." };
  await prisma.pessoa.update({ where: { id }, data: { areaCliente: !p.areaCliente } });
  revalidatePath(`/clientes/${id}`);
  return { ok: true, mensagem: p.areaCliente ? "Área do Cliente desabilitada" : "Área do Cliente habilitada" };
}

const PODE_FUNC = ["ADMIN", "GERENTE"] as const;

export async function salvarFuncionarioForm(_: Resultado, form: FormData): Promise<Resultado> {
  const u = await exigirUsuario([...PODE_FUNC]);
  let destino: string;
  try {
    const d = JSON.parse(String(form.get("dados"))) as DadosFuncionario & { id?: string };
    const f = await salvarFuncionario(d, u, d.id);
    const foto = form.get("foto");
    if (foto instanceof File && foto.size > 0) {
      if (foto.size > LIMITE_ARQUIVO) throw new Error("A foto passa de 5 MB");
      if (!/^image\/(jpeg|gif|png|webp)$/.test(foto.type)) throw new Error("A foto deve ser JPG, GIF ou PNG");
      await prisma.usuario.update({ where: { id: f.id }, data: { foto: Buffer.from(await foto.arrayBuffer()), fotoTipo: foto.type } });
    }
    if (form.get("removerFoto") === "1") await prisma.usuario.update({ where: { id: f.id }, data: { foto: null, fotoTipo: null } });
    for (const a of form.getAll("anexos")) await gravarAnexo("USUARIO", f.id, a, u.id);
    revalidatePath("/funcionarios");
    destino = `/funcionarios/${f.id}`;
  } catch (e) {
    return erro(e);
  }
  redirect(destino);
}

export async function excluirFuncionarioAcao(id: string) {
  const u = await exigirUsuario(["ADMIN"]);
  try {
    const r = await excluirFuncionario(id, u.id);
    revalidatePath("/funcionarios");
    return r;
  } catch (e) { return erro(e); }
}
