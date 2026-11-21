import nodemailer from "nodemailer";
import { ler, salvar } from "./config";
import { cifrar, decifrar } from "./segredos";

export type Mensagem = { para: string; assunto: string; texto: string; anexos?: { nome: string; conteudo: Buffer }[] };
/** Quem entrega (nos testes, um falso). */
export type Transporte = (m: Mensagem & { de: string }) => Promise<void>;

let transporteTeste: Transporte | null = null;
export const usarTransporteDeTeste = (t: Transporte | null) => { transporteTeste = t; };

export async function salvarSmtp(d: { host: string; porta: number; seguro: boolean; usuario: string; senha?: string; remetente: string }) {
  const atual = await ler("smtp");
  if (!d.host.trim()) throw new Error("Informe o servidor SMTP");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.remetente.trim())) throw new Error("Informe o e-mail do remetente");
  await salvar("smtp", {
    host: d.host.trim(), porta: d.porta || 587, seguro: d.seguro, usuario: d.usuario.trim(), remetente: d.remetente.trim(),
    senhaCifrada: d.senha ? cifrar(d.senha) : atual?.senhaCifrada ?? "",
  });
}

export async function enviarEmail(m: Mensagem) {
  const c = await ler("smtp");
  const geral = await ler("geral");
  if (!c && !transporteTeste) throw new Error("Configure o e-mail de envio em Configurações");
  const de = `"${geral.nomeEmpresa}" <${c?.remetente ?? "teste@teste"}>`;
  if (transporteTeste) return transporteTeste({ ...m, de });
  const t = nodemailer.createTransport({
    host: c!.host, port: c!.porta, secure: c!.seguro, connectionTimeout: 15000, socketTimeout: 30000,
    auth: c!.usuario ? { user: c!.usuario, pass: c!.senhaCifrada ? decifrar(c!.senhaCifrada) : "" } : undefined,
  });
  await t.sendMail({ from: de, to: m.para, subject: m.assunto, text: m.texto, attachments: m.anexos?.map((a) => ({ filename: a.nome, content: a.conteudo })) });
}
