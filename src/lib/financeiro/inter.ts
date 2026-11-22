import https from "node:https";
import fs from "node:fs";
import { createHash, createPrivateKey, X509Certificate } from "node:crypto";
import JSZip from "jszip";
import { prisma } from "@/lib/db";
import { decifrar } from "@/lib/seguranca/segredos";
import { importarExtrato, type TransacaoExtrato } from "./extrato";
import { diaSP } from "@/lib/datas";
import { lojaAtualId } from "@/lib/empresa/loja";

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
/** Emitir, consultar, baixar o PDF e cancelar boletos/BolePix (API de Cobrança v3). */
export const ESCOPOS_COBRANCA = "boleto-cobranca.read boleto-cobranca.write";
export const ESCOPOS_PADRAO = `${ESCOPO_EXTRATO} ${ESCOPOS_COBRANCA}`;
export const temCobranca = (escopos?: string | null) => (escopos ?? "").split(/\s+/).includes("boleto-cobranca.write");

export type RespostaInter = { status: number; corpo: string };
export type MetodoHttp = "GET" | "POST" | "PUT" | "DELETE";
export type TransporteInter = (metodo: MetodoHttp, url: string, headers: Record<string, string>, corpo: string | null) => Promise<RespostaInter>;

export type ConfigInter = {
  clientId: string; clientSecret: string; cert: string; key: string; conta: string | null; base: string;
  escopos?: string; contaBancariaId?: string | null; contaErp: string; origem?: "tela" | "servidor";
  /** registro da IntegracaoInter (uma por empresa) */
  id?: string;
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
    escopos: e.INTER_ESCOPOS || ESCOPO_EXTRATO, contaErp: e.INTER_CONTA_ERP || "INTER MXTECH", origem: "servidor",
  };
}

/** Id da integração de uma empresa nova (a primeira é "inter"). */
export const idInterNovo = (empresaId: string) => `inter-${empresaId}`;

/**
 * Integração do Inter que atende a empresa: a dela; se ela não tem, a que ainda não tem dona (instalação com uma
 * empresa só). Sem empresa (agendador, registros antigos sem loja): a primeira. null = essa empresa não tem Inter,
 * e então não emite boleto nem puxa extrato (nunca usa a conta de outro CNPJ).
 */
export async function idInterDaEmpresa(empresaId: string | null | undefined): Promise<string | null> {
  const linhas = await prisma.integracaoInter.findMany({ select: { id: true, empresaId: true }, orderBy: { id: "asc" } });
  if (!linhas.length) return configInterServidor() ? "inter" : null;
  if (empresaId) return (linhas.find((l) => l.empresaId === empresaId) ?? linhas.find((l) => !l.empresaId))?.id ?? null;
  return (linhas.find((l) => l.id === "inter") ?? linhas[0]).id;
}

/** Integração da loja escolhida no topo do menu. */
export const idInterAtual = async () => idInterDaEmpresa(await lojaAtualId());

/**
 * Integração que a tela de configuração edita na loja atual (cria a da empresa se ela ainda não tem).
 * A sem dona, de antes de ter uma por empresa, fica com a primeira empresa cadastrada.
 */
export async function idInterParaSalvar(): Promise<{ id: string; empresaId: string | null }> {
  const loja = await lojaAtualId();
  const linhas = await prisma.integracaoInter.findMany({ select: { id: true, empresaId: true } });
  if (!loja) return { id: (linhas.find((l) => l.id === "inter") ?? linhas[0])?.id ?? "inter", empresaId: null };
  const dela = linhas.find((l) => l.empresaId === loja);
  if (dela) return { id: dela.id, empresaId: loja };
  const semDona = linhas.find((l) => !l.empresaId);
  const primeira = (await prisma.empresa.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))?.id ?? null;
  if (semDona && (primeira === loja || !primeira)) return { id: semDona.id, empresaId: loja };
  if (semDona && primeira && !linhas.some((l) => l.empresaId === primeira)) await prisma.integracaoInter.update({ where: { id: semDona.id }, data: { empresaId: primeira } });
  return { id: linhas.length ? idInterNovo(loja) : "inter", empresaId: loja };
}

/** Todas as integrações configuradas (para o agendador). */
export async function idsInter(): Promise<string[]> {
  const ids = (await prisma.integracaoInter.findMany({ select: { id: true }, orderBy: { id: "asc" } })).map((l) => l.id);
  return ids.length ? ids : configInterServidor() ? ["inter"] : [];
}

/**
 * Configuração em uso: a da tela (da integração pedida, ou da loja atual); se não houver nenhuma na tela, a do .env.
 * `interId` null = a empresa não tem Inter.
 */
export async function lerConfigInter(interId?: string | null): Promise<ConfigInter | null> {
  const id = interId === undefined ? await idInterAtual() : interId;
  if (!id) return null;
  const r = await prisma.integracaoInter.findUnique({ where: { id }, include: { contaBancaria: true } });
  if (!r) return (await prisma.integracaoInter.count()) ? null : configInterServidor();
  return {
    clientId: r.clientId, clientSecret: decifrar(r.clientSecretCifrado), cert: r.certificado, key: decifrar(r.chaveCifrada),
    conta: r.contaCorrente || null, base: r.ambiente === "sandbox" ? URL_INTER.sandbox : URL_INTER.producao,
    escopos: r.escopos || ESCOPO_EXTRATO, contaBancariaId: r.contaBancariaId, contaErp: r.contaBancaria?.nome ?? "INTER MXTECH", origem: "tela", id: r.id,
  };
}

/** Só diz se existe configuração para a loja atual (ou a pedida), sem abrir os segredos. */
export async function interConfigurado(interId?: string | null) {
  const id = interId === undefined ? await idInterAtual() : interId;
  if (!id) return false;
  return !!(await prisma.integracaoInter.count({ where: { id } })) || (!(await prisma.integracaoInter.count()) && !!configInterServidor());
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
  /** Um token por conjunto de escopos: se a integração não tiver a permissão de boletos, o extrato continua funcionando. */
  private tokens = new Map<string, { valor: string; expira: number }>();
  constructor(private cfg: Config, private transporte: TransporteInter = transporteMtls(cfg)) {}

  get configuracao() { return this.cfg; }

  private async obterToken(escopo = ESCOPO_EXTRATO) {
    const t = this.tokens.get(escopo);
    if (t && t.expira > Date.now() + 60000) return t.valor;
    const corpo = new URLSearchParams({ client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, grant_type: "client_credentials", scope: escopo }).toString();
    const r = await this.transporte("POST", `${this.cfg.base}/oauth/v2/token`, { "Content-Type": "application/x-www-form-urlencoded" }, corpo);
    if (r.status !== 200) throw new Error(`Inter recusou a autenticação (HTTP ${r.status}): ${explicar(r, escopo)}`);
    const j = JSON.parse(r.corpo) as { access_token: string; expires_in?: number };
    this.tokens.set(escopo, { valor: j.access_token, expira: Date.now() + (j.expires_in ?? 3600) * 1000 });
    return j.access_token;
  }

  /** Chamada autenticada à API (o corpo vai em JSON). */
  async chamar(metodo: MetodoHttp, caminho: string, opts: { escopo?: string; params?: Record<string, string | number>; json?: unknown } = {}) {
    const headers: Record<string, string> = { Authorization: `Bearer ${await this.obterToken(opts.escopo)}`, Accept: "application/json" };
    if (this.cfg.conta) headers["x-conta-corrente"] = this.cfg.conta;
    if (opts.json !== undefined) headers["Content-Type"] = "application/json";
    const qs = opts.params ? "?" + new URLSearchParams(Object.entries(opts.params).map(([k, v]) => [k, String(v)])).toString() : "";
    return this.transporte(metodo, `${this.cfg.base}${caminho}${qs}`, headers, opts.json !== undefined ? JSON.stringify(opts.json) : null);
  }

  private get(caminho: string, params: Record<string, string | number>) {
    return this.chamar("GET", caminho, { params });
  }

  /** Saldo da conta: usado no teste de conexão (pede o escopo extrato.read). */
  async saldo(): Promise<number> {
    const r = await this.get("/banking/v2/saldo", { dataSaldo: iso(diaSP()) });
    if (r.status !== 200) throw new Error(`Inter: autenticou, mas não liberou o saldo/extrato (HTTP ${r.status}): ${explicar(r)}`);
    const j = JSON.parse(r.corpo) as { disponivel?: number | string };
    return Number(j.disponivel ?? 0);
  }

  /** Saldo da conta com o que está bloqueado (é o que bate com a soma do extrato): conferência de saldo. */
  async saldoContabil(): Promise<number> {
    const r = await this.get("/banking/v2/saldo", { dataSaldo: iso(diaSP()) });
    if (r.status !== 200) throw new Error(`Inter: saldo não liberado (HTTP ${r.status})`);
    const j = JSON.parse(r.corpo) as Record<string, number | string | undefined>;
    return ["disponivel", "bloqueadoCheque", "bloqueadoJudicialmente", "bloqueadoAdministrativo"].reduce((s, k) => s + (Number(j[k] ?? 0) || 0), 0);
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

/** Data e hora do lançamento quando o Inter manda a hora (dataInclusao "2026-11-05 10:23:11" ou ISO); sem fuso = Brasília. */
export function dataHoraInter(t: TransacaoInter): Date | null {
  for (const v of [t.dataInclusao, t.dataTransacao, t.dataEntrada]) {
    const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(\.\d+)?(Z|[+-]\d{2}:?\d{2})?/.exec(v ?? "");
    if (!m) continue;
    const fuso = m[4] ? (m[4] === "Z" ? "Z" : m[4].replace(/^([+-]\d{2})(\d{2})$/, "$1:$2")) : "-03:00";
    const d = new Date(`${m[1]}T${m[2].length === 5 ? `${m[2]}:00` : m[2]}${fuso}`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * CPF/CNPJ de quem recebeu (saída) ou pagou (entrada), dos detalhes da transação do Inter (cpfCnpjRecebedor,
 * cpfCnpjPagador, cnpjCpfBeneficiario…). Prefere o campo do lado certo; senão o primeiro documento válido.
 */
export function documentoContraparte(d: Record<string, unknown>, saida: boolean): string | null {
  const docs = Object.entries(d)
    .filter(([k, v]) => /cpf|cnpj|documento/i.test(k) && (typeof v === "string" || typeof v === "number"))
    .map(([k, v]) => ({ k: k.toLowerCase(), v: String(v).replace(/\D/g, "") }))
    .filter((x) => x.v.length === 11 || x.v.length === 14);
  const lado = saida ? /recebedor|beneficiario|favorecido|destin|empresa|cedente/ : /pagador|remetente|origem|sacado/;
  return (docs.find((x) => lado.test(x.k)) ?? docs[0])?.v ?? null;
}

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
    dataHora: dataHoraInter(t),
    contraparteDocumento: documentoContraparte(d, valor < 0),
    chave: t.idTransacao ? `inter:${t.idTransacao}` : `inter-h:${createHash("sha1").update(base).digest("hex").slice(0, 24)}`,
  };
}

export function explicar(r: RespostaInter, escopo = ESCOPO_EXTRATO) {
  const boleto = escopo.includes("boleto-cobranca");
  const dica =
    r.status === 401 ? " (confira o Client ID, o Client Secret e se o certificado é desta integração)" :
    r.status === 403 ? (boleto
      ? " (a integração precisa da permissão \"Emitir e cancelar boletos/cobranças\" e \"Consultar boletos/cobranças\" no Inter Empresas)"
      : " (a integração precisa da permissão \"Consultar extrato e saldo\" no Inter Empresas; confira também a conta corrente)") :
    r.status === 400 ? (boleto
      ? " (a integração no Inter Empresas não tem a permissão de boletos/cobrança: edite a integração e marque \"Emitir e cancelar boletos\" e \"Consultar boletos\")"
      : " (confira os escopos: a integração precisa ter todos os escopos pedidos)") : "";
  return `${r.corpo.slice(0, 300)}${dica}`;
}

/** Testa a configuração: pega o token e lê o saldo. Grava o resultado se a configuração for a da tela. */
export async function testarInter(opts: { cliente?: ClienteInter; interId?: string | null } = {}) {
  let ok = false, mensagem: string;
  const id = opts.interId === undefined ? (opts.cliente?.configuracao.id ?? (await idInterAtual())) : opts.interId;
  try {
    const cfg = await lerConfigInter(id);
    if (!cfg && !opts.cliente) throw new Error("Integração com o Banco Inter ainda não configurada");
    const cliente = opts.cliente ?? new ClienteInter(cfg!);
    const saldo = await cliente.saldo();
    ok = true;
    mensagem = `Conexão OK. Saldo disponível: ${saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`;
    if (temCobranca(cliente.configuracao.escopos)) {
      // a permissão de boletos é testada à parte: sem ela o extrato continua funcionando
      const hoje = iso(diaSP()); // dia de Brasília (depois das 21h o UTC já é amanhã e o Inter recusa data futura)
      const r = await cliente.chamar("GET", "/cobranca/v3/cobrancas", { escopo: ESCOPOS_COBRANCA, params: { dataInicial: hoje, dataFinal: hoje, "paginacao.itensPorPagina": 1 } }).catch((e) => ({ status: 0, corpo: mensagemErro(e) }));
      if (r.status === 200) mensagem += " Boletos: OK.";
      else { ok = false; mensagem += ` Boletos: sem acesso (HTTP ${r.status}): ${explicar(r, ESCOPOS_COBRANCA)}`; }
    }
  } catch (e) {
    mensagem = mensagemErro(e);
  }
  await prisma.integracaoInter.updateMany({ where: { id: id ?? "inter" }, data: { ultimoTesteEm: new Date(), ultimoTesteOk: ok, ultimoTesteMsg: mensagem.slice(0, 500) } });
  return { ok, mensagem };
}

export function mensagemErro(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string })?.code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "Sem acesso ao servidor do Banco Inter (verifique a internet do computador do ERP)";
  if (code === "ECONNRESET" || /alert|handshake|certificate/i.test(m)) return `O Inter recusou o certificado (.crt/.key) na conexão: ${m}`;
  return m;
}

/** Puxa os últimos `dias` do extrato do Inter, grava e baixa o que casar. */
export async function sincronizarInter(opts: { dias?: number; desde?: Date; cliente?: ClienteInter; interId?: string | null } = {}) {
  const id = opts.interId === undefined ? (opts.cliente?.configuracao.id ?? (await idInterAtual())) : opts.interId;
  const cfg = await lerConfigInter(id);
  if (!cfg && !opts.cliente) throw new Error("Integração com o Banco Inter desta empresa ainda não configurada (Financeiro → Conciliação → Configurar Banco Inter)");
  const cliente = opts.cliente ?? new ClienteInter(cfg!);
  const nomeConta = cfg?.contaErp ?? "INTER MXTECH";
  const conta = cfg?.contaBancariaId
    ? await prisma.contaBancaria.findUniqueOrThrow({ where: { id: cfg.contaBancariaId } })
    : await prisma.contaBancaria.upsert({ where: { nome: nomeConta }, create: { nome: nomeConta, banco: "077" }, update: {} });
  const fim = diaSP(); // hoje em Brasília: o Inter recusa dataFim no futuro
  const inicio = opts.desde ?? new Date(fim.getTime() - (opts.dias ?? 7) * 86400000);
  try {
    // período longo (extrato antigo): em blocos de 90 dias, o máximo que o Inter aceita por consulta
    const r = { conta: conta.nome, lidas: 0, novas: 0, repetidas: 0, baixadas: 0, boletos: 0, jaBaixadas: 0 };
    for (let de = inicio; de <= fim; de = new Date(de.getTime() + 90 * 86400000)) {
      const ate = new Date(Math.min(fim.getTime(), de.getTime() + 89 * 86400000));
      const p = await importarExtrato(conta.id, await cliente.extrato(de, ate));
      for (const k of ["lidas", "novas", "repetidas", "baixadas", "boletos", "jaBaixadas"] as const) r[k] += p[k];
    }
    // saldo do banco para a conferência de saldo (sem permissão de saldo, só não grava)
    if (typeof (cliente as { saldoContabil?: unknown }).saldoContabil === "function") {
      await cliente.saldoContabil().then((v) => import("./saldos").then((m) => m.registrarSaldo(conta.id, fim, v, "INTER"))).catch(() => null);
    }
    await prisma.integracaoInter.updateMany({ where: { id: id ?? "inter" }, data: { ultimaSincEm: new Date(), ultimaSincMsg: `${r.novas} novas, ${r.baixadas} baixadas${r.boletos ? `, ${r.boletos} boletos da cobrança` : ""}` } });
    return r;
  } catch (e) {
    const m = mensagemErro(e);
    await prisma.integracaoInter.updateMany({ where: { id: id ?? "inter" }, data: { ultimaSincEm: new Date(), ultimaSincMsg: `Erro: ${m}`.slice(0, 500) } });
    throw new Error(m);
  }
}
