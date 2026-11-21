import { createSign } from "node:crypto";
import { prisma } from "@/lib/db";
import { cifrar, decifrar } from "@/lib/seguranca/segredos";
import { baseLinks } from "@/lib/financeiro/boletos";

/**
 * Google Agenda das equipes: cada OS com agendamento vira um evento na agenda (calendário) da equipe, e o técnico
 * vê no celular. Usa uma conta de serviço do Google Cloud (arquivo .json): cada agenda de equipe é compartilhada
 * com o e-mail da conta de serviço com "Fazer alterações nos eventos". Não precisa de login do Google no ERP.
 * A chave privada fica cifrada em Configuracao "googleagenda". Toda chamada aceita um fetch falso (testes).
 */
export const URL_TOKEN = "https://oauth2.googleapis.com/token";
export const URL_AGENDA = "https://www.googleapis.com/calendar/v3";
const ESCOPO = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly";

export type ConfigAgenda = {
  ativo: boolean;
  contaServico: string; // e-mail da conta de serviço (client_email)
  chaveCifrada: string; // private_key do .json, cifrada
  agendaPadrao: string; // agenda das OS sem equipe (ou sem agenda na equipe); vazio = não manda
  duracaoPadraoMin: number;
};
export type ConfigAgendaTela = Omit<ConfigAgenda, "chaveCifrada"> & { temChave: boolean };
export type OpcoesAgenda = { fetch?: typeof fetch };
export class AgendaError extends Error {}

const PADRAO: ConfigAgenda = { ativo: false, contaServico: "", chaveCifrada: "", agendaPadrao: "", duracaoPadraoMin: 120 };

export async function configAgenda(): Promise<ConfigAgenda> {
  const c = await prisma.configuracao.findUnique({ where: { chave: "googleagenda" } });
  return { ...PADRAO, ...((c?.valor ?? {}) as Partial<ConfigAgenda>) };
}
export async function configAgendaTela(): Promise<ConfigAgendaTela> {
  const { chaveCifrada, ...resto } = await configAgenda();
  return { ...resto, temChave: !!chaveCifrada };
}

/** Lê o .json da conta de serviço (o que o Google Cloud baixa em "Criar chave"). */
export function lerContaServico(json: string) {
  let o: { type?: string; client_email?: string; private_key?: string };
  try { o = JSON.parse(json); } catch { throw new AgendaError("O arquivo não é o .json da conta de serviço do Google"); }
  if (o.type !== "service_account" || !o.client_email || !o.private_key?.includes("PRIVATE KEY")) throw new AgendaError("O arquivo não é o .json de uma conta de serviço (falta client_email ou private_key)");
  return { email: o.client_email, chave: o.private_key };
}

export async function salvarConfigAgenda(d: { ativo: boolean; json?: string; apagarChave?: boolean; agendaPadrao: string; duracaoPadraoMin: number; equipes?: Record<string, string> }) {
  const atual = await configAgenda();
  let { contaServico, chaveCifrada } = atual;
  if (d.apagarChave) { contaServico = ""; chaveCifrada = ""; }
  if (d.json?.trim()) { const cs = lerContaServico(d.json.trim()); contaServico = cs.email; chaveCifrada = cifrar(cs.chave); }
  if (d.ativo && !chaveCifrada) throw new AgendaError("Envie o arquivo .json da conta de serviço do Google");
  const valor: ConfigAgenda = { ativo: d.ativo, contaServico, chaveCifrada, agendaPadrao: limparId(d.agendaPadrao), duracaoPadraoMin: Math.min(Math.max(Math.trunc(d.duracaoPadraoMin) || 120, 15), 24 * 60) };
  await prisma.$transaction(async (tx) => {
    await tx.configuracao.upsert({ where: { chave: "googleagenda" }, create: { chave: "googleagenda", valor }, update: { valor } });
    for (const [id, agenda] of Object.entries(d.equipes ?? {})) await tx.equipe.update({ where: { id }, data: { googleAgendaId: limparId(agenda) || null } });
  });
  cacheToken = null;
  return valor;
}

/** Aceita o ID da agenda ou o link de incorporação/compartilhamento copiado do Google Agenda. */
export function limparId(s: string) {
  const t = (s ?? "").trim();
  const m = t.match(/[?&]src=([^&]+)/) ?? t.match(/calendar\/ical\/([^/]+)\//);
  return m ? decodeURIComponent(m[1]) : t;
}

let cacheToken: { token: string; ate: number; de: string } | null = null;
const b64 = (x: string | Buffer) => Buffer.from(x).toString("base64url");

/** Token de acesso da conta de serviço (JWT assinado com a chave privada, troca no Google; vale 1 hora). */
async function token(c: ConfigAgenda, opts: OpcoesAgenda) {
  if (!c.contaServico || !c.chaveCifrada) throw new AgendaError("Google Agenda não configurado (Configurações › Integrações › Google Agenda)");
  if (!opts.fetch && cacheToken && cacheToken.de === c.contaServico && cacheToken.ate > Date.now()) return cacheToken.token;
  const agora = Math.floor(Date.now() / 1000);
  const corpo = `${b64(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64(JSON.stringify({ iss: c.contaServico, scope: ESCOPO, aud: URL_TOKEN, iat: agora, exp: agora + 3600 }))}`;
  const assinatura = createSign("RSA-SHA256").update(corpo).sign(decifrar(c.chaveCifrada));
  const r = await http("POST", URL_TOKEN, null, `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${corpo}.${b64(assinatura)}`, opts, "application/x-www-form-urlencoded");
  const t = String((r as { access_token?: string })?.access_token ?? "");
  if (!t) throw new AgendaError("O Google não devolveu o token de acesso");
  if (!opts.fetch) cacheToken = { token: t, ate: Date.now() + 50 * 60_000, de: c.contaServico };
  return t;
}

class ErroHttp extends AgendaError { constructor(m: string, public status: number) { super(m); } }

async function http(metodo: string, url: string, bearer: string | null, corpo: string | null, opts: OpcoesAgenda, tipo = "application/json"): Promise<unknown> {
  if (process.env.NODE_ENV === "test" && !opts.fetch) throw new AgendaError("Nos testes o Google só é chamado com um fetch falso");
  let r: Response;
  try {
    r = await (opts.fetch ?? fetch)(url, { method: metodo, headers: { Accept: "application/json", ...(corpo ? { "Content-Type": tipo } : {}), ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: corpo ?? undefined, signal: AbortSignal.timeout(15000) });
  } catch (e) {
    throw new AgendaError(`Sem acesso ao Google: ${e instanceof Error ? e.message : String(e)}`);
  }
  const texto = await r.text();
  let json: unknown = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* sem corpo */ }
  if (!r.ok) {
    const e = json as { error?: { message?: string } | string; error_description?: string } | null;
    const m = e?.error_description ?? (typeof e?.error === "object" ? e.error.message : e?.error) ?? texto.slice(0, 200);
    if (r.status === 404) throw new ErroHttp(`Agenda ou evento não encontrado (404). Confira o ID da agenda e se ela foi compartilhada com ${"a conta de serviço"}.`, 404);
    if (r.status === 403) throw new ErroHttp(`Sem permissão na agenda (403): compartilhe a agenda com a conta de serviço com "Fazer alterações nos eventos". ${m}`, 403);
    throw new ErroHttp(`Google respondeu ${r.status}: ${m}`, r.status);
  }
  return json;
}

async function api<T>(metodo: string, caminho: string, corpo: unknown, opts: OpcoesAgenda): Promise<T> {
  const c = await configAgenda();
  return (await http(metodo, `${URL_AGENDA}${caminho}`, await token(c, opts), corpo ? JSON.stringify(corpo) : null, opts)) as T;
}
const cal = (id: string) => `/calendars/${encodeURIComponent(id)}`;

/** Confere cada agenda configurada (nome e acesso de escrita). */
export async function testarAgendas(opts: OpcoesAgenda = {}) {
  const c = await configAgenda();
  const equipes = await prisma.equipe.findMany({ where: { ativo: true, googleAgendaId: { not: null } }, select: { nome: true, googleAgendaId: true } });
  const alvos = [...(c.agendaPadrao ? [{ nome: "Agenda padrão", googleAgendaId: c.agendaPadrao }] : []), ...equipes];
  if (!alvos.length) return { ok: true, mensagem: "Conta de serviço salva. Agora informe a agenda de cada equipe (ou a agenda padrão)." };
  const linhas: string[] = [];
  let ok = true;
  for (const a of alvos) {
    try {
      const r = await api<{ summary?: string; accessRole?: string }>("GET", `/users/me/calendarList/${encodeURIComponent(a.googleAgendaId!)}`, null, opts).catch(async (e) => {
        // agenda compartilhada ainda não "aceita" na lista da conta de serviço: lê direto
        if ((e as ErroHttp).status === 404) return { ...(await api<{ summary?: string }>("GET", cal(a.googleAgendaId!), null, opts)), accessRole: "writer" };
        throw e;
      });
      const escreve = r.accessRole === "owner" || r.accessRole === "writer";
      if (!escreve) ok = false;
      linhas.push(`${a.nome}: ${r.summary ?? "ok"}${escreve ? "" : " (só leitura: dê permissão para fazer alterações nos eventos)"}`);
    } catch (e) {
      ok = false;
      linhas.push(`${a.nome}: ${(e as Error).message}`);
    }
  }
  return { ok, mensagem: linhas.join(" · ") };
}

const SEM_EVENTO = new Set(["CANCELADA", "DEVOLVIDA_SEM_REPARO"]);
const FEITAS = new Set(["CONCLUIDA", "FATURADA"]);
const end = (p: { logradouro?: string | null; numero?: string | null; bairro?: string | null; cidade?: string | null; uf?: string | null }) =>
  [[p.logradouro, p.numero].filter(Boolean).join(", "), p.bairro, [p.cidade, p.uf].filter(Boolean).join("/")].filter(Boolean).join(" - ");

/** Monta o evento da OS (título, local, descrição com equipamentos e link). */
export async function eventoDaOs(osId: string, duracaoPadrao: number) {
  const o = await prisma.ordemServico.findUniqueOrThrow({
    where: { id: osId },
    include: { cliente: { select: { nome: true, logradouro: true, numero: true, bairro: true, cidade: true, uf: true, telefone: true, celular: true } }, equipe: { select: { nome: true } }, situacaoCfg: { select: { nome: true } }, equipamentos: { orderBy: { ordem: "asc" } } },
  });
  const tecnicos = o.tecnicoIds.length ? await prisma.usuario.findMany({ where: { id: { in: o.tecnicoIds } }, select: { nome: true } }) : [];
  const base = await baseLinks();
  const inicio = o.agendaInicio!;
  const fim = new Date(inicio.getTime() + (o.agendaDuracaoMin || duracaoPadrao) * 60_000);
  const fone = o.cliente.celular || o.cliente.telefone;
  const descricao = [
    `OS nº ${o.numero} · ${o.situacaoCfg?.nome ?? o.situacao}`,
    `Cliente: ${o.cliente.nome}${fone ? ` · ${fone}` : ""}`,
    o.equipe ? `Equipe: ${o.equipe.nome}` : null,
    tecnicos.length ? `Técnicos: ${tecnicos.map((t) => t.nome).join(", ")}` : null,
    ...o.equipamentos.map((e) => `• ${[e.equipamento, e.marca, e.modelo].filter(Boolean).join(" ")}${e.defeitos ? `: ${e.defeitos}` : ""}`),
    o.observacoes ? `\n${o.observacoes}` : null,
    base ? `\nAbrir no ERP: ${base}/os/${o.id}` : null,
  ].filter(Boolean).join("\n");
  return {
    situacao: o.situacao,
    corpo: {
      summary: `${FEITAS.has(o.situacao) ? "✔ " : ""}OS ${o.numero} · ${o.cliente.nome}`,
      location: end(o.cliente) || undefined,
      description: descricao,
      start: { dateTime: inicio.toISOString(), timeZone: "America/Sao_Paulo" },
      end: { dateTime: fim.toISOString(), timeZone: "America/Sao_Paulo" },
      extendedProperties: { private: { mxerpOs: o.id } },
    },
  };
}

async function apagarEvento(agenda: string, evento: string, opts: OpcoesAgenda) {
  try { await api("DELETE", `${cal(agenda)}/events/${encodeURIComponent(evento)}`, null, opts); }
  catch (e) { if (![404, 410].includes((e as ErroHttp).status)) throw e; }
}

/**
 * Leva a OS para o Google Agenda: cria, atualiza, muda de agenda (trocou a equipe) ou apaga (sem agendamento,
 * cancelada). Erro não impede salvar a OS: fica gravado nela e o agendador tenta de novo.
 */
export async function sincronizarOsNaAgenda(osId: string, opts: OpcoesAgenda = {}) {
  const c = await configAgenda();
  if (!c.ativo) return "desligado";
  const o = await prisma.ordemServico.findUnique({ where: { id: osId }, select: { id: true, agendaInicio: true, situacao: true, googleEventoId: true, googleAgendaId: true, equipe: { select: { googleAgendaId: true } } } });
  if (!o) return "OS não encontrada";
  const destino = o.equipe?.googleAgendaId || c.agendaPadrao || null;
  const quer = !!o.agendaInicio && !!destino && !SEM_EVENTO.has(o.situacao);
  try {
    let eventoId = o.googleEventoId, agendaId = o.googleAgendaId;
    if (eventoId && agendaId && (!quer || agendaId !== destino)) {
      await apagarEvento(agendaId, eventoId, opts);
      eventoId = null; agendaId = null;
    }
    let r = "sem agendamento";
    if (quer) {
      const { corpo } = await eventoDaOs(o.id, c.duracaoPadraoMin);
      let ev: { id: string } | null = null;
      if (eventoId) {
        ev = await api<{ id: string }>("PUT", `${cal(destino!)}/events/${encodeURIComponent(eventoId)}`, corpo, opts).catch((e) => { if ((e as ErroHttp).status === 404 || (e as ErroHttp).status === 410) return null; throw e; });
      }
      ev ??= await api<{ id: string }>("POST", `${cal(destino!)}/events`, corpo, opts);
      r = eventoId === ev.id ? "atualizado" : "criado";
      eventoId = ev.id; agendaId = destino;
    } else if (o.googleEventoId) r = "removido";
    await prisma.ordemServico.update({ where: { id: o.id }, data: { googleEventoId: eventoId, googleAgendaId: agendaId, googleSincEm: new Date(), googleErro: null, googlePendente: false } });
    return r;
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    await prisma.ordemServico.update({ where: { id: o.id }, data: { googleErro: m.slice(0, 500), googlePendente: true } });
    return `erro: ${m}`;
  }
}

/** Para chamar depois de salvar/trocar a situação da OS: nunca lança erro. */
export async function aposMudarOs(osId: string) {
  try { await sincronizarOsNaAgenda(osId); } catch { /* fica pendente */ }
}

/** A OS vai ser excluída: apaga o evento antes (melhor esforço). */
export async function aposExcluirOs(evento: { googleEventoId: string | null; googleAgendaId: string | null }, opts: OpcoesAgenda = {}) {
  if (!evento.googleEventoId || !evento.googleAgendaId) return;
  try { if ((await configAgenda()).chaveCifrada) await apagarEvento(evento.googleAgendaId, evento.googleEventoId, opts); } catch { /* sem acesso: o evento fica órfão */ }
}

/**
 * Agendador: tenta de novo as OS que falharam e, com `todas`, reenvia todas as agendadas de hoje em diante
 * (depois de configurar a agenda de uma equipe, por exemplo).
 */
export async function sincronizarAgenda(opts: OpcoesAgenda & { todas?: boolean } = {}) {
  const c = await configAgenda();
  if (!c.ativo) return { ignorado: "Google Agenda desligado" } as const;
  const hoje = new Date(Date.now() - 24 * 3600_000);
  const oss = await prisma.ordemServico.findMany({
    where: opts.todas ? { OR: [{ agendaInicio: { gte: hoje } }, { googleEventoId: { not: null }, agendaInicio: null }] } : { googlePendente: true },
    select: { id: true, numero: true }, orderBy: { agendaInicio: "asc" }, take: 300,
  });
  const out = { total: oss.length, criados: 0, atualizados: 0, removidos: 0, erros: [] as string[] };
  for (const o of oss) {
    const r = await sincronizarOsNaAgenda(o.id, opts);
    if (r === "criado") out.criados++;
    else if (r === "atualizado") out.atualizados++;
    else if (r === "removido") out.removidos++;
    else if (r.startsWith("erro")) out.erros.push(`OS ${o.numero}: ${r.slice(6)}`);
  }
  return out;
}
