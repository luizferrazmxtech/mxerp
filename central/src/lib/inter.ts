import https from "node:https";
import { createPrivateKey, randomBytes, X509Certificate } from "node:crypto";
import JSZip from "jszip";
import { prisma } from "./db";
import { ler, salvar, type InterSalvo } from "./config";
import { cifrar, decifrar } from "./segredos";
import { diaSP, iso, somarDias } from "./datas";

/**
 * Banco Inter da MXTECH: emite o BolePix de cada mensalidade (API Cobrança v3), consulta e baixa.
 * Mesmo jeito do MXERP (src/lib/financeiro/inter.ts e boletos.ts), só com o necessário para as faturas.
 */

export const URL_INTER = { producao: "https://cdpj.partners.bancointer.com.br", sandbox: "https://cdpj-sandbox.partners.uatinter.co" } as const;
const ESCOPOS = "boleto-cobranca.read boleto-cobranca.write";
const API = "/cobranca/v3/cobrancas";

export type RespostaInter = { status: number; corpo: string };
export type TransporteInter = (metodo: string, url: string, headers: Record<string, string>, corpo: string | null) => Promise<RespostaInter>;
export type ConfigInter = { clientId: string; clientSecret: string; cert: string; key: string; conta: string; base: string };

export class InterErro extends Error {}

export function transporteMtls(cfg: ConfigInter): TransporteInter {
  return (metodo, url, headers, corpo) =>
    new Promise((resolve, reject) => {
      const req = https.request(url, { method: metodo, cert: cfg.cert, key: cfg.key, timeout: 30000, headers: { ...headers, ...(corpo ? { "Content-Length": String(Buffer.byteLength(corpo)) } : {}) } }, (res) => {
        const partes: Buffer[] = [];
        res.on("data", (c) => partes.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, corpo: Buffer.concat(partes).toString("utf8") }));
      });
      req.on("timeout", () => req.destroy(new Error("Tempo esgotado na comunicação com o Banco Inter")));
      req.on("error", reject);
      req.end(corpo ?? undefined);
    });
}

export class ClienteInter {
  private token: { valor: string; expira: number } | null = null;
  constructor(private cfg: ConfigInter, private transporte: TransporteInter = transporteMtls(cfg)) {}

  private async obterToken() {
    if (this.token && this.token.expira > Date.now() + 60000) return this.token.valor;
    const corpo = new URLSearchParams({ client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, grant_type: "client_credentials", scope: ESCOPOS }).toString();
    const r = await this.transporte("POST", `${this.cfg.base}/oauth/v2/token`, { "Content-Type": "application/x-www-form-urlencoded" }, corpo);
    if (r.status !== 200) throw new InterErro(`Inter recusou a autenticação (HTTP ${r.status}): ${r.corpo.slice(0, 300)}. Confira o Client ID/Secret e se a integração tem permissão de boletos (leitura e escrita).`);
    const j = JSON.parse(r.corpo) as { access_token: string; expires_in?: number };
    this.token = { valor: j.access_token, expira: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return j.access_token;
  }

  async chamar(metodo: string, caminho: string, opts: { params?: Record<string, string | number>; json?: unknown } = {}) {
    const headers: Record<string, string> = { Authorization: `Bearer ${await this.obterToken()}`, Accept: "application/json" };
    if (this.cfg.conta) headers["x-conta-corrente"] = this.cfg.conta;
    if (opts.json !== undefined) headers["Content-Type"] = "application/json";
    const qs = opts.params ? "?" + new URLSearchParams(Object.entries(opts.params).map(([k, v]) => [k, String(v)])).toString() : "";
    return this.transporte(metodo, `${this.cfg.base}${caminho}${qs}`, headers, opts.json !== undefined ? JSON.stringify(opts.json) : null);
  }
}

function falha(o: string, r: RespostaInter): never {
  let detalhe = r.corpo.slice(0, 400);
  try {
    const j = JSON.parse(r.corpo) as { title?: string; detail?: string; violacoes?: { razao?: string; propriedade?: string }[] };
    detalhe = [j.title, j.detail, ...(j.violacoes ?? []).map((v) => `${v.propriedade ?? ""}: ${v.razao ?? ""}`)].filter(Boolean).join(" · ") || detalhe;
  } catch { /* não é JSON */ }
  throw new InterErro(`Inter: ${o} (HTTP ${r.status}): ${detalhe}`);
}

export function configDe(s: InterSalvo): ConfigInter {
  return {
    clientId: s.clientId, clientSecret: decifrar(s.clientSecretCifrado), cert: s.certificado, key: decifrar(s.chaveCifrada),
    conta: s.contaCorrente, base: s.ambiente === "sandbox" ? URL_INTER.sandbox : URL_INTER.producao,
  };
}

/** Cliente da API com a configuração salva; null se o Inter não foi configurado. Testes passam um cliente pronto. */
export async function clienteInter(): Promise<ClienteInter | null> {
  const s = await ler("inter");
  return s ? new ClienteInter(configDe(s)) : null;
}

// ---------- configuração pela tela

/** Lê o .zip (ou .crt/.key) baixado do Inter Empresas e confere se certificado e chave são do mesmo par. */
export async function lerArquivosInter(arquivos: { nome: string; bytes: Buffer }[]) {
  const textos: string[] = [];
  for (const a of arquivos) {
    if (a.nome.toLowerCase().endsWith(".zip") || a.bytes.subarray(0, 2).toString() === "PK") {
      const zip = await JSZip.loadAsync(a.bytes);
      for (const f of Object.values(zip.files)) if (!f.dir) textos.push(await f.async("string"));
    } else textos.push(a.bytes.toString("utf8"));
  }
  let cert: string | null = null, key: string | null = null;
  for (const t of textos) {
    cert ??= t.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)?.[0] ?? null;
    key ??= t.match(/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC )?PRIVATE KEY-----/)?.[0] ?? null;
  }
  if (!cert || !key) throw new InterErro("Envie o .zip baixado do Inter Empresas (ou o .crt e o .key juntos)");
  const x = new X509Certificate(cert);
  if (!x.checkPrivateKey(createPrivateKey(key))) throw new InterErro("A chave .key não é do mesmo par do certificado .crt");
  return { cert: cert + "\n", key: key + "\n", validoAte: new Date(x.validTo) };
}

export async function salvarInter(d: { clientId: string; clientSecret?: string; contaCorrente: string; ambiente: "producao" | "sandbox"; arquivos: { nome: string; bytes: Buffer }[] }) {
  const atual = await ler("inter");
  const arq = d.arquivos.length ? await lerArquivosInter(d.arquivos) : null;
  if (!arq && !atual) throw new InterErro("Envie o certificado e a chave da integração");
  if (!d.clientSecret && !atual) throw new InterErro("Informe o Client Secret");
  await salvar("inter", {
    ...(atual ?? {}),
    clientId: d.clientId.trim(), contaCorrente: d.contaCorrente.replace(/\D/g, ""), ambiente: d.ambiente,
    clientSecretCifrado: d.clientSecret ? cifrar(d.clientSecret.trim()) : atual!.clientSecretCifrado,
    certificado: arq?.cert ?? atual!.certificado, chaveCifrada: arq ? cifrar(arq.key) : atual!.chaveCifrada,
  });
}

/** Testa token + permissão de boletos. */
export async function testarInter(cliente?: ClienteInter | null) {
  cliente ??= await clienteInter();
  if (!cliente) throw new InterErro("Configure o Banco Inter primeiro");
  const hoje = diaSP();
  const r = await cliente.chamar("GET", API, { params: { dataInicial: iso(somarDias(hoje, -1)), dataFinal: iso(hoje), "paginacao.itensPorPagina": 1 } });
  if (r.status !== 200) falha("não liberou a consulta de boletos", r);
}

// ---------- boletos das faturas

const so = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export function pagador(c: { nome: string; documento: string; email: string; telefone: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null; cep: string | null }) {
  const doc = so(c.documento), cep = so(c.cep);
  const faltam = [
    !(doc.length === 11 || doc.length === 14) && "CPF/CNPJ", !c.logradouro?.trim() && "endereço", !c.cidade?.trim() && "cidade",
    !(c.uf ?? "").trim().match(/^[A-Za-z]{2}$/) && "UF", cep.length !== 8 && "CEP",
  ].filter(Boolean);
  if (faltam.length) throw new InterErro(`Complete o cadastro de ${c.nome} para emitir o boleto: ${faltam.join(", ")}`);
  const fone = so(c.telefone).replace(/^55(?=\d{10,11}$)/, "");
  return {
    cpfCnpj: doc, tipoPessoa: doc.length === 11 ? "FISICA" : "JURIDICA", nome: c.nome.slice(0, 100),
    endereco: c.logradouro!.trim().slice(0, 90), numero: (c.numero ?? "").trim().slice(0, 10) || undefined, complemento: (c.complemento ?? "").trim().slice(0, 30) || undefined,
    bairro: (c.bairro ?? "").trim().slice(0, 60) || undefined, cidade: c.cidade!.trim().slice(0, 60), uf: c.uf!.trim().toUpperCase(), cep,
    email: c.email?.trim() || undefined, ...(fone.length >= 10 ? { ddd: fone.slice(0, 2), telefone: fone.slice(2) } : {}),
  };
}

type Detalhe = {
  cobranca?: { codigoSolicitacao?: string; seuNumero?: string; situacao?: string; dataSituacao?: string; valorTotalRecebido?: string | number; origemRecebimento?: string };
  boleto?: { linhaDigitavel?: string; nossoNumero?: string };
  pix?: { pixCopiaECola?: string; txid?: string };
};

/** Registra o boleto da fatura (se ainda não tiver um válido). Erros ficam gravados na fatura. */
export async function emitirBoleto(faturaId: string, cliente?: ClienteInter | null) {
  cliente ??= await clienteInter();
  if (!cliente) throw new InterErro("Configure o Banco Inter da Central em Configurações");
  const geral = await ler("geral");
  // trava a fatura: dois cliques ou duas rotinas não geram dois boletos
  const f = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Fatura" WHERE id = ${faturaId} FOR UPDATE`;
    const f = await tx.fatura.findUniqueOrThrow({ where: { id: faturaId }, include: { cliente: true } });
    if (f.situacao !== "ABERTA") throw new InterErro("Fatura já paga ou cancelada");
    if (f.codigoSolicitacao && f.boletoSituacao !== "CANCELADO" && f.boletoSituacao !== "EXPIRADO") return null;
    const seuNumero = `F${Date.now().toString(36).toUpperCase()}${randomBytes(2).toString("hex").toUpperCase()}`.slice(0, 15);
    return tx.fatura.update({ where: { id: faturaId }, data: { seuNumero, codigoSolicitacao: null, boletoSituacao: "EMITINDO", boletoErro: null, linhaDigitavel: null, pixCopiaECola: null }, include: { cliente: true } });
  });
  if (!f) return prisma.fatura.findUniqueOrThrow({ where: { id: faturaId } });
  try {
    const hoje = diaSP();
    const vencimento = f.vencimento < hoje ? hoje : f.vencimento;
    const corpo = {
      seuNumero: f.seuNumero, valorNominal: Number(f.valor), dataVencimento: iso(vencimento), numDiasAgenda: 30,
      pagador: pagador(f.cliente),
      mensagem: { linha1: `Mensalidade MXERP ${f.competencia.slice(5)}/${f.competencia.slice(0, 4)}`.slice(0, 78) },
      ...(geral.multaPct > 0 ? { multa: { codigo: "PERCENTUAL", taxa: geral.multaPct } } : {}),
      ...(geral.jurosMesPct > 0 ? { mora: { codigo: "TAXAMENSAL", taxa: geral.jurosMesPct } } : {}),
    };
    const r = await cliente.chamar("POST", API, { json: corpo });
    if (r.status !== 200 && r.status !== 201) falha("não registrou o boleto", r);
    const { codigoSolicitacao } = JSON.parse(r.corpo) as { codigoSolicitacao?: string };
    if (!codigoSolicitacao) throw new InterErro("Inter: resposta sem código da cobrança");
    await prisma.fatura.update({ where: { id: f.id }, data: { codigoSolicitacao, boletoSituacao: "EM_PROCESSAMENTO" } });
    try { await atualizarBoleto(f.id, cliente); } catch { /* linha digitável chega na próxima consulta */ }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    await prisma.fatura.update({ where: { id: f.id }, data: { boletoSituacao: "ERRO", boletoErro: m.slice(0, 500) } });
    throw e instanceof InterErro ? e : new InterErro(m);
  }
  return prisma.fatura.findUniqueOrThrow({ where: { id: faturaId } });
}

/** Grava o que o Inter diz do boleto; pago → fatura paga. */
export async function aplicarDetalhe(faturaId: string, d: Detalhe) {
  const c = d.cobranca ?? {};
  const pago = c.situacao === "RECEBIDO";
  const f = await prisma.fatura.findUniqueOrThrow({ where: { id: faturaId } });
  return prisma.fatura.update({
    where: { id: faturaId },
    data: {
      boletoSituacao: c.situacao ?? f.boletoSituacao, boletoErro: null,
      linhaDigitavel: d.boleto?.linhaDigitavel || f.linhaDigitavel, pixCopiaECola: d.pix?.pixCopiaECola || f.pixCopiaECola,
      ...(pago && f.situacao === "ABERTA"
        ? {
            situacao: "PAGA",
            pagaEm: c.dataSituacao ? new Date(`${c.dataSituacao.slice(0, 10)}T00:00:00Z`) : diaSP(),
            valorPago: c.valorTotalRecebido != null ? Number(c.valorTotalRecebido) : f.valor,
            formaPagamento: c.origemRecebimento === "PIX" ? "PIX" : "BOLETO",
          }
        : {}),
    },
  });
}

export async function atualizarBoleto(faturaId: string, cliente?: ClienteInter | null) {
  cliente ??= await clienteInter();
  const f = await prisma.fatura.findUniqueOrThrow({ where: { id: faturaId } });
  if (!cliente || !f.codigoSolicitacao) return f;
  const r = await cliente.chamar("GET", `${API}/${f.codigoSolicitacao}`);
  if (r.status !== 200) falha("não consultou o boleto", r);
  return aplicarDetalhe(f.id, JSON.parse(r.corpo) as Detalhe);
}

export async function cancelarBoleto(faturaId: string, motivo: string, cliente?: ClienteInter | null) {
  cliente ??= await clienteInter();
  const f = await prisma.fatura.findUniqueOrThrow({ where: { id: faturaId } });
  if (!cliente || !f.codigoSolicitacao || ["RECEBIDO", "CANCELADO", "EXPIRADO"].includes(f.boletoSituacao ?? "")) return;
  const r = await cliente.chamar("POST", `${API}/${f.codigoSolicitacao}/cancelar`, { json: { motivoCancelamento: motivo.slice(0, 50) } });
  if (r.status !== 200 && r.status !== 202 && r.status !== 204) falha("não cancelou o boleto", r);
  await prisma.fatura.update({ where: { id: f.id }, data: { boletoSituacao: "CANCELADO" } });
}

export async function pdfBoleto(faturaId: string, cliente?: ClienteInter | null) {
  cliente ??= await clienteInter();
  const f = await prisma.fatura.findUniqueOrThrow({ where: { id: faturaId } });
  if (!cliente || !f.codigoSolicitacao) throw new InterErro("Boleto ainda não registrado no Inter");
  const r = await cliente.chamar("GET", `${API}/${f.codigoSolicitacao}/pdf`);
  if (r.status !== 200) falha("não gerou o PDF", r);
  const { pdf } = JSON.parse(r.corpo) as { pdf?: string };
  if (!pdf) throw new InterErro("PDF ainda não disponível, tente de novo em instantes");
  return Buffer.from(pdf, "base64");
}

/** De hora em hora: boletos que mudaram de situação nos últimos dias, e os que ficaram sem linha digitável. */
export async function sincronizarBoletos(cliente?: ClienteInter | null) {
  cliente ??= await clienteInter();
  if (!cliente) return null;
  const res = { pagas: 0, consultados: 0, erros: [] as string[] };
  try {
    const fim = diaSP(), inicio = somarDias(fim, -5);
    for (let pagina = 0; ; pagina++) {
      const r = await cliente.chamar("GET", API, { params: { dataInicial: iso(inicio), dataFinal: iso(fim), filtrarDataPor: "SITUACAO", "paginacao.paginaAtual": pagina, "paginacao.itensPorPagina": 1000 } });
      if (r.status !== 200) falha("não listou os boletos", r);
      const j = JSON.parse(r.corpo) as { cobrancas?: Detalhe[]; totalPaginas?: number; ultimaPagina?: boolean };
      for (const d of j.cobrancas ?? []) {
        const cs = d.cobranca?.codigoSolicitacao;
        const f = cs ? await prisma.fatura.findUnique({ where: { codigoSolicitacao: cs } }) : null;
        if (!f) continue; // boleto de outro sistema (o MXERP da MXTECH usa a mesma conta)
        res.consultados++;
        const antes = f.situacao;
        const depois = await aplicarDetalhe(f.id, d);
        if (antes === "ABERTA" && depois.situacao === "PAGA") res.pagas++;
      }
      if (j.ultimaPagina !== false && (j.totalPaginas ?? 1) <= pagina + 1) break;
    }
    const incompletas = await prisma.fatura.findMany({ where: { situacao: "ABERTA", codigoSolicitacao: { not: null }, OR: [{ linhaDigitavel: null }, { boletoSituacao: "EM_PROCESSAMENTO" }] }, take: 50 });
    for (const f of incompletas) await atualizarBoleto(f.id, cliente).catch((e) => res.erros.push(String(e?.message ?? e)));
  } catch (e) {
    res.erros.unshift(e instanceof Error ? e.message : String(e));
  }
  const s = await ler("inter");
  if (s) await salvar("inter", { ...s, ultimaSinc: new Date().toISOString(), ultimaSincMsg: `${res.pagas} paga(s)${res.erros.length ? ` · Erro: ${res.erros[0]}` : ""}`.slice(0, 400) });
  return res;
}

/** Aviso do Inter: nunca confia no conteúdo; consulta cada boleto nosso de novo. */
export async function receberWebhook(itens: unknown, cliente?: ClienteInter | null) {
  cliente ??= await clienteInter();
  if (!cliente) return 0;
  let n = 0;
  for (const it of ((Array.isArray(itens) ? itens : [itens]) as { codigoSolicitacao?: string }[]).slice(0, 200)) {
    const cs = it?.codigoSolicitacao ? String(it.codigoSolicitacao).slice(0, 100) : "";
    const f = cs ? await prisma.fatura.findUnique({ where: { codigoSolicitacao: cs } }) : null;
    if (!f) continue;
    await atualizarBoleto(f.id, cliente);
    n++;
  }
  return n;
}

/**
 * Cadastra o webhook no Inter. ATENÇÃO: o Inter guarda UM webhook de boletos por integração. Use na Central uma
 * integração (Client ID) diferente da do MXERP da MXTECH, senão um sobrescreve o outro.
 */
export async function registrarWebhook(urlPublica: string, cliente?: ClienteInter | null) {
  cliente ??= await clienteInter();
  const s = await ler("inter");
  if (!cliente || !s) throw new InterErro("Configure o Banco Inter primeiro");
  if (!/^https:\/\/[^/\s]+/i.test(urlPublica)) throw new InterErro("O endereço público precisa começar com https://");
  const token = s.webhookToken || randomBytes(24).toString("base64url");
  const url = `${urlPublica.replace(/\/+$/, "")}/api/inter/webhook/${token}`;
  const r = await cliente.chamar("PUT", `${API}/webhook`, { json: { webhookUrl: url } });
  if (r.status !== 200 && r.status !== 204) falha("não cadastrou o webhook", r);
  await salvar("inter", { ...s, webhookToken: token, webhookMsg: `Webhook cadastrado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` });
  return url;
}
