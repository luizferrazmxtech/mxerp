import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_CLIENTE, clienteDoToken } from "./sessao";

/** Cliente logado na Área do Cliente (ou null). */
export async function clienteAtual() {
  return clienteDoToken((await cookies()).get(COOKIE_CLIENTE)?.value);
}

/** Para páginas e ações da Área do Cliente: sem login, volta para a tela de entrar. */
export async function exigirCliente() {
  const c = await clienteAtual();
  if (!c) redirect("/area-cliente/entrar");
  return c;
}

/**
 * Endereço do sistema para os links mandados ao cliente (convite, troca de senha). Usa URL_PUBLICA do .env
 * quando existe (na VPS); senão o endereço pelo qual a pessoa abriu o sistema.
 */
export async function enderecoPublico() {
  const env = process.env.URL_PUBLICA?.trim().replace(/\/+$/, "");
  if (env) return env;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
