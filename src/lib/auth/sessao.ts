import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { conferirSenha } from "./senha";

export const COOKIE = "mxerp_sessao";
export const DURACAO_MS = 12 * 3600 * 1000; // um expediente; renova enquanto a pessoa usa

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export async function criarSessao(usuarioId: string, ip?: string | null) {
  const token = randomBytes(32).toString("base64url");
  await prisma.sessao.create({ data: { tokenHash: hash(token), usuarioId, ip: ip ?? null, expira: new Date(Date.now() + DURACAO_MS) } });
  return token;
}

/** Usuário da sessão, ou null se o token não existe, expirou ou o usuário foi desativado. Renova a validade depois da metade. */
export async function usuarioDoToken(token: string | undefined | null) {
  if (!token) return null;
  const s = await prisma.sessao.findUnique({ where: { tokenHash: hash(token) }, include: { usuario: { omit: { foto: true, senhaHash: false } } } });
  if (!s || s.expira < new Date() || !s.usuario.ativo || !s.usuario.acessoSistema) return null;
  if (s.expira.getTime() - Date.now() < DURACAO_MS / 2)
    await prisma.sessao.update({ where: { id: s.id }, data: { expira: new Date(Date.now() + DURACAO_MS) } });
  return s.usuario;
}

export async function encerrarSessao(token: string | undefined | null) {
  if (token) await prisma.sessao.deleteMany({ where: { tokenHash: hash(token) } });
}

// tentativas erradas por e-mail+ip: 5 erros bloqueiam por 15 minutos
const falhas = new Map<string, { n: number; ate: number }>();

export async function autenticar(email: string, senha: string, ip: string) {
  // o IP vem do X-Forwarded-For, que qualquer um pode trocar: o e-mail também tem um limite próprio (20 erros)
  const chaves = [{ k: `${email.toLowerCase().trim()}|${ip}`, max: 5 }, { k: `${email.toLowerCase().trim()}|*`, max: 20 }];
  for (const { k, max } of chaves) {
    const f = falhas.get(k);
    if (f && f.n >= max && f.ate > Date.now()) throw new Error("Muitas tentativas. Espere 15 minutos e tente de novo.");
  }
  const u = await prisma.usuario.findUnique({ where: { email: email.toLowerCase().trim() } });
  const ok = !!u && u.ativo && u.acessoSistema && !!u.senhaHash && (await conferirSenha(senha, u.senhaHash));
  if (!ok) {
    for (const { k } of chaves) {
      const f = falhas.get(k);
      falhas.set(k, { n: (f && f.ate > Date.now() ? f.n : 0) + 1, ate: Date.now() + 15 * 60000 });
    }
    return null;
  }
  for (const { k } of chaves) falhas.delete(k);
  return u!;
}
