import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { conferirSenha, hashSenha } from "@/lib/auth/senha";
import { comUsuario, semAuditoria } from "@/lib/auditoria/registro";

/**
 * Área do Cliente: o cliente final entra com CPF/CNPJ (ou e-mail) e uma senha própria, que ele mesmo cria
 * pelo link de convite gerado no cadastro do cliente. A sessão é separada da dos funcionários (outro cookie,
 * outra tabela), então um cliente nunca chega às telas do ERP.
 */
export const COOKIE_CLIENTE = "mxerp_cliente";
export const DURACAO_CLIENTE_MS = 7 * 24 * 3600 * 1000; // uma semana; renova enquanto o cliente usa
export const VALIDADE_CONVITE_MS = 7 * 24 * 3600 * 1000;
export const VALIDADE_TROCA_MS = 2 * 3600 * 1000; // "esqueci minha senha"

export class PortalError extends Error {}

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const digitos = (s: string) => s.replace(/\D/g, "");

export async function criarSessaoCliente(pessoaId: string, ip?: string | null) {
  const token = randomBytes(32).toString("base64url");
  await prisma.sessaoCliente.create({ data: { tokenHash: hash(token), pessoaId, ip: ip ?? null, expira: new Date(Date.now() + DURACAO_CLIENTE_MS) } });
  // no modo só leitura (licença da Central) o banco recusa a gravação: o cliente entra do mesmo jeito
  await semAuditoria(() => prisma.pessoa.update({ where: { id: pessoaId }, data: { portalUltimoAcesso: new Date() } })).catch(() => {});
  return token;
}

/** Cliente da sessão, ou null se o token não existe, expirou ou a Área do Cliente foi desabilitada no cadastro. */
export async function clienteDoToken(token: string | undefined | null) {
  if (!token) return null;
  const s = await prisma.sessaoCliente.findUnique({
    where: { tokenHash: hash(token) },
    include: { pessoa: { select: { id: true, nome: true, fantasia: true, documento: true, email: true, tipoPessoa: true, areaCliente: true, ativo: true } } },
  });
  if (!s || s.expira < new Date() || !s.pessoa.areaCliente || !s.pessoa.ativo) return null;
  if (s.expira.getTime() - Date.now() < DURACAO_CLIENTE_MS / 2)
    await prisma.sessaoCliente.update({ where: { id: s.id }, data: { expira: new Date(Date.now() + DURACAO_CLIENTE_MS) } });
  return s.pessoa;
}

export type ClientePortal = NonNullable<Awaited<ReturnType<typeof clienteDoToken>>>;

export async function encerrarSessaoCliente(token: string | undefined | null) {
  if (token) await prisma.sessaoCliente.deleteMany({ where: { tokenHash: hash(token) } });
}

// tentativas erradas por login+ip: 5 erros bloqueiam por 15 minutos (e 20 por login, de qualquer IP)
const falhas = new Map<string, { n: number; ate: number }>();

/** Acha o cliente pelo CPF/CNPJ (só dígitos) ou pelo e-mail. Com o mesmo e-mail em mais de um cadastro, exige o documento. */
async function acharCliente(login: string) {
  const l = login.trim();
  if (l.includes("@")) {
    const ps = await prisma.pessoa.findMany({ where: { email: { equals: l, mode: "insensitive" }, areaCliente: true, ativo: true }, take: 2 });
    if (ps.length > 1) throw new PortalError("Este e-mail está em mais de um cadastro. Entre com o CPF ou CNPJ.");
    return ps[0] ?? null;
  }
  const d = digitos(l);
  if (d.length !== 11 && d.length !== 14) return null;
  return prisma.pessoa.findUnique({ where: { documento: d } });
}

export async function autenticarCliente(login: string, senha: string, ip: string) {
  const id = login.toLowerCase().replace(/[.\-/\s]/g, "");
  const chaves = [{ k: `${id}|${ip}`, max: 5 }, { k: `${id}|*`, max: 20 }];
  for (const { k, max } of chaves) {
    const f = falhas.get(k);
    if (f && f.n >= max && f.ate > Date.now()) throw new PortalError("Muitas tentativas. Espere 15 minutos e tente de novo.");
  }
  const p = await acharCliente(login);
  const ok = !!p && p.areaCliente && p.ativo && !!p.portalSenhaHash && (await conferirSenha(senha, p.portalSenhaHash));
  if (!ok) {
    for (const { k } of chaves) {
      const f = falhas.get(k);
      falhas.set(k, { n: (f && f.ate > Date.now() ? f.n : 0) + 1, ate: Date.now() + 15 * 60000 });
    }
    return null;
  }
  for (const { k } of chaves) falhas.delete(k);
  return p!;
}

/**
 * Gera o link para o cliente criar (ou trocar) a senha. Só o hash fica no banco; um link novo invalida o anterior.
 * Também habilita a Área do Cliente no cadastro.
 */
export async function gerarConvite(pessoaId: string, validadeMs = VALIDADE_CONVITE_MS) {
  const token = randomBytes(24).toString("base64url");
  await prisma.pessoa.update({
    where: { id: pessoaId },
    data: { areaCliente: true, portalConviteHash: hash(token), portalConviteExpira: new Date(Date.now() + validadeMs) },
  });
  return token;
}

/** Cliente dono de um link de convite válido (para a tela de criar senha). */
export async function clienteDoConvite(token: string) {
  if (!token || token.length < 20) return null;
  const p = await prisma.pessoa.findUnique({ where: { portalConviteHash: hash(token) }, select: { id: true, nome: true, documento: true, areaCliente: true, ativo: true, portalConviteExpira: true, portalSenhaHash: true } });
  if (!p || !p.areaCliente || !p.ativo || !p.portalConviteExpira || p.portalConviteExpira < new Date()) return null;
  return { id: p.id, nome: p.nome, documento: p.documento, temSenha: !!p.portalSenhaHash };
}

/** Grava a senha pelo link (que deixa de valer) e encerra as sessões abertas com a senha antiga. */
export async function definirSenhaPorConvite(token: string, senha: string, ip?: string | null) {
  const p = await clienteDoConvite(token);
  if (!p) throw new PortalError("Este link expirou ou já foi usado. Peça um novo à empresa ou use \"Esqueci minha senha\".");
  const senhaHash = await hashSenha(senha);
  await comUsuario({ usuarioId: null, usuarioNome: `Cliente (Área do Cliente)`, ip: ip ?? null }, async () => {
    await prisma.pessoa.update({ where: { id: p.id }, data: { portalSenhaHash: senhaHash, portalConviteHash: null, portalConviteExpira: null } });
  });
  await prisma.sessaoCliente.deleteMany({ where: { pessoaId: p.id } });
  return p;
}

/** Desabilita a Área do Cliente: apaga a senha, o link e as sessões (o cliente sai na hora). */
export async function desabilitarPortal(pessoaId: string) {
  await prisma.pessoa.update({ where: { id: pessoaId }, data: { areaCliente: false, portalSenhaHash: null, portalConviteHash: null, portalConviteExpira: null } });
  await prisma.sessaoCliente.deleteMany({ where: { pessoaId } });
}

/**
 * "Esqueci minha senha": gera um link de 2 horas para o e-mail do cadastro. Devolve null quando não há
 * cliente com acesso (a tela mostra sempre a mesma mensagem, para não revelar quem é cliente).
 */
export async function pedirTrocaSenha(login: string) {
  let p;
  try { p = await acharCliente(login); } catch { return null; }
  if (!p || !p.areaCliente || !p.ativo || !p.email) return null;
  const token = await gerarConvite(p.id, VALIDADE_TROCA_MS);
  return { token, email: p.email, nome: p.fantasia || p.nome };
}
