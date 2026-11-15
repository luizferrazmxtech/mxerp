import https from "node:https";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { importarExtrato, type TransacaoExtrato } from "./extrato";

/**
 * Banco Inter (API PJ): puxa o extrato direto do banco e joga na conciliação.
 * Autenticação OAuth2 client_credentials com certificado da integração (mTLS).
 *
 * Variáveis no servidor (nada disso vai para o banco de dados):
 *   INTER_CLIENT_ID, INTER_CLIENT_SECRET   — da integração criada no Inter Empresas
 *   INTER_CERT_FILE, INTER_KEY_FILE        — caminhos do .crt e do .key baixados da integração
 *   INTER_CONTA                            — número da conta corrente (se a integração tiver mais de uma)
 *   INTER_AMBIENTE=sandbox                 — opcional, para testes
 *   INTER_CONTA_ERP                        — nome da conta bancária no ERP (padrão "INTER MXTECH")
 */

export const URL_INTER = {
  producao: "https://cdpj.partners.bancointer.com.br",
  sandbox: "https://cdpj-sandbox.partners.uatinter.co",
} as const;

export type RespostaInter = { status: number; corpo: string };
export type TransporteInter = (metodo: "GET" | "POST", url: string, headers: Record<string, string>, corpo: string | null) => Promise<RespostaInter>;

export function configInter(): ConfigInter | null {
  const e = process.env;
  if (!e.INTER_CLIENT_ID || !e.INTER_CLIENT_SECRET || !e.INTER_CERT_FILE || !e.INTER_KEY_FILE) return null;
  return {
    clientId: e.INTER_CLIENT_ID, clientSecret: e.INTER_CLIENT_SECRET, certFile: e.INTER_CERT_FILE, keyFile: e.INTER_KEY_FILE,
    conta: e.INTER_CONTA || null, base: e.INTER_AMBIENTE === "sandbox" ? URL_INTER.sandbox : URL_INTER.producao,
    contaErp: e.INTER_CONTA_ERP || "INTER MXTECH",
  };
}
export type ConfigInter = { clientId: string; clientSecret: string; certFile: string; keyFile: string; conta: string | null; base: string; contaErp: string };
type Config = ConfigInter;

export function transporteMtls(cfg: Config): TransporteInter {
  const cert = fs.readFileSync(cfg.certFile);
  const key = fs.readFileSync(cfg.keyFile);
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

const iso = (d: Date) => d.toISOString().slice(0, 10);

export class ClienteInter {
  private token: { valor: string; expira: number } | null = null;
  constructor(private cfg: Config, private transporte: TransporteInter = transporteMtls(cfg)) {}

  private async obterToken() {
    if (this.token && this.token.expira > Date.now() + 60000) return this.token.valor;
    const corpo = new URLSearchParams({ client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, grant_type: "client_credentials", scope: "extrato.read" }).toString();
    const r = await this.transporte("POST", `${this.cfg.base}/oauth/v2/token`, { "Content-Type": "application/x-www-form-urlencoded" }, corpo);
    if (r.status !== 200) throw new Error(`Inter recusou a autenticação (HTTP ${r.status}): ${r.corpo.slice(0, 300)}`);
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

/** Puxa os últimos `dias` do extrato do Inter, grava e baixa o que casar. */
export async function sincronizarInter(opts: { dias?: number; cliente?: ClienteInter } = {}) {
  const cfg = configInter();
  if (!cfg && !opts.cliente) throw new Error("Integração com o Banco Inter não configurada no servidor");
  const cliente = opts.cliente ?? new ClienteInter(cfg!);
  const nomeConta = cfg?.contaErp ?? "INTER MXTECH";
  const conta = await prisma.contaBancaria.upsert({ where: { nome: nomeConta }, create: { nome: nomeConta, banco: "077" }, update: {} });
  const fim = new Date();
  const inicio = new Date(fim.getTime() - (opts.dias ?? 7) * 86400000);
  const ts = await cliente.extrato(inicio, fim);
  return { conta: conta.nome, ...(await importarExtrato(conta.id, ts)) };
}
