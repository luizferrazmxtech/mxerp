"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { conferirSenha, hashSenha } from "@/lib/auth/senha";
import { enviarEmail } from "@/lib/email/email";
import { registrarAuditoria } from "@/lib/auditoria/registro";
import { enderecoPublico, exigirCliente } from "@/lib/portal/atual";
import {
  autenticarCliente, COOKIE_CLIENTE, criarSessaoCliente, definirSenhaPorConvite, DURACAO_CLIENTE_MS, encerrarSessaoCliente, pedirTrocaSenha,
} from "@/lib/portal/sessao";

export type Estado = { erro?: string; ok?: string } | null;

async function ipEProtocolo() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local";
  return { ip, https: h.get("x-forwarded-proto") === "https" };
}

async function abrirSessao(pessoaId: string) {
  const { ip, https } = await ipEProtocolo();
  const token = await criarSessaoCliente(pessoaId, ip);
  (await cookies()).set(COOKIE_CLIENTE, token, { httpOnly: true, sameSite: "lax", secure: https, path: "/area-cliente", maxAge: DURACAO_CLIENTE_MS / 1000 });
}

const destinoSeguro = (v: string) => (v.startsWith("/area-cliente") && !v.startsWith("//") ? v : "/area-cliente");

export async function entrarCliente(_: Estado, form: FormData): Promise<Estado> {
  const login = String(form.get("login") ?? "").trim();
  const senha = String(form.get("senha") ?? "");
  if (!login || !senha) return { erro: "Informe o CPF/CNPJ (ou e-mail) e a senha" };
  const { ip } = await ipEProtocolo();
  let p;
  try { p = await autenticarCliente(login, senha, ip); } catch (e) { return { erro: e instanceof Error ? e.message : String(e) }; }
  if (!p) return { erro: "CPF/CNPJ, e-mail ou senha incorretos" };
  await registrarAuditoria(null, { entidade: "AreaCliente", entidadeId: p.id, acao: "ENTRAR", descricao: `Cliente ${p.nome.slice(0, 120)} entrou na Área do Cliente (IP ${ip})` });
  await abrirSessao(p.id);
  redirect(destinoSeguro(String(form.get("voltar") ?? "")));
}

export async function sairCliente() {
  const c = await cookies();
  await encerrarSessaoCliente(c.get(COOKIE_CLIENTE)?.value);
  c.delete({ name: COOKIE_CLIENTE, path: "/area-cliente" });
  redirect("/area-cliente/entrar");
}

/** Pelo link do convite (ou do "esqueci"): cria a senha e já entra. */
export async function definirSenha(_: Estado, form: FormData): Promise<Estado> {
  const senha = String(form.get("senha") ?? "");
  if (senha !== String(form.get("confirma") ?? "")) return { erro: "As senhas não batem" };
  const { ip } = await ipEProtocolo();
  let p;
  try { p = await definirSenhaPorConvite(String(form.get("token") ?? ""), senha, ip); } catch (e) { return { erro: e instanceof Error ? e.message : String(e) }; }
  await abrirSessao(p.id);
  redirect("/area-cliente");
}

export async function esqueciSenha(_: Estado, form: FormData): Promise<Estado> {
  const login = String(form.get("login") ?? "").trim();
  if (!login) return { erro: "Informe o CPF/CNPJ ou o e-mail" };
  const aviso = { ok: "Se houver um acesso com esses dados, mandamos um link para o e-mail do cadastro. Ele vale por 2 horas. Não chegou? Fale com a empresa." };
  const r = await pedirTrocaSenha(login);
  if (!r) return aviso;
  const link = `${await enderecoPublico()}/area-cliente/senha/${r.token}`;
  try {
    await enviarEmail({
      para: r.email,
      assunto: "Área do Cliente: criar uma nova senha",
      texto: `Olá, ${r.nome}.\n\nPara criar uma nova senha da Área do Cliente, abra o link abaixo (vale por 2 horas):\n${link}\n\nSe não foi você que pediu, ignore este e-mail.`,
    });
  } catch { /* sem e-mail configurado: a mensagem é a mesma, para não revelar quem é cliente */ }
  return aviso;
}

/** Trocar a senha estando logado (Minha conta). */
export async function trocarSenhaCliente(_: Estado, form: FormData): Promise<Estado> {
  const c = await exigirCliente();
  const atual = String(form.get("atual") ?? ""), nova = String(form.get("nova") ?? "");
  if (nova !== String(form.get("confirma") ?? "")) return { erro: "As senhas novas não batem" };
  const p = await prisma.pessoa.findUniqueOrThrow({ where: { id: c.id }, select: { portalSenhaHash: true } });
  if (!p.portalSenhaHash || !(await conferirSenha(atual, p.portalSenhaHash))) return { erro: "A senha atual não confere" };
  try {
    const h = await hashSenha(nova);
    await prisma.pessoa.update({ where: { id: c.id }, data: { portalSenhaHash: h } });
  } catch (e) { return { erro: e instanceof Error ? e.message : String(e) }; }
  // encerra as outras sessões (outro celular, computador emprestado)
  const token = (await cookies()).get(COOKIE_CLIENTE)?.value;
  const { createHash } = await import("node:crypto");
  await prisma.sessaoCliente.deleteMany({ where: { pessoaId: c.id, tokenHash: { not: createHash("sha256").update(token ?? "").digest("hex") } } });
  return { ok: "Senha alterada. Os outros aparelhos conectados precisam entrar de novo." };
}
