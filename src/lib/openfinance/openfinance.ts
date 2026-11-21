import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cifrar, decifrar } from "@/lib/seguranca/segredos";
import { importarExtrato, type TransacaoExtrato } from "@/lib/financeiro/extrato";
import { diaSP, somarDias } from "@/lib/datas";

/**
 * Open Finance pelo agregador Pluggy: o cliente autoriza o banco (Itaú, Bradesco, BB, Caixa, Santander, Sicoob,
 * Nubank…) na janela do Pluggy Connect, e o extrato de cada conta ligada a uma conta bancária do ERP entra na
 * conciliação bancária igual ao do Inter (mesma regra de casamento e de baixa automática).
 * Credenciais (Client ID / Client Secret do painel do Pluggy) cifradas em Configuracao "openfinance".
 * Toda chamada aceita um fetch falso: os testes nunca falam com o Pluggy de verdade.
 */
export const URL_PLUGGY = "https://api.pluggy.ai";

export type ConfigOpenFinance = { ativo: boolean; clientId: string; clientSecretCifrado: string; diasRetroativos: number };
export type ConfigOpenFinanceTela = Omit<ConfigOpenFinance, "clientSecretCifrado"> & { temSecret: boolean };
/** `hoje`: o dia de hoje já como data civil (meia-noite UTC, igual a diaSP), para os testes. */
export type OpcoesOF = { fetch?: typeof fetch; hoje?: Date };
export class OpenFinanceError extends Error {}

const PADRAO: ConfigOpenFinance = { ativo: false, clientId: "", clientSecretCifrado: "", diasRetroativos: 30 };

export async function configOpenFinance(): Promise<ConfigOpenFinance> {
  const c = await prisma.configuracao.findUnique({ where: { chave: "openfinance" } });
  return { ...PADRAO, ...((c?.valor ?? {}) as Partial<ConfigOpenFinance>) };
}

export async function configOpenFinanceTela(): Promise<ConfigOpenFinanceTela> {
  const { clientSecretCifrado, ...resto } = await configOpenFinance();
  return { ...resto, temSecret: !!clientSecretCifrado };
}

export async function salvarConfigOpenFinance(d: { ativo: boolean; clientId: string; clientSecret?: string; apagarSecret?: boolean; diasRetroativos: number }) {
  const atual = await configOpenFinance();
  const clientSecretCifrado = d.apagarSecret ? "" : d.clientSecret?.trim() ? cifrar(d.clientSecret.trim()) : atual.clientSecretCifrado;
  if (d.ativo && (!d.clientId.trim() || !clientSecretCifrado)) throw new OpenFinanceError("Informe o Client ID e o Client Secret do Pluggy");
  const valor: ConfigOpenFinance = { ativo: d.ativo, clientId: d.clientId.trim(), clientSecretCifrado, diasRetroativos: Math.min(Math.max(Math.trunc(d.diasRetroativos) || 30, 1), 365) };
  await prisma.configuracao.upsert({ where: { chave: "openfinance" }, create: { chave: "openfinance", valor }, update: { valor } });
  // chave de API em cache era das credenciais antigas
  cacheChave = null;
  return valor;
}

let cacheChave: { chave: string; ate: number; de: string } | null = null;

/** Chave da API (vale 2 horas no Pluggy; guardada por 1h50). */
async function chaveApi(c: ConfigOpenFinance, opts: OpcoesOF) {
  if (!c.clientId || !c.clientSecretCifrado) throw new OpenFinanceError("Open Finance não configurado (Configurações › Integrações › Open Finance)");
  if (cacheChave && cacheChave.de === c.clientId && cacheChave.ate > Date.now() && !opts.fetch) return cacheChave.chave;
  const r = await bruto("POST", "/auth", null, { clientId: c.clientId, clientSecret: decifrar(c.clientSecretCifrado) }, opts);
  const chave = String((r as { apiKey?: string }).apiKey ?? "");
  if (!chave) throw new OpenFinanceError("O Pluggy não devolveu a chave da API");
  if (!opts.fetch) cacheChave = { chave, ate: Date.now() + 110 * 60_000, de: c.clientId };
  return chave;
}

async function bruto(metodo: "GET" | "POST" | "PATCH" | "DELETE", caminho: string, chave: string | null, corpo: unknown, opts: OpcoesOF): Promise<unknown> {
  if (process.env.NODE_ENV === "test" && !opts.fetch) throw new OpenFinanceError("Nos testes o Pluggy só é chamado com um fetch falso");
  let r: Response;
  try {
    r = await (opts.fetch ?? fetch)(`${URL_PLUGGY}${caminho}`, {
      method: metodo,
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(chave ? { "X-API-KEY": chave } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    throw new OpenFinanceError(`Sem acesso ao Pluggy: ${e instanceof Error ? e.message : String(e)}`);
  }
  const texto = await r.text();
  let json: unknown = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* resposta sem JSON */ }
  if (!r.ok) {
    const m = (json as { message?: string } | null)?.message ?? texto.slice(0, 200);
    if (r.status === 401 || r.status === 403) throw new OpenFinanceError(`O Pluggy recusou as credenciais (${r.status}): confira o Client ID e o Client Secret`);
    throw new OpenFinanceError(`Pluggy respondeu ${r.status}: ${m}`);
  }
  return json;
}

async function chamar<T>(metodo: "GET" | "POST" | "PATCH" | "DELETE", caminho: string, corpo: unknown, opts: OpcoesOF = {}): Promise<T> {
  const c = await configOpenFinance();
  return (await bruto(metodo, caminho, await chaveApi(c, opts), corpo, opts)) as T;
}

/** Testa as credenciais e conta quantos bancos o Pluggy oferece. */
export async function testarOpenFinance(opts: OpcoesOF = {}) {
  const r = await chamar<{ total?: number; results?: unknown[] }>("GET", "/connectors?countries=BR&isOpenFinance=true", null, opts);
  return `Conectado ao Pluggy: ${r.total ?? r.results?.length ?? 0} bancos disponíveis pelo Open Finance`;
}

/** Token de uso único para abrir o Pluggy Connect na tela (com itemId: renovar o consentimento de um banco). */
export async function tokenConexao(itemId?: string, opts: OpcoesOF = {}) {
  const r = await chamar<{ accessToken?: string }>("POST", "/connect_token", itemId ? { itemId } : {}, opts);
  if (!r.accessToken) throw new OpenFinanceError("O Pluggy não devolveu o token de conexão");
  return r.accessToken;
}

type ItemPluggy = { id: string; status: string; executionStatus?: string; connector?: { name?: string; imageUrl?: string }; consentExpiresAt?: string | null; error?: { message?: string } | null };
type ContaPluggy = { id: string; type: string; subtype?: string; name?: string; number?: string; balance?: number; marketingName?: string };
type TransacaoPluggy = { id: string; date: string; description?: string; descriptionRaw?: string | null; amount: number; type?: "DEBIT" | "CREDIT"; paymentData?: { referenceNumber?: string | null } | null };

const SITUACOES: Record<string, string> = {
  UPDATED: "Atualizado", UPDATING: "Atualizando", LOGIN_ERROR: "Autorização recusada", OUTDATED: "Desatualizado",
  WAITING_USER_INPUT: "Esperando o banco", WAITING_USER_ACTION: "Esperando o banco", MERGING: "Atualizando", CREATED: "Conectando",
};
export const nomeSituacao = (s: string) => SITUACOES[s] ?? s;
export const situacaoOk = (s: string) => s === "UPDATED" || s === "UPDATING" || s === "MERGING" || s === "CREATED";

/** Grava (ou atualiza) o banco conectado e suas contas, depois do "sucesso" do Pluggy Connect. */
export async function registrarConexao(itemId: string, opts: OpcoesOF = {}) {
  if (!/^[\w-]{8,64}$/.test(itemId)) throw new OpenFinanceError("Conexão inválida");
  const item = await chamar<ItemPluggy>("GET", `/items/${itemId}`, null, opts);
  const dados = {
    banco: item.connector?.name ?? "Banco", logo: item.connector?.imageUrl ?? null, situacao: item.status,
    consentimentoAte: item.consentExpiresAt ? new Date(item.consentExpiresAt) : null,
  };
  const conexao = await prisma.conexaoOpenFinance.upsert({ where: { itemId }, create: { itemId, ...dados }, update: dados });
  const contas = await chamar<{ results?: ContaPluggy[] }>("GET", `/accounts?itemId=${itemId}`, null, opts);
  const c = await configOpenFinance();
  const desde = somarDias(opts.hoje ?? diaSP(), -c.diasRetroativos);
  for (const a of contas.results ?? []) {
    const d = { nome: a.marketingName || a.name || (a.type === "CREDIT" ? "Cartão de crédito" : "Conta"), numero: a.number ?? null, tipo: a.type, saldo: a.balance == null ? null : new Prisma.Decimal(a.balance.toFixed(2)) };
    await prisma.contaOpenFinance.upsert({ where: { accountId: a.id }, create: { conexaoId: conexao.id, accountId: a.id, importarDesde: desde, ...d }, update: d });
  }
  return prisma.conexaoOpenFinance.findUniqueOrThrow({ where: { id: conexao.id }, include: { contas: true } });
}

/** Liga a conta do banco a uma conta bancária do ERP (ou desliga, com contaBancariaId vazio). */
export async function vincularConta(id: string, contaBancariaId: string | null, importarDesde?: Date) {
  if (contaBancariaId) {
    const outra = await prisma.contaOpenFinance.findFirst({ where: { contaBancariaId, id: { not: id } } });
    if (outra) throw new OpenFinanceError(`Essa conta do ERP já recebe o extrato de "${outra.nome}"`);
  }
  return prisma.contaOpenFinance.update({ where: { id }, data: { contaBancariaId, ...(importarDesde ? { importarDesde } : {}) } });
}

/** Desconecta o banco: apaga o item no Pluggy (revoga o acesso) e a conexão aqui. O extrato já importado fica. */
export async function desconectar(id: string, opts: OpcoesOF = {}) {
  const c = await prisma.conexaoOpenFinance.findUniqueOrThrow({ where: { id } });
  try { await chamar("DELETE", `/items/${c.itemId}`, null, opts); }
  catch (e) { if (!/\b404\b/.test((e as Error).message)) throw e; }
  await prisma.conexaoOpenFinance.delete({ where: { id } });
}

/** Transações do Pluggy no formato do extrato (data civil, valor com sinal, chave estável pelo id). */
export function paraExtrato(ts: TransacaoPluggy[]): TransacaoExtrato[] {
  return ts.map((t) => {
    const v = Math.abs(Number(t.amount) || 0);
    const negativo = t.type ? t.type === "DEBIT" : Number(t.amount) < 0;
    // a data vem como instante (meia-noite de Brasília em UTC): vale o dia em São Paulo
    const data = /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? new Date(`${t.date}T00:00:00Z`) : diaSP(new Date(t.date));
    return { data, valor: Math.round((negativo ? -v : v) * 100) / 100, descricao: (t.description || t.descriptionRaw || "(sem descrição)").trim(), documento: t.paymentData?.referenceNumber ?? null, chave: `pluggy:${t.id}` };
  });
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Puxa o extrato das contas ligadas (desde o último lançamento importado menos 5 dias, para pegar lançamentos que o banco
 * publica atrasado) e manda para a conciliação. Cartão de crédito não entra: a fatura é uma conta a pagar.
 */
export async function sincronizarOpenFinance(opts: OpcoesOF & { conexaoId?: string } = {}) {
  const c = await configOpenFinance();
  if (!c.ativo) return { ignorado: "Open Finance desligado" } as const;
  const hoje = opts.hoje ?? diaSP();
  const conexoes = await prisma.conexaoOpenFinance.findMany({ where: opts.conexaoId ? { id: opts.conexaoId } : {}, include: { contas: { include: { contaBancaria: { select: { nome: true } } } } } });
  const out: Record<string, string> = {};
  for (const cx of conexoes) {
    try {
      const item = await chamar<ItemPluggy>("GET", `/items/${cx.itemId}`, null, opts);
      const consentimentoAte = item.consentExpiresAt ? new Date(item.consentExpiresAt) : cx.consentimentoAte;
      await prisma.conexaoOpenFinance.update({ where: { id: cx.id }, data: { situacao: item.status, consentimentoAte } });
      const partes: string[] = [];
      for (const ct of cx.contas.filter((x) => x.contaBancariaId && x.tipo === "BANK")) {
        // continua do último lançamento já importado desta conta (menos 5 dias); na primeira vez, desde "importar desde"
        const ultimo = await prisma.transacaoBancaria.findFirst({ where: { contaBancariaId: ct.contaBancariaId!, chave: { startsWith: "pluggy:" } }, orderBy: { data: "desc" }, select: { data: true } });
        const base = ultimo ? somarDias(ultimo.data, -5) : ct.importarDesde ?? somarDias(hoje, -c.diasRetroativos);
        const de = ct.importarDesde && ct.importarDesde > base ? ct.importarDesde : base;
        const todas: TransacaoPluggy[] = [];
        for (let pag = 1; pag <= 20; pag++) {
          const r = await chamar<{ results?: TransacaoPluggy[]; totalPages?: number }>("GET", `/transactions?accountId=${ct.accountId}&from=${iso(de)}&to=${iso(hoje)}&pageSize=500&page=${pag}`, null, opts);
          todas.push(...(r.results ?? []));
          if (!r.totalPages || pag >= r.totalPages) break;
        }
        const ts = paraExtrato(todas).filter((t) => !ct.importarDesde || t.data >= ct.importarDesde);
        const r = await importarExtrato(ct.contaBancariaId!, ts);
        partes.push(`${ct.contaBancaria?.nome ?? ct.nome}: ${r.novas} novas, ${r.baixadas} baixadas`);
      }
      const contas = await chamar<{ results?: ContaPluggy[] }>("GET", `/accounts?itemId=${cx.itemId}`, null, opts);
      for (const a of contas.results ?? []) if (a.balance != null) await prisma.contaOpenFinance.updateMany({ where: { accountId: a.id }, data: { saldo: new Prisma.Decimal(a.balance.toFixed(2)) } });
      const msg = !situacaoOk(item.status) ? `${nomeSituacao(item.status)}${item.error?.message ? `: ${item.error.message}` : ""}` : partes.join("; ") || "nenhuma conta ligada ao ERP";
      await prisma.conexaoOpenFinance.update({ where: { id: cx.id }, data: { ultimaSincEm: opts.hoje ?? new Date(), ultimaSincMsg: msg.slice(0, 500) } });
      out[cx.banco] = msg;
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      await prisma.conexaoOpenFinance.update({ where: { id: cx.id }, data: { ultimaSincMsg: `Erro: ${m}`.slice(0, 500) } });
      out[cx.banco] = `erro: ${m}`;
    }
  }
  return { bancos: out };
}

/** Pede ao Pluggy para buscar dados novos no banco agora (no Open Finance ele também atualiza sozinho). */
export async function atualizarNoBanco(id: string, opts: OpcoesOF = {}) {
  const c = await prisma.conexaoOpenFinance.findUniqueOrThrow({ where: { id } });
  const item = await chamar<ItemPluggy>("PATCH", `/items/${c.itemId}`, {}, opts);
  await prisma.conexaoOpenFinance.update({ where: { id }, data: { situacao: item.status } });
  return item.status;
}
