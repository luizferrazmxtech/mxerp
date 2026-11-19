import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";
import { cifrar, decifrar } from "@/lib/seguranca/segredos";

/**
 * E-mail de saída do ERP (SMTP): usado pelos contratos para mandar o boleto e o lembrete de pagamento.
 * Fica em Configuracao "email"; a senha é guardada cifrada com a chave do servidor (.env), como as do Inter.
 */
export type ConfigEmail = { host: string; porta: number; seguro: boolean; usuario: string; senhaCifrada: string; remetente: string; nomeRemetente: string; copiaPara: string };
export type ConfigEmailTela = Omit<ConfigEmail, "senhaCifrada"> & { temSenha: boolean };

export type Mensagem = { para: string; assunto: string; texto: string; anexos?: { nome: string; conteudo: Buffer; tipo?: string }[] };
/** Quem entrega a mensagem (nos testes, um falso). */
export type Transporte = (m: Mensagem & { de: string; copiaOculta?: string }) => Promise<void>;

export class EmailError extends Error {}

export async function configEmail(): Promise<ConfigEmail | null> {
  const c = await prisma.configuracao.findUnique({ where: { chave: "email" } });
  const v = c?.valor as Partial<ConfigEmail> | undefined;
  if (!v?.host || !v.remetente) return null;
  return { host: v.host, porta: Number(v.porta) || 587, seguro: !!v.seguro, usuario: v.usuario ?? "", senhaCifrada: v.senhaCifrada ?? "", remetente: v.remetente, nomeRemetente: v.nomeRemetente ?? "", copiaPara: v.copiaPara ?? "" };
}

export async function configEmailTela(): Promise<ConfigEmailTela | null> {
  const c = await configEmail();
  if (!c) return null;
  const { senhaCifrada, ...resto } = c;
  return { ...resto, temSenha: !!senhaCifrada };
}

export async function salvarConfigEmail(d: Omit<ConfigEmail, "senhaCifrada"> & { senha?: string }) {
  const atual = await configEmail();
  if (!d.host.trim()) throw new EmailError("Informe o servidor SMTP");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.remetente.trim())) throw new EmailError("Informe o e-mail do remetente");
  const valor: ConfigEmail = {
    host: d.host.trim(), porta: Math.trunc(d.porta) || 587, seguro: d.seguro, usuario: d.usuario.trim(), remetente: d.remetente.trim(),
    nomeRemetente: d.nomeRemetente.trim(), copiaPara: d.copiaPara.trim(),
    senhaCifrada: d.senha ? cifrar(d.senha) : atual?.senhaCifrada ?? "",
  };
  await prisma.configuracao.upsert({ where: { chave: "email" }, create: { chave: "email", valor }, update: { valor } });
}

function transporteSmtp(c: ConfigEmail): Transporte {
  const t = nodemailer.createTransport({
    host: c.host, port: c.porta, secure: c.seguro, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    auth: c.usuario ? { user: c.usuario, pass: c.senhaCifrada ? decifrar(c.senhaCifrada) : "" } : undefined,
  });
  return async (m) => {
    await t.sendMail({
      from: m.de, to: m.para, bcc: m.copiaOculta || undefined, subject: m.assunto, text: m.texto,
      attachments: m.anexos?.map((a) => ({ filename: a.nome, content: a.conteudo, contentType: a.tipo })),
    });
  };
}

/** Manda um e-mail pela configuração salva. Sem configuração, avisa onde configurar. */
export async function enviarEmail(m: Mensagem, opts: { transporte?: Transporte } = {}) {
  const c = await configEmail();
  if (!c) throw new EmailError("Configure o e-mail de envio em Contratos → Configurações");
  const de = c.nomeRemetente ? `"${c.nomeRemetente.replace(/"/g, "")}" <${c.remetente}>` : c.remetente;
  try {
    await (opts.transporte ?? transporteSmtp(c))({ ...m, de, copiaOculta: c.copiaPara });
  } catch (e) {
    throw new EmailError(`Falha ao enviar o e-mail: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Troca as [tags] pelos valores. */
export function preencher(texto: string, valores: Record<string, string>) {
  return texto.replace(/\[([a-z_]+)\]/g, (t, k: string) => (k in valores ? valores[k] : t));
}
