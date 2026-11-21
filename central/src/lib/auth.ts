import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { conferirSenha } from "./senha";

export const COOKIE = "central_sessao";
const DURACAO_MS = 12 * 3600 * 1000;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export async function criarSessao(adminId: string) {
  const token = randomBytes(32).toString("base64url");
  await prisma.sessao.create({ data: { tokenHash: hash(token), adminId, expira: new Date(Date.now() + DURACAO_MS) } });
  return token;
}

export async function adminDoToken(token?: string | null) {
  if (!token) return null;
  const s = await prisma.sessao.findUnique({ where: { tokenHash: hash(token) }, include: { admin: true } });
  if (!s || s.expira < new Date() || !s.admin.ativo) return null;
  if (s.expira.getTime() - Date.now() < DURACAO_MS / 2) await prisma.sessao.update({ where: { id: s.id }, data: { expira: new Date(Date.now() + DURACAO_MS) } });
  return s.admin;
}

export async function adminAtual() {
  return adminDoToken((await cookies()).get(COOKIE)?.value);
}

/** Para as ações: garante login (o middleware já barra as páginas). */
export async function exigirAdmin() {
  const a = await adminAtual();
  if (!a) redirect("/login");
  return a;
}

export async function encerrarSessao(token?: string | null) {
  if (token) await prisma.sessao.deleteMany({ where: { tokenHash: hash(token) } });
}

const falhas = new Map<string, { n: number; ate: number }>();
export async function autenticar(email: string, senha: string) {
  const k = email.toLowerCase().trim();
  const f = falhas.get(k);
  if (f && f.n >= 5 && f.ate > Date.now()) throw new Error("Muitas tentativas. Espere 15 minutos.");
  const a = await prisma.admin.findUnique({ where: { email: k } });
  const ok = !!a && a.ativo && (await conferirSenha(senha, a.senhaHash));
  if (!ok) { falhas.set(k, { n: (f && f.ate > Date.now() ? f.n : 0) + 1, ate: Date.now() + 15 * 60000 }); return null; }
  falhas.delete(k);
  return a!;
}

/** Rotas chamadas por máquinas (agendador, sistemas dos clientes): senha no cabeçalho. */
export function autorizadoCron(req: Request) {
  const s = process.env.CRON_SECRET;
  return !!s && req.headers.get("authorization") === `Bearer ${s}`;
}
