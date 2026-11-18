import https from "node:https";
import fs from "node:fs";
import { createHash, createPrivateKey, X509Certificate } from "node:crypto";
import JSZip from "jszip";
import { prisma } from "@/lib/db";
import { decifrar } from "@/lib/seguranca/segredos";
import { importarExtrato, type TransacaoExtrato } from "./extrato";

/**
 * Banco Inter (API PJ): puxa o extrato direto do banco e joga na conciliação.
 * Autenticação OAuth2 client_credentials com certificado da integração (mTLS).
 *
 * A configuração é feita pela tela Financeiro → Conciliação → Configurar Banco Inter (tabela IntegracaoInter,
 * com client secret e chave privada cifrados). Se não houver nada na tela, ainda vale o jeito antigo pelo .env:
 *   INTER_CLIENT_ID, INTER_CLIENT_SECRET, INTER_CERT_FILE, INTER_KEY_FILE, INTER_CONTA, INTER_AMBIENTE, INTER_CONTA_ERP
 */

export const URL_INTER = {
  producao: "https://cdpj.partners.bancointer.com.br",
  sandbox: "https://cdpj-sandbox.partners.uatinter.co",
} as const;

export const ESCOPO_EXTRATO = "extrato.read";

export type RespostaInter = { status: number; corpo: string };
export type TransporteInter = (metodo: "GET" | "POST", url: string, headers: Record<string, string>, corpo: string | null) => Promise<RespostaInter>;

export type ConfigInter = {
  clientId: string; clientSecret: string; cert: string; key: string; conta: string | null; base: string;
  escopos?: string; contaBancariaId?: string | null; contaErp: string; origem?: "tela" | "servidor";
};
type Config = ConfigInter;

/** Configuração pelo .env (jeito antigo). */
export function configInterServidor(): ConfigInter | null {
  const e = process.env;
  if (!e.INTER_CLIENT_ID || !e.INTER_CLIENT_SECRET || !e.INTER_CERT_FILE || !e.INTER_KEY_FILE) return null;
  if (!fs.existsSync(e.INTER_CERT_FILE) || !fs.existsSync(e.INTER_KEY_FILE)) return null;
  return {
    clientId: e.INTER_CLIENT_ID, clientSecret: e.INTER_CLIENT_SECRET,
    cert: fs.readFileSync(e.INTER_CERT_FILE, "utf8"), key: fs.readFileSync(e.INTER_KEY_FILE, "utf8"),
    conta: e.INTER_CONTA || null, base: e.INTER_AMBIENTE === "sandbox" ? URL_INTER.sandbox : URL_INTER.producao,
    escopos: ESCOPO_EXTRATO, contaErp: e.INTER_CONTA_ERP || "INTER MXTECH", origem: "servidor",
  };
}

/** Configuração em uso: a da tela; se não houver, a do .env. */
export async function lerConfigInter(): Promise<ConfigInter | null> {
  const r = await prisma.integracaoInter.findUnique({ where: { id: "inter" }, include: { contaBancaria: true } });
  if (!r) return configInterServidor();
  return {
    clientId: r.clientId, clientSecret: decifrar(r.clientSecretCifrado), cert: r.certificado, key: decifrar(r.chaveCifrada),
    conta: r.contaCorrente || null, base: r.ambiente === "sandbox" ? URL_INTER.sandbox : URL_INTER.producao,
    escopos: r.escopos || ESCOPO_EXTRATO, contaBancariaId: r.contaBancariaId, contaErp: r.contaBancaria?.nome ?? "INTER MXTECH", origem: "tela",
  };
}

/** Só diz se existe alguma configuração (não abre os segredos). */
export async function interConfigurado() {
  return !!(await prisma.integracaoInter.count({ where: { id: "inter" } })) || !!configInterServidor();
}

export function transporteMtls(cfg: Config): TransporteInter {
  const { cert, key } = cfg;
  return (metodo, url, headers, corpo) =>
    new Promise((resolve, reject) => {
      const req = https.request(url, { method: metodo, cert, key, timeout: 30000, headers: { ...headers, ...(corpo ? { "Content-Length": String(Buffer.byteLength(corpo)) } : {}) } }, (res) => {
        const partes: Buffer[] = [];
        res.on("data", (c) => partes.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, corpo: Buffer.concat(partes).toString("utf8") }));
      });
      req.on("timeout", () => req.destroy(new Error("Tempo esgotado na comunicação com o Banco Inter")));
      req.on("error", reject);
      req.end(corpo ?? undefined);
    });
}

/** Lê os arquivos baixados do Inter Empresas (.crt, .key, .pem ou o .zip com os dois) e confere se o par bate. */
export async function lerArquivosInter(arquivos: { nome: string; bytes: Buffer }[]) {
  const textos: { nome: string; texto: string }[] = [];
  for (const a of arquivos) {
    if (a.nome.toLowerCase().endsWith(".zip") || a.bytes.subarray(0, 2).toString() === "PK") {
      const zip = await JSZip.loadAsync(a.bytes);
      for (const f of Object.values(zip.files)) if (!f.dir) textos.push({ nome: f.name, texto: await f.async("string") });
    } else textos.push({ nome: a.nome, texto: a.bytes.toString("utf8") });
  }
  let cert: string | null = null, key: string | null = null;
  for (const t of textos) {
    const c = t.texto.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);
    const k = t.texto.match(/-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/);
    if (c && !cert) cert = t.texto.slice(c.index!).trim() + "\n";
    if (k && !key) key = k[0].trim() + "\n";
  }
  if (cert) cert = cert.match(/-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/)![0] + "\n";
  if (key?.includes("ENCRYPTED")) throw new Error("A chave .key está protegida por senha; use a chave baixada do Inter Empresas, sem senha");
  let info: { titular: string; validoAte: Date } | null = null;
  if (cert) {
    let x: X509Certificate;
    try { x = new X509Certificate(cert); } catch { throw new Error("O arquivo .crt não é um certificado válido"); }
    info = { titular: (x.subject.match(/CN=([^\n]+)/)?.[1] ?? x.subject).trim(), validoAte: new Date(x.validTo) };
    if (key) {
      let pk;
      try { pk = createPrivateKey(key); } catch { throw new Error("O arquivo .key não é uma chave privada válida"); }
      if (!x.checkPrivateKey(pk)) throw new Error("A chave .key não é do mesmo par do certificado .crt (baixe os dois da mesma integração)");
    }
  } else if (key) {
    try { createPrivateKey(key); } catch { throw new Error("O arquivo .key não é uma chave privada válida"); }
  }
  return { cert, key, info };
}

/** Titular e validade de um certificado PEM, para mostrar na tela. */
export function infoCertificado(pem: string) {
  try {
    const x = new X509Certificate(pem);
    return { titular: (x.subject.match(/CN=([^\n]+)/)?.[1] ?? x.subject).trim(), validoAte: new Date(x.validTo) };
  } catch { return null; }
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export class ClienteInter {
  private token: { valor: string; expira: number } | null = null;
  constructor(private cfg: Config, private transporte: TransporteInter = transporteMtls(cfg)) {}

  private async obterToken() {
    if (this.token && this.token.expira > Date.now() + 60000) return this.token.valor;
    const corpo = new URLSearchParams({ client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, grant_type: "client_credentials", scope: this.cfg.escopos || ESCOPO_EXTRATO }).toString();
    const r = await this.transporte("POST", `${this.cfg.base}/oauth/v2/token`, { "Content-Type": "application/x-www-form-urlencoded" }, corpo);
    if (r.status !== 200) throw new Error(`Inter recusou a autenticação (HTTP ${r.status}): ${explicar(r)}`);
    const j = JSON.parse(r.corpo) as { access_token: string; expires_in?: number };
    this.token = { valor: j.access_token, expira: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return j.access_token;
  }

  private async get(caminho: string, params: Record<string, string | number>) {
    const headers: Record<string, string> = { Authorization: `Bearer ${await this.obterToken()}`, Accept: "application/json" };
    if (this.cfg.conta) headers["x-conta-corrente"] = this.cfg.conta;
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
    return this.transporte("GET", `${this.cfg.base}${caminho}?${qs}`, headers, null);
  }

  /** Saldo da conta: usado no teste de conexão (pede o escopo extrato.read). */
  async saldo(): Promise<number> {
    const r = await this.get("/banking/v2/saldo", { dataSaldo: iso(new Date()) });
    if (r.status !== 200) throw new Error(`Inter: autenticou, mas não liberou o saldo/extrato (HTTP ${r.status}): ${explicar(r)}`);
    const j = JSON.parse(r.corpo) as { disponivel?: number | string };
    return Number(j.disponivel ?? 0);
  }

  /** Extrato do período. Usa o extrato completo (traz o id de cada transação); cai no simples se não estiver liberado. */
  async extrato(inicio: Date, fim: Date): Promise<TransacaoExtrato[]> {
    const out: TransacaoExtrato[] = [];
    for (let pagina = 0; ; pagina++) {
      const r = await this.get("/banking/v2/extrato/completo", { dataInicio: iso(inicio), dataFim: iso(fim), pagina, tamanhoPagina: 1000 });
      if (r.status === 404 || r.status === 403) return this.extratoSimples(inicio, fim);
      if (r.status !== 200) throw new Error(`Inter: erro ao buscar o extrato (HTTP ${r.status}): ${r.corpo.slice(0, 300)}`);
      const j = JSON.parse(r.corpo) as { transacoes?: TransacaoInter[]; totalPaginas?: number; ultimaPagina?: boolean };
      out.push(...(j.transacoes ?? []).map(converter));
      if (j.ultimaPagina !== false && (j.totalPaginas ?? 1) <= pagina + 1) break;
    }
    return out.filter((t) => t.valor !== 0);
  }

  private async extratoSimples(inicio: Date, fim: Date) {
    const r = await this.get("/banking/v2/extrato", { dataInicio: iso(inicio), dataFim: iso(fim) });
    if (r.status !== 200) throw new Error(`Inter: erro ao buscar o extrato (HTTP ${r.status}): ${r.corpo.slice(0, 300)}`);
    const j = JSON.parse(r.corpo) as { transacoes?: TransacaoInter[] };
    // o extrato simples não tem id: numera transações iguais no mesmo dia pela ordem
    const vistos = new Map<string, number>();
    return (j.transacoes ?? []).map(converter).filter((t) => t.valor !== 0).map((t) => {
      const n = (vistos.get(t.chave) ?? 0) + 1;
      vistos.set(t.chave, n);
      return { ...t, chave: `${t.chave}:${n}` };
    });
  }
}

type TransacaoInter = {
  idTransacao?: string; dataTransacao?: string; dataEntrada?: string; dataInclusao?: string;
  tipoOperacao?: "C" | "D"; tipoTransacao?: string; valor?: string | number; titulo?: string; descricao?: string;
  detalhes?: Record<string, unknown>;
};

function converter(t: TransacaoInter): TransacaoExtrato {
  const dataTxt = (t.dataTransacao ?? t.dataEntrada ?? t.dataInclusao ?? "").slice(0, 10);
  const valor = Math.abs(Number(String(t.valor ?? 0).replace(",", "."))) * (t.tipoOperacao === "D" ? -1 : 1);
  const d = t.detalhes ?? {};
  const nome = [d.nomePagador, d.nomeRecebedor, d.nomeEmpresa, d.nomeBeneficiario].find((x) => typeof x === "string" && x) as string | undefined;
  const descricao = [t.titulo, t.descricao, nome].filter(Boolean).join(" - ") || t.tipoTransacao || "(sem descrição)";
  const base = `${dataTxt}|${valor.toFixed(2)}|${t.tipoTransacao ?? ""}|${t.titulo ?? ""}|${t.descricao ?? ""}`;
  return {
    data: new Date(`${dataTxt}T00:00:00Z`),
    valor: Math.round(valor * 100) / 100,
    descricao,
    documento: (d.nossoNumero as string) || (d.txid as string) || (d.endToEndId as string) || null,
    chave: t.idTransacao ? `inter:${t.idTransacao}` : `inter-h:${createHash("sha1").update(base).digest("hex").slice(0, 24)}`,
  };
}

function explicar(r: RespostaInter) {
  const dica =
    r.status === 401 ? " (confira o Client ID, o Client Secret e se o certificado é desta integração)" :
    r.status === 403 ? " (a integração precisa da permissão \"Consultar extrato e saldo\" no Inter Empresas; confira também a conta corrente)" :
    r.status === 400 ? " (confira os escopos: a integração precisa ter todos os escopos pedidos)" : "";
  return `${r.corpo.slice(0, 300)}${dica}`;
}

/** Testa a configuração: pega o token e lê o saldo. Grava o resultado se a configuração for a da tela. */
export async function testarInter(opts: { cliente?: ClienteInter } = {}) {
  let ok = false, mensagem: string;
  try {
    const cfg = await lerConfigInter();
    if (!cfg && !opts.cliente) throw new Error("Integração com o Banco Inter ainda não configurada");
    const saldo = await (opts.cliente ?? new ClienteInter(cfg!)).saldo();
    ok = true;
    mensagem = `Conexão OK. Saldo disponível: ${saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`;
  } catch (e) {
    mensagem = mensagemErro(e);
  }
  await prisma.integracaoInter.updateMany({ where: { id: "inter" }, data: { ultimoTesteEm: new Date(), ultimoTesteOk: ok, ultimoTesteMsg: mensagem.slice(0, 500) } });
  return { ok, mensagem };
}

function mensagemErro(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string })?.code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "Sem acesso ao servidor do Banco Inter (verifique a internet do computador do ERP)";
  if (code === "ECONNRESET" || /alert|handshake|certificate/i.test(m)) return `O Inter recusou o certificado (.crt/.key) na conexão: ${m}`;
  return m;
}

/** Puxa os últimos `dias` do extrato do Inter, grava e baixa o que casar. */
export async function sincronizarInter(opts: { dias?: number; cliente?: ClienteInter } = {}) {
  const cfg = await lerConfigInter();
  if (!cfg && !opts.cliente) throw new Error("Integração com o Banco Inter ainda não configurada (Financeiro → Conciliação → Configurar Banco Inter)");
  const cliente = opts.cliente ?? new ClienteInter(cfg!);
  const nomeConta = cfg?.contaErp ?? "INTER MXTECH";
  const conta = cfg?.contaBancariaId
    ? await prisma.contaBancaria.findUniqueOrThrow({ where: { id: cfg.contaBancariaId } })
    : await prisma.contaBancaria.upsert({ where: { nome: nomeConta }, create: { nome: nomeConta, banco: "077" }, update: {} });
  const fim = new Date();
  const inicio = new Date(fim.getTime() - (opts.dias ?? 7) * 86400000);
  try {
    const ts = await cliente.extrato(inicio, fim);
    const r = { conta: conta.nome, ...(await importarExtrato(conta.id, ts)) };
    await prisma.integracaoInter.updateMany({ where: { id: "inter" }, data: { ultimaSincEm: new Date(), ultimaSincMsg: `${r.novas} novas, ${r.baixadas} baixadas` } });
    return r;
  } catch (e) {
    const m = mensagemErro(e);
    await prisma.integracaoInter.updateMany({ where: { id: "inter" }, data: { ultimaSincEm: new Date(), ultimaSincMsg: `Erro: ${m}`.slice(0, 500) } });
    throw new Error(m);
  }
}
