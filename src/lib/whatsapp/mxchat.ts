import { prisma } from "@/lib/db";
import { cifrar, decifrar } from "@/lib/seguranca/segredos";

/**
 * WhatsApp pelo MXChat (POST /backend/api/messages/send com Bearer token). Usado pela OS (status para o cliente)
 * e pelos contratos (cobrança e lembrete com o boleto em PDF). Fica em Configuracao "whatsapp"; o token é guardado
 * cifrado com a chave do servidor (.env), como as credenciais do Inter e a senha do SMTP.
 * Toda tentativa (enviada ou com erro) vira uma linha em MensagemWhatsapp: é o histórico mostrado nas telas.
 */
export const URL_MXCHAT = "https://mxchat.mxtech.inf.br/backend/api/messages/send";

export type ConfigWhatsapp = {
  ativo: boolean; url: string; tokenCifrado: string;
  salvarNoTicket: boolean; // a mensagem aparece no atendimento do MXChat (saveOnTicket)
  convidarAreaCliente: boolean; // cliente sem senha na Área do Cliente: [link_area_cliente] leva ao link de criar a senha
};
export type ConfigWhatsappTela = Omit<ConfigWhatsapp, "tokenCifrado"> & { temToken: boolean };

export type Arquivo = { nome: string; conteudo: Buffer; tipo: string };
export type EnvioMxchat = { url: string; token: string; numero: string; texto: string; arquivo?: Arquivo; salvarNoTicket: boolean };
/** Quem entrega a mensagem (nos testes, um falso: os testes nunca mandam mensagem de verdade). */
export type TransporteWhatsapp = (e: EnvioMxchat) => Promise<void>;

export class WhatsappError extends Error {}

const PADRAO: ConfigWhatsapp = { ativo: false, url: URL_MXCHAT, tokenCifrado: "", salvarNoTicket: true, convidarAreaCliente: true };

export async function configWhatsapp(): Promise<ConfigWhatsapp> {
  const c = await prisma.configuracao.findUnique({ where: { chave: "whatsapp" } });
  return { ...PADRAO, ...((c?.valor ?? {}) as Partial<ConfigWhatsapp>) };
}

export async function configWhatsappTela(): Promise<ConfigWhatsappTela> {
  const { tokenCifrado, ...resto } = await configWhatsapp();
  return { ...resto, temToken: !!tokenCifrado };
}

/** WhatsApp pronto para uso (ligado e com token)? */
export async function whatsappAtivo() {
  const c = await configWhatsapp();
  return c.ativo && !!c.tokenCifrado;
}

export async function salvarConfigWhatsapp(d: Omit<ConfigWhatsapp, "tokenCifrado"> & { token?: string; apagarToken?: boolean }) {
  const atual = await configWhatsapp();
  const url = d.url.trim() || URL_MXCHAT;
  if (!/^https:\/\/[^\s/]+\/\S*$/.test(url)) throw new WhatsappError("Endereço da API inválido (use https://…/backend/api/messages/send)");
  const tokenCifrado = d.apagarToken ? "" : d.token?.trim() ? cifrar(d.token.trim()) : atual.tokenCifrado;
  if (d.ativo && !tokenCifrado) throw new WhatsappError("Informe o token do MXChat para ligar o envio");
  const valor: ConfigWhatsapp = { ativo: d.ativo, url, tokenCifrado, salvarNoTicket: d.salvarNoTicket, convidarAreaCliente: d.convidarAreaCliente };
  await prisma.configuracao.upsert({ where: { chave: "whatsapp" }, create: { chave: "whatsapp", valor }, update: { valor } });
}

/**
 * Número no formato do WhatsApp (55 + DDD + número, só dígitos). Aceita "(11) 98765-4321", "+55 11 98765-4321",
 * "011987654321". Devolve null se não parecer um telefone brasileiro com DDD.
 */
export function numeroWhatsapp(fone: string | null | undefined): string | null {
  let d = (fone ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  if (d.startsWith("0") && (d.length === 11 || d.length === 12)) d = d.slice(1); // 0 + DDD
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return null;
}

/** Celular do cadastro (ou telefone fixo, se não houver celular) já no formato do WhatsApp. */
export const numeroDaPessoa = (p: { celular?: string | null; telefone?: string | null }) => numeroWhatsapp(p.celular) ?? numeroWhatsapp(p.telefone);

export { foneBonitoTela as foneBonito } from "./tipos";

const transporteMxchat: TransporteWhatsapp = async (e) => {
  const cab = { Authorization: `Bearer ${e.token}` };
  let corpo: BodyInit; let headers: Record<string, string> = cab;
  if (e.arquivo) {
    const f = new FormData();
    f.append("number", e.numero);
    f.append("body", e.texto);
    if (e.salvarNoTicket) f.append("saveOnTicket", "true");
    f.append("medias", new Blob([new Uint8Array(e.arquivo.conteudo)], { type: e.arquivo.tipo }), e.arquivo.nome);
    corpo = f;
  } else {
    headers = { ...cab, "Content-Type": "application/json" };
    corpo = JSON.stringify({ number: e.numero, body: e.texto, saveOnTicket: e.salvarNoTicket, linkPreview: true });
  }
  let r: Response;
  try {
    r = await fetch(e.url, { method: "POST", headers, body: corpo, signal: AbortSignal.timeout(30000) });
  } catch (err) {
    throw new WhatsappError(`Não foi possível falar com o MXChat: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!r.ok) {
    const txt = (await r.text().catch(() => "")).slice(0, 300);
    let m = txt;
    try { const j = JSON.parse(txt) as { error?: string; message?: string }; m = j.error ?? j.message ?? txt; } catch { /* texto puro */ }
    if (r.status === 401 || r.status === 403) throw new WhatsappError(`O MXChat recusou o token (${r.status}). Confira o token em Configurações → WhatsApp (MXChat).`);
    throw new WhatsappError(`O MXChat respondeu ${r.status}${m ? `: ${m}` : ""}`);
  }
};

export type Envio = {
  numero: string; texto: string; arquivo?: Arquivo;
  entidade: "OS" | "CONTRATO" | "TESTE" | "CONCILIACAO"; entidadeId?: string | null; pessoaId?: string | null;
  automatica?: boolean; usuarioNome?: string | null;
};

/**
 * Manda uma mensagem pelo MXChat e registra no histórico. Lança WhatsappError se não estiver configurado ou se o
 * MXChat recusar (o erro também fica no histórico, para aparecer na aba Envios).
 */
export async function enviarWhatsapp(m: Envio, opts: { transporte?: TransporteWhatsapp } = {}) {
  const numero = numeroWhatsapp(m.numero);
  const texto = m.texto.replace(/\r\n?/g, "\n").trim();
  const registrar = (situacao: "ENVIADA" | "ERRO", erro?: string) => prisma.mensagemWhatsapp.create({
    data: {
      numero: numero ?? m.numero, texto, arquivoNome: m.arquivo?.nome ?? null, entidade: m.entidade, entidadeId: m.entidadeId ?? null, pessoaId: m.pessoaId ?? null,
      situacao, erro: erro?.slice(0, 500) ?? null, automatica: !!m.automatica, usuarioNome: m.usuarioNome ?? null,
    },
  });
  const falhar = async (msg: string): Promise<never> => { await registrar("ERRO", msg); throw new WhatsappError(msg); };

  const c = await configWhatsapp();
  if (!c.ativo || !c.tokenCifrado) throw new WhatsappError("O WhatsApp (MXChat) não está ligado: configure em Configurações → WhatsApp (MXChat)");
  if (!numero) return falhar(`Número de WhatsApp inválido: "${m.numero || "vazio"}" (use DDD + número)`);
  if (!texto) return falhar("A mensagem está vazia");
  if (!opts.transporte && process.env.NODE_ENV === "test") throw new WhatsappError("Nos testes, passe um transporte falso (nunca manda mensagem de verdade)");
  try {
    await (opts.transporte ?? transporteMxchat)({ url: c.url, token: decifrar(c.tokenCifrado), numero, texto, arquivo: m.arquivo, salvarNoTicket: c.salvarNoTicket });
  } catch (e) {
    return falhar(e instanceof Error ? e.message : String(e));
  }
  return registrar("ENVIADA");
}
