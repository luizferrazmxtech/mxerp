"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth/atual";
import { enviarEmail } from "@/lib/email/email";
import { enderecoPublico } from "./atual";
import { desabilitarPortal, gerarConvite } from "./sessao";
import { nomeEmpresaPortal } from "./empresa";

/** Ações do ERP (cadastro do cliente) para liberar e tirar o acesso da Área do Cliente. */
export type ResultadoPortal = { ok: boolean; mensagem: string; link?: string } | null;

const PODE = ["ADMIN", "GERENTE", "OPERADOR"] as const;

async function linkConvite(id: string) {
  const p = await prisma.pessoa.findUniqueOrThrow({ where: { id }, select: { documento: true, email: true, cliente: true } });
  if (!p.cliente) throw new Error("Só clientes têm Área do Cliente");
  if (!p.documento && !p.email) throw new Error("Cadastre o CPF/CNPJ ou o e-mail do cliente: é com ele que o cliente entra.");
  const token = await gerarConvite(id);
  revalidatePath(`/clientes/${id}`);
  return `${await enderecoPublico()}/area-cliente/senha/${token}`;
}

/** Habilita (se preciso) e gera um link novo para o cliente criar a senha. Vale 7 dias; o link anterior deixa de valer. */
export async function gerarLinkAreaCliente(id: string): Promise<ResultadoPortal> {
  await exigirUsuario([...PODE]);
  try {
    return { ok: true, mensagem: "Link gerado. Ele vale por 7 dias.", link: await linkConvite(id) };
  } catch (e) { return { ok: false, mensagem: e instanceof Error ? e.message : String(e) }; }
}

/** Gera o link e manda por e-mail para o cliente. */
export async function enviarLinkAreaCliente(id: string): Promise<ResultadoPortal> {
  await exigirUsuario([...PODE]);
  try {
    const p = await prisma.pessoa.findUniqueOrThrow({ where: { id }, select: { email: true, nome: true, fantasia: true } });
    if (!p.email) return { ok: false, mensagem: "O cliente não tem e-mail no cadastro. Copie o link e mande pelo WhatsApp." };
    const link = await linkConvite(id);
    const empresa = await nomeEmpresaPortal();
    await enviarEmail({
      para: p.email,
      assunto: `${empresa}: seu acesso à Área do Cliente`,
      texto: `Olá, ${p.fantasia || p.nome}.\n\nVocê agora tem acesso à Área do Cliente da ${empresa}, onde pode acompanhar suas ordens de serviço e compras e baixar notas fiscais (PDF e XML) e boletos.\n\nCrie a sua senha pelo link abaixo (vale por 7 dias):\n${link}\n\nDepois, é só entrar em ${link.replace(/\/senha\/.*$/, "")} com o seu CPF/CNPJ ou e-mail e a senha.`,
    });
    return { ok: true, mensagem: `Link mandado para ${p.email}.`, link };
  } catch (e) { return { ok: false, mensagem: e instanceof Error ? e.message : String(e) }; }
}

export async function desabilitarAreaCliente(id: string): Promise<ResultadoPortal> {
  await exigirUsuario([...PODE]);
  await desabilitarPortal(id);
  revalidatePath(`/clientes/${id}`);
  return { ok: true, mensagem: "Área do Cliente desabilitada. O cliente saiu na hora." };
}
