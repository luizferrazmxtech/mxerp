import { randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma, type IntegracaoMarketplace } from "@prisma/client";
import { prisma } from "@/lib/db";
import { naLoja } from "@/lib/empresa/loja";
import { cifrar, decifrar } from "@/lib/seguranca/segredos";
import { diaSP } from "@/lib/datas";
import { garantirPadroes } from "@/lib/financeiro/padroes";
import { alterarSituacaoPedido, salvarPedido } from "@/lib/vendas/pedidos";
import type { DadosOrcamento, LinhaProduto } from "@/lib/orcamentos/tipos";
import { CANAL_ML, type EtapaPedido } from "./tipos";

/**
 * Mercado Livre: pedidos viram vendas no MXERP e o dinheiro é baixado sozinho quando o Mercado Pago libera.
 *
 *  1. Conexão OAuth (app do próprio Luiz em developers.mercadolivre.com.br): o token dura 6 horas e é renovado pelo
 *     refresh token (que só vale uma vez: o novo é guardado a cada renovação). Tudo cifrado com a chave do servidor.
 *  2. Pedido pago → venda na situação configurada (padrão: a que lança estoque e financeiro), com uma conta a receber
 *     do valor dos itens que vence na data de liberação do Mercado Pago, na forma "Mercado Pago".
 *     Cada item precisa estar ligado a um produto: pelo SKU do anúncio (= código, código de barras ou código da
 *     variação do produto) ou ligado à mão na tela de anúncios. Enquanto faltar, o pedido fica "sem vínculo".
 *  3. Dinheiro liberado (money_release_status = released) → a conta a receber é baixada na conta "Mercado Pago" na
 *     data da liberação e a diferença para o líquido recebido vira uma conta paga de "Tarifas de marketplace"
 *     (comissão, taxa do Mercado Pago e frete cobrado do vendedor), para a DRE mostrar o custo de vender lá.
 *  4. Pedido cancelado antes da liberação → a venda vai para a situação de cancelamento (devolve o estoque e tira a
 *     conta a receber). Depois da liberação, só avisa (o estorno sai do saldo do Mercado Pago).
 *
 * Roda pelo agendador (/api/mercadolivre/sincronizar, de hora em hora), pelas notificações do Mercado Livre
 * (/api/mercadolivre/notificacoes/<token>, quando o ERP estiver num endereço público) e pelo botão "Sincronizar agora".
 */

export const API_ML = "https://api.mercadolibre.com";
export const API_MP = "https://api.mercadopago.com";
export const AUTORIZACAO_ML = "https://auth.mercadolivre.com.br/authorization";

export type RespostaHttp = { status: number; corpo: string };
export type TransporteHttp = (metodo: "GET" | "POST", url: string, headers: Record<string, string>, corpo: string | null) => Promise<RespostaHttp>;
/** Nos testes, um falso: os testes nunca falam com o Mercado Livre de verdade. */
export type DepsML = { transporte?: TransporteHttp; agora?: Date };

export class MercadoLivreError extends Error {}

const transporteFetch: TransporteHttp = async (metodo, url, headers, corpo) => {
  const r = await fetch(url, { method: metodo, headers, body: corpo ?? undefined, signal: AbortSignal.timeout(30_000) });
  return { status: r.status, corpo: await r.text() };
};

const D = (v: number) => new Prisma.Decimal(v.toFixed(2));
const arred = (v: number) => Math.round(v * 100) / 100;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const so = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const json = <T>(r: RespostaHttp): T => { try { return JSON.parse(r.corpo) as T; } catch { throw new MercadoLivreError(`Resposta inválida do Mercado Livre (HTTP ${r.status})`); } };
function detalhe(r: RespostaHttp) {
  try {
    const j = JSON.parse(r.corpo) as { message?: string; error?: string; cause?: unknown };
    return [j.error, j.message].filter(Boolean).join(": ") || r.corpo.slice(0, 300);
  } catch { return r.corpo.slice(0, 300); }
}

// ---------- tipos do que a API devolve (só o que usamos)

export type ItemPedidoML = { item: { id: string; title: string; seller_sku?: string | null; seller_custom_field?: string | null; variation_id?: number | string | null }; quantity: number; unit_price: number; sale_fee?: number };
export type PagamentoPedidoML = { id: number | string; status: string; transaction_amount?: number; total_paid_amount?: number; shipping_cost?: number; date_approved?: string | null; money_release_date?: string | null };
export type PedidoML = {
  id: number | string; status: string; date_created: string; date_closed?: string | null; last_updated?: string;
  total_amount: number; paid_amount?: number; pack_id?: number | string | null;
  order_items: ItemPedidoML[]; payments?: PagamentoPedidoML[];
  buyer?: { id?: number | string; nickname?: string; first_name?: string; last_name?: string };
  tags?: string[];
};
export type PagamentoMP = {
  id: number | string; status: string; transaction_amount: number; date_approved?: string | null;
  money_release_date?: string | null; money_release_status?: string | null;
  transaction_details?: { net_received_amount?: number; total_paid_amount?: number };
  fee_details?: { type?: string; amount?: number; fee_payer?: string }[];
  transaction_amount_refunded?: number;
};

// ---------- configuração e conexão

export type ConfigMLTela = {
  conectado: boolean; ativo: boolean; clientId: string; temSecret: boolean; redirectUri: string; contaId: string | null; contaNome: string | null;
  empresaId: string; contaBancariaId: string; situacaoVendaId: string; formaPagamentoId: string; canalVenda: string;
  importarDesde: string; cancelarAuto: boolean; sincronizarAuto: boolean; webhookToken: string | null;
  ultimaSincEm: Date | null; ultimaSincMsg: string | null; tokenExpiraEm: Date | null;
};

export async function integracaoML() {
  return prisma.integracaoMarketplace.findUnique({ where: { id: CANAL_ML } });
}

export async function configMLTela(): Promise<ConfigMLTela> {
  const r = await integracaoML();
  return {
    conectado: !!r?.refreshTokenCifrado, ativo: r?.ativo ?? true, clientId: r?.clientId ?? "", temSecret: !!r?.clientSecretCifrado, redirectUri: r?.redirectUri ?? "",
    contaId: r?.contaId ?? null, contaNome: r?.contaNome ?? null, empresaId: r?.empresaId ?? "", contaBancariaId: r?.contaBancariaId ?? "",
    situacaoVendaId: r?.situacaoVendaId ?? "", formaPagamentoId: r?.formaPagamentoId ?? "", canalVenda: r?.canalVenda ?? "Mercado Livre",
    importarDesde: r?.importarDesde ? iso(r.importarDesde) : "", cancelarAuto: r?.cancelarAuto ?? true, sincronizarAuto: r?.sincronizarAuto ?? true,
    webhookToken: r?.webhookToken ?? null, ultimaSincEm: r?.ultimaSincEm ?? null, ultimaSincMsg: r?.ultimaSincMsg ?? null, tokenExpiraEm: r?.tokenExpiraEm ?? null,
  };
}

export type DadosConfigML = {
  ativo: boolean; clientId: string; clientSecret?: string; redirectUri: string; empresaId: string; contaBancariaId: string; situacaoVendaId: string;
  formaPagamentoId: string; canalVenda: string; importarDesde: string; cancelarAuto: boolean; sincronizarAuto: boolean;
};

export async function salvarConfigML(d: DadosConfigML) {
  const atual = await integracaoML();
  const clientId = d.clientId.trim();
  if (!/^\d{4,}$/.test(clientId)) throw new MercadoLivreError("Informe o Client ID (App ID) do aplicativo: só números, como aparece em developers.mercadolivre.com.br");
  const secret = d.clientSecret?.trim();
  if (!secret && !atual?.clientSecretCifrado) throw new MercadoLivreError("Informe a Secret Key (chave secreta) do aplicativo");
  const redirectUri = d.redirectUri.trim();
  if (!/^https:\/\/\S+$/.test(redirectUri)) throw new MercadoLivreError("A URL de redirecionamento precisa começar com https:// e ser idêntica à cadastrada no aplicativo do Mercado Livre");
  if (!d.importarDesde) throw new MercadoLivreError("Informe a partir de quando os pedidos viram venda (os anteriores você já lançou à mão)");
  const trocouApp = !!atual && atual.clientId !== clientId;
  const dados = {
    ativo: d.ativo, clientId, redirectUri, empresaId: d.empresaId || null, contaBancariaId: d.contaBancariaId || null, situacaoVendaId: d.situacaoVendaId || null,
    formaPagamentoId: d.formaPagamentoId || null, canalVenda: d.canalVenda.trim() || "Mercado Livre", importarDesde: new Date(`${d.importarDesde}T00:00:00-03:00`),
    cancelarAuto: d.cancelarAuto, sincronizarAuto: d.sincronizarAuto,
    ...(secret ? { clientSecretCifrado: cifrar(secret) } : {}),
    // outro aplicativo: a conexão antiga não vale mais
    ...(trocouApp ? { accessTokenCifrado: null, refreshTokenCifrado: null, tokenExpiraEm: null, contaId: null, contaNome: null } : {}),
  };
  await prisma.integracaoMarketplace.upsert({
    where: { id: CANAL_ML },
    create: { id: CANAL_ML, ...dados, clientSecretCifrado: cifrar(secret!), webhookToken: randomBytes(18).toString("base64url") },
    update: { ...dados, ...(atual?.webhookToken ? {} : { webhookToken: randomBytes(18).toString("base64url") }) },
  });
}

/** Link "Conectar com o Mercado Livre": a pessoa entra na conta de vendedor e autoriza o aplicativo. */
export async function linkAutorizacaoML() {
  const r = await integracaoML();
  if (!r) throw new MercadoLivreError("Salve o Client ID, a Secret Key e a URL de redirecionamento antes de conectar");
  const state = randomBytes(12).toString("hex");
  await prisma.integracaoMarketplace.update({ where: { id: CANAL_ML }, data: { estadoOauth: state } });
  const q = new URLSearchParams({ response_type: "code", client_id: r.clientId, redirect_uri: r.redirectUri, state });
  return `${AUTORIZACAO_ML}?${q}`;
}

/** Tira o código de autorização do que foi colado: o código (TG-…) ou o endereço inteiro para onde o Mercado Livre mandou. */
export function extrairCodigo(colado: string): { code: string; state: string | null } {
  const s = colado.trim();
  if (!s) throw new MercadoLivreError("Cole o código de autorização ou o endereço completo da página para onde o Mercado Livre levou você");
  if (/^https?:\/\//i.test(s)) {
    const u = new URL(s);
    const code = u.searchParams.get("code");
    if (!code) throw new MercadoLivreError("O endereço colado não tem o código (?code=…). Clique em Conectar de novo e copie o endereço da página final");
    return { code, state: u.searchParams.get("state") };
  }
  return { code: s.replace(/^code=/, ""), state: null };
}

type Token = { access_token: string; refresh_token?: string; expires_in: number; user_id?: number | string };

async function guardarToken(t: Token, extra: Partial<IntegracaoMarketplace> = {}) {
  return prisma.integracaoMarketplace.update({
    where: { id: CANAL_ML },
    data: {
      accessTokenCifrado: cifrar(t.access_token), ...(t.refresh_token ? { refreshTokenCifrado: cifrar(t.refresh_token) } : {}),
      tokenExpiraEm: new Date(Date.now() + Math.max(60, t.expires_in - 300) * 1000), ...extra,
    },
  });
}

/** Troca o código de autorização pelos tokens e descobre a conta (apelido) conectada. */
export async function conectarML(colado: string, deps: DepsML = {}) {
  const r = await integracaoML();
  if (!r) throw new MercadoLivreError("Salve a configuração do aplicativo antes de conectar");
  const { code, state } = extrairCodigo(colado);
  if (state && r.estadoOauth && state !== r.estadoOauth) throw new MercadoLivreError("Este código é de um pedido de conexão antigo. Clique em Conectar de novo");
  const transporte = deps.transporte ?? transporteFetch;
  const corpo = new URLSearchParams({ grant_type: "authorization_code", client_id: r.clientId, client_secret: decifrar(r.clientSecretCifrado), code, redirect_uri: r.redirectUri });
  const resp = await transporte("POST", `${API_ML}/oauth/token`, { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, corpo.toString());
  if (resp.status !== 200) throw new MercadoLivreError(`O Mercado Livre recusou a conexão (HTTP ${resp.status}): ${detalhe(resp)}. O código vale 10 minutos e só uma vez; clique em Conectar de novo`);
  const t = json<Token>(resp);
  await guardarToken(t, { contaId: t.user_id != null ? String(t.user_id) : null, estadoOauth: null });
  const ml = await ClienteML.criar(deps);
  const eu = await ml.get<{ id: number; nickname: string }>("/users/me");
  await prisma.integracaoMarketplace.update({ where: { id: CANAL_ML }, data: { contaId: String(eu.id), contaNome: eu.nickname } });
  return { contaId: String(eu.id), contaNome: eu.nickname };
}

export async function desconectarML() {
  await prisma.integracaoMarketplace.update({ where: { id: CANAL_ML }, data: { accessTokenCifrado: null, refreshTokenCifrado: null, tokenExpiraEm: null, estadoOauth: null } });
}

/** Cliente da API (Mercado Livre e Mercado Pago, com o mesmo token do vendedor). */
export class ClienteML {
  private constructor(private r: IntegracaoMarketplace, private transporte: TransporteHttp) {}

  static async criar(deps: DepsML = {}) {
    const r = await integracaoML();
    if (!r?.refreshTokenCifrado) throw new MercadoLivreError("O Mercado Livre não está conectado (Vendas › Marketplaces › Mercado Livre)");
    return new ClienteML(r, deps.transporte ?? transporteFetch);
  }

  get contaId() { return this.r.contaId; }

  private async renovar() {
    const corpo = new URLSearchParams({ grant_type: "refresh_token", client_id: this.r.clientId, client_secret: decifrar(this.r.clientSecretCifrado), refresh_token: decifrar(this.r.refreshTokenCifrado!) });
    const resp = await this.transporte("POST", `${API_ML}/oauth/token`, { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, corpo.toString());
    if (resp.status !== 200) {
      // outro processo pode ter renovado ao mesmo tempo (o refresh token só vale uma vez): usa o que ele guardou
      const outro = await integracaoML();
      if (outro?.tokenExpiraEm && outro.accessTokenCifrado && outro.tokenExpiraEm > new Date() && outro.accessTokenCifrado !== this.r.accessTokenCifrado) { this.r = outro; return; }
      throw new MercadoLivreError(`Não foi possível renovar o acesso ao Mercado Livre (HTTP ${resp.status}): ${detalhe(resp)}. Conecte a conta de novo`);
    }
    this.r = await guardarToken(json<Token>(resp));
  }

  private async token(forcar = false) {
    if (forcar || !this.r.accessTokenCifrado || !this.r.tokenExpiraEm || this.r.tokenExpiraEm <= new Date()) await this.renovar();
    return decifrar(this.r.accessTokenCifrado!);
  }

  async chamar(caminho: string, base = API_ML): Promise<RespostaHttp> {
    let resp = await this.transporte("GET", `${base}${caminho}`, { Authorization: `Bearer ${await this.token()}`, Accept: "application/json" }, null);
    if (resp.status === 401) resp = await this.transporte("GET", `${base}${caminho}`, { Authorization: `Bearer ${await this.token(true)}`, Accept: "application/json" }, null);
    return resp;
  }

  async get<T>(caminho: string, base = API_ML): Promise<T> {
    const resp = await this.chamar(caminho, base);
    if (resp.status !== 200) throw new MercadoLivreError(`Mercado Livre: ${caminho.split("?")[0]} (HTTP ${resp.status}): ${detalhe(resp)}`);
    return json<T>(resp);
  }
}

// ---------- pagamento e liberação

export type ResumoPagamento = {
  pago: boolean; cancelado: boolean; bruto: number; liquido: number; liberado: boolean; liberacao: Date | null;
  pagamentos: { id: string; status: string; valor: number; liquido: number; liberacao: string | null; liberado: boolean }[];
};

/** Junta os pagamentos aprovados do pedido (detalhe do Mercado Pago): valor, líquido e liberação. */
export async function resumoPagamento(ml: ClienteML, pedido: PedidoML, agora = new Date()): Promise<ResumoPagamento> {
  const lista = pedido.payments ?? [];
  const aprovados = lista.filter((p) => p.status === "approved");
  const pagamentos: ResumoPagamento["pagamentos"] = [];
  for (const p of aprovados) {
    const mp = await ml.get<PagamentoMP>(`/v1/payments/${p.id}`, API_MP);
    if (mp.status !== "approved") continue;
    const tarifas = (mp.fee_details ?? []).filter((f) => !f.fee_payer || f.fee_payer === "collector").reduce((s, f) => s + Number(f.amount ?? 0), 0);
    const liquido = Number(mp.transaction_details?.net_received_amount ?? 0) > 0 ? Number(mp.transaction_details!.net_received_amount) : Number(mp.transaction_amount) - tarifas;
    const liberacao = mp.money_release_date ?? p.money_release_date ?? null;
    const liberado = mp.money_release_status ? mp.money_release_status === "released" : !!liberacao && new Date(liberacao) <= agora;
    pagamentos.push({ id: String(mp.id), status: mp.status, valor: Number(mp.transaction_amount), liquido: arred(liquido), liberacao, liberado });
  }
  const datas = pagamentos.map((p) => p.liberacao).filter(Boolean).map((s) => new Date(s!));
  const cancelado = pedido.status === "cancelled" || (lista.length > 0 && lista.every((p) => ["refunded", "cancelled", "charged_back", "rejected"].includes(p.status)) && lista.some((p) => p.status !== "rejected"));
  return {
    pago: pagamentos.length > 0 && !cancelado,
    cancelado,
    bruto: arred(pagamentos.reduce((s, p) => s + p.valor, 0)),
    liquido: arred(pagamentos.reduce((s, p) => s + p.liquido, 0)),
    liberado: pagamentos.length > 0 && pagamentos.every((p) => p.liberado),
    liberacao: datas.length ? new Date(Math.max(...datas.map((d) => d.getTime()))) : null,
    pagamentos,
  };
}

// ---------- vínculo anúncio → produto

const skuDo = (i: ItemPedidoML) => (i.item.seller_sku ?? i.item.seller_custom_field ?? "").trim() || null;
const variacaoDo = (i: ItemPedidoML) => (i.item.variation_id != null ? String(i.item.variation_id) : "");

/** Produto do item: o vínculo salvo na tela, senão o SKU = código, código de barras ou código de uma variação. */
export async function produtoDoItem(i: ItemPedidoML): Promise<string | null> {
  const chave = { canal_anuncioId_variacaoId: { canal: CANAL_ML, anuncioId: i.item.id, variacaoId: variacaoDo(i) } };
  const salvo = await prisma.anuncioMarketplace.findUnique({ where: chave });
  if (salvo?.produtoId) return salvo.produtoId;
  const sku = skuDo(i);
  let produtoId: string | null = null;
  if (sku) {
    const p = (await prisma.produto.findUnique({ where: { codigo: sku }, select: { id: true } }))
      ?? (await prisma.produto.findFirst({ where: { gtin: sku }, select: { id: true } }))
      ?? (await prisma.produtoVariacao.findFirst({ where: { OR: [{ codigo: sku }, { gtin: sku }] }, select: { id: true, produtoId: true } }).then((v) => (v ? { id: v.produtoId } : null)));
    produtoId = p?.id ?? null;
  }
  await prisma.anuncioMarketplace.upsert({
    where: chave,
    create: { canal: CANAL_ML, anuncioId: i.item.id, variacaoId: variacaoDo(i), titulo: i.item.title, sku, produtoId },
    update: { titulo: i.item.title, sku, ...(produtoId ? { produtoId } : {}) },
  });
  return produtoId;
}

// ---------- cliente (comprador)

type DocumentoComprador = { documento: string | null; nome: string | null };

/** CPF/CNPJ e nome da nota (dados de faturamento do pedido). Se a API não der, segue sem. */
async function documentoComprador(ml: ClienteML, pedidoId: string): Promise<DocumentoComprador> {
  try {
    const r = await ml.chamar(`/orders/${pedidoId}/billing_info`);
    if (r.status !== 200) return { documento: null, nome: null };
    const j = JSON.parse(r.corpo) as { billing_info?: { doc_number?: string; additional_info?: { type: string; value: string }[] } };
    const info = j.billing_info?.additional_info ?? [];
    const campo = (t: string) => info.find((x) => x.type === t)?.value?.trim() || "";
    const nome = campo("BUSINESS_NAME") || [campo("FIRST_NAME"), campo("LAST_NAME")].filter(Boolean).join(" ");
    const doc = so(j.billing_info?.doc_number);
    return { documento: doc.length === 11 || doc.length === 14 ? doc : null, nome: nome || null };
  } catch { return { documento: null, nome: null }; }
}

/** Cliente da venda: pelo CPF/CNPJ, senão o mesmo comprador (apelido) de um pedido anterior, senão um cadastro novo. */
async function clienteDoComprador(pedido: PedidoML, doc: DocumentoComprador) {
  const apelido = pedido.buyer?.nickname?.trim() || null;
  if (doc.documento) {
    const p = await prisma.pessoa.findUnique({ where: { documento: doc.documento }, select: { id: true } });
    if (p) return p.id;
  }
  if (apelido) {
    const anterior = await prisma.pedidoMarketplace.findFirst({ where: { canal: CANAL_ML, compradorApelido: apelido, vendaId: { not: null } }, orderBy: { dataPedido: "desc" }, select: { vendaId: true } });
    const v = anterior?.vendaId ? await prisma.venda.findUnique({ where: { id: anterior.vendaId }, select: { clienteId: true } }) : null;
    if (v?.clienteId) return v.clienteId;
  }
  const nome = doc.nome || [pedido.buyer?.first_name, pedido.buyer?.last_name].filter(Boolean).join(" ").trim() || apelido || `Comprador Mercado Livre ${pedido.buyer?.id ?? ""}`.trim();
  return prisma.$transaction(async (tx) => {
    const [seq] = await tx.$queryRaw<{ valor: number }[]>`INSERT INTO "Sequencia" (chave, valor) VALUES ('CLIENTE', 1) ON CONFLICT (chave) DO UPDATE SET valor = "Sequencia".valor + 1 RETURNING valor`;
    let codigo = seq.valor;
    while (await tx.pessoa.findUnique({ where: { codigoCliente: codigo }, select: { id: true } })) codigo++;
    const p = await tx.pessoa.create({
      data: {
        nome, documento: doc.documento, tipoPessoa: doc.documento?.length === 14 ? "JURIDICA" : "FISICA", cliente: true, codigoCliente: codigo,
        observacoes: `Comprador do Mercado Livre${apelido ? ` (apelido ${apelido})` : ""}`,
      },
      select: { id: true },
    });
    return p.id;
  });
}

// ---------- financeiro padrão

async function padroesFinanceiros(r: IntegracaoMarketplace) {
  return prisma.$transaction(async (tx) => {
    await garantirPadroes(tx);
    const conta = r.contaBancariaId ? await tx.contaBancaria.findUnique({ where: { id: r.contaBancariaId } }) : null;
    const forma = r.formaPagamentoId ? await tx.formaPagamento.findUnique({ where: { id: r.formaPagamentoId } }) : null;
    const tarifa = await tx.categoriaFinanceira.upsert({
      where: { nome_tipo: { nome: "Tarifas de marketplace", tipo: "PAGAR" } },
      create: { nome: "Tarifas de marketplace", tipo: "PAGAR", grupoDre: "DESPESA_OPERACIONAL", codigo: "2.13" }, update: {},
    });
    await tx.canalVenda.upsert({ where: { nome: r.canalVenda }, create: { nome: r.canalVenda, ordem: 50 }, update: {} });
    return {
      contaId: (conta ?? (await tx.contaBancaria.upsert({ where: { nome: "Mercado Pago" }, create: { nome: "Mercado Pago", banco: "323" }, update: {} }))).id,
      formaId: (forma ?? (await tx.formaPagamento.upsert({ where: { nome: "Mercado Pago" }, create: { nome: "Mercado Pago", tPag: "99", diasPrazo: 0 }, update: {} }))).id,
      tarifaId: tarifa.id,
    };
  });
}

async function situacaoDaVenda(r: IntegracaoMarketplace) {
  const conf = r.situacaoVendaId ? await prisma.situacaoVendaConfig.findUnique({ where: { id: r.situacaoVendaId } }) : null;
  if (conf) return conf;
  const s = await prisma.situacaoVendaConfig.findFirst({ where: { estoque: "LANCAR", financeiro: true }, orderBy: [{ padrao: "desc" }, { ordem: "asc" }] });
  if (!s) throw new MercadoLivreError("Cadastre uma situação de venda que lance o estoque e o financeiro (ex.: Concretizada)");
  return s;
}

async function situacaoCancelada() {
  return prisma.situacaoVendaConfig.findFirst({ where: { estoque: "NAO", financeiro: false }, orderBy: { ordem: "asc" } });
}

// ---------- processamento de um pedido

const USUARIO_ML = { id: "", nome: "Mercado Livre" };

type Resultado = { etapa: EtapaPedido; vendaCriada?: boolean; baixado?: boolean; cancelado?: boolean };

/**
 * Leva um pedido do Mercado Livre até onde ele pode ir: registra, gera a venda, baixa a liberação ou cancela.
 * Idempotente: rodar de novo com o mesmo pedido não duplica venda, baixa nem tarifa.
 */
export async function processarPedidoML(ml: ClienteML, pedido: PedidoML, deps: DepsML = {}): Promise<Resultado> {
  const r = (await integracaoML())!;
  const agora = deps.agora ?? new Date();
  const externoId = String(pedido.id);
  const chave = { canal_externoId: { canal: CANAL_ML, externoId } };
  const dataPedido = new Date(pedido.date_closed ?? pedido.date_created);
  const base = {
    pacoteId: pedido.pack_id != null ? String(pedido.pack_id) : null, situacaoExterna: pedido.status, dataPedido,
    compradorApelido: pedido.buyer?.nickname ?? null, total: D(Number(pedido.total_amount)), dados: pedido as unknown as Prisma.InputJsonValue,
  };
  const atual = await prisma.pedidoMarketplace.upsert({
    where: chave,
    create: { canal: CANAL_ML, externoId, etapa: "AGUARDANDO_PAGAMENTO", ...base, compradorNome: [pedido.buyer?.first_name, pedido.buyer?.last_name].filter(Boolean).join(" ") || null },
    update: base,
  });
  const marcar = (etapa: EtapaPedido, extra: Prisma.PedidoMarketplaceUpdateInput = {}) =>
    prisma.pedidoMarketplace.update({ where: { id: atual.id }, data: { etapa, erro: null, ...extra } }).then(() => etapa);

  if (atual.etapa === "LIBERADO" && !pedido.status.includes("cancel")) return { etapa: "LIBERADO" };
  if (!atual.vendaId && r.importarDesde && new Date(pedido.date_created) < r.importarDesde) return { etapa: await marcar("IGNORADO") };

  const pg = await resumoPagamento(ml, pedido, agora);
  const dadosPg = {
    bruto: pg.bruto ? D(pg.bruto) : null, liquido: pg.pagamentos.length ? D(pg.liquido) : null,
    pagamentos: pg.pagamentos as unknown as Prisma.InputJsonValue, liberacaoPrevista: pg.liberacao,
  };

  // cancelado / devolvido
  if (pg.cancelado) {
    if (atual.etapa === "LIBERADO") {
      await prisma.pedidoMarketplace.update({ where: { id: atual.id }, data: { erro: "Cancelado no Mercado Livre depois da liberação: confira o estorno no saldo do Mercado Pago e faça a devolução da venda" } });
      return { etapa: "LIBERADO" };
    }
    if (atual.vendaId && r.cancelarAuto) {
      const cancel = await situacaoCancelada();
      const venda = await prisma.venda.findUnique({ where: { id: atual.vendaId }, select: { situacaoId: true, numero: true } });
      if (cancel && venda && venda.situacaoId !== cancel.id) {
        try {
          await alterarSituacaoPedido(atual.vendaId, cancel.id, USUARIO_ML, { observacao: `Pedido ${externoId} cancelado no Mercado Livre` });
        } catch (e) {
          await prisma.pedidoMarketplace.update({ where: { id: atual.id }, data: { etapa: "ERRO", erro: `Cancelado no Mercado Livre, mas a venda nº ${venda.numero} não foi cancelada: ${e instanceof Error ? e.message : String(e)}` } });
          return { etapa: "ERRO" };
        }
        return { etapa: await marcar("CANCELADO", dadosPg), cancelado: true };
      }
    }
    return { etapa: await marcar("CANCELADO", { ...dadosPg, ...(atual.vendaId && !r.cancelarAuto ? { erro: "Cancelado no Mercado Livre: cancele a venda no MXERP" } : {}) }) };
  }
  if (!pg.pago) return { etapa: await marcar("AGUARDANDO_PAGAMENTO", dadosPg) };

  // venda
  let vendaCriada = false;
  if (!atual.vendaId) {
    const produtos: string[] = [];
    const faltam: string[] = [];
    for (const i of pedido.order_items) {
      const p = await produtoDoItem(i);
      if (p) produtos.push(p); else faltam.push(`${i.item.title}${skuDo(i) ? ` (SKU ${skuDo(i)})` : " (sem SKU)"}`);
    }
    if (faltam.length) return { etapa: await marcar("SEM_VINCULO", { ...dadosPg, erro: `Ligue ao produto: ${faltam.join("; ")}` }) };
    // pega o pedido antes, para dois processos (agendador e notificação) não gerarem duas vendas
    const pega = await prisma.pedidoMarketplace.updateMany({ where: { id: atual.id, vendaId: null, etapa: { not: "GERANDO" } }, data: { etapa: "GERANDO" } });
    if (!pega.count) return { etapa: "GERANDO" as EtapaPedido };
    try {
      const doc = await documentoComprador(ml, externoId);
      const clienteId = await clienteDoComprador(pedido, doc);
      const fin = await padroesFinanceiros(r);
      const situacao = await situacaoDaVenda(r);
      const cadastro = await prisma.produto.findMany({ where: { id: { in: produtos } }, select: { id: true, nome: true, codigo: true, unidade: true } });
      const porId = new Map(cadastro.map((p) => [p.id, p]));
      const linhas: LinhaProduto[] = pedido.order_items.map((i, k) => {
        const p = porId.get(produtos[k])!;
        return { produtoId: p.id, nome: p.nome, codigo: p.codigo, unidade: p.unidade, detalhes: `${i.item.title} (${i.item.id})`, quantidade: String(i.quantity), tipoValorId: "", valorUnit: Number(i.unit_price).toFixed(2), desconto: "", descontoPct: false };
      });
      const dia = iso(diaSP(dataPedido));
      const vencimento = iso(pg.liberacao ? diaSP(pg.liberacao) : diaSP(dataPedido));
      const dados: DadosOrcamento = {
        tipo: "PRODUTO", numero: "", clienteId, clienteNome: "", data: dia, validade: "", vendedorId: "", prazoEntrega: "", aosCuidados: "",
        canal: r.canalVenda, centroCusto: "", introducao: "", situacaoId: situacao.id, produtos: linhas, servicos: [],
        transportadoraId: "", transportadoraNome: "", frete: "0", mostrarEntrega: false, enderecoEntregaId: "",
        desconto: "", descontoPct: false, exibirTotal: true, gerarCondicoes: true, condicao: "AVISTA", formaPagamentoId: fin.formaId,
        vencimento, intervaloDias: "30", numParcelas: "1", primeiraParcela: vencimento, parcelas: [],
        observacoes: `Pedido Mercado Livre nº ${externoId}${base.pacoteId ? ` (carrinho ${base.pacoteId})` : ""}${base.compradorApelido ? ` · comprador ${base.compradorApelido}` : ""}`,
        observacaoInterna: "", camposExtras: {},
      };
      const v = await naLoja(r.empresaId, () => salvarPedido(dados, USUARIO_ML, undefined, { permitirNegativo: true }));
      await prisma.pedidoMarketplace.update({ where: { id: atual.id }, data: { vendaId: v.id, etapa: "AGUARDANDO_LIBERACAO", erro: null, compradorNome: doc.nome ?? atual.compradorNome, compradorDocumento: doc.documento, ...dadosPg } });
      vendaCriada = true;
    } catch (e) {
      await prisma.pedidoMarketplace.update({ where: { id: atual.id }, data: { etapa: "ERRO", erro: `Venda não gerada: ${e instanceof Error ? e.message : String(e)}`, ...dadosPg } });
      return { etapa: "ERRO" };
    }
  } else {
    await prisma.pedidoMarketplace.update({ where: { id: atual.id }, data: dadosPg });
  }

  if (!pg.liberado) {
    const etapa = await marcar("AGUARDANDO_LIBERACAO", dadosPg);
    if (vendaCriada) await ajustarVencimento(externoId, pg.liberacao);
    return { etapa, vendaCriada };
  }
  const baixa = await baixarLiberacao(externoId, pg, r);
  return { etapa: baixa.etapa, vendaCriada, baixado: baixa.baixado };
}

/** A data de liberação pode mudar (entrega atrasada, mediação): a conta a receber em aberto acompanha. */
async function ajustarVencimento(externoId: string, liberacao: Date | null) {
  if (!liberacao) return;
  const p = await prisma.pedidoMarketplace.findUniqueOrThrow({ where: { canal_externoId: { canal: CANAL_ML, externoId } } });
  if (!p.vendaId) return;
  await prisma.lancamento.updateMany({ where: { origemTipo: "VENDA", origemId: p.vendaId, tipo: "RECEBER", pagoEm: null }, data: { vencimento: diaSP(liberacao) } });
}

/** Baixa a conta a receber da venda na conta do Mercado Pago e lança a tarifa (diferença para o líquido) como paga. */
async function baixarLiberacao(externoId: string, pg: ResumoPagamento, r: IntegracaoMarketplace): Promise<{ etapa: EtapaPedido; baixado: boolean }> {
  const fin = await padroesFinanceiros(r);
  const quando = diaSP(pg.liberacao ?? new Date());
  return prisma.$transaction(async (tx) => {
    const [trava] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "PedidoMarketplace" WHERE canal = ${CANAL_ML} AND "externoId" = ${externoId} FOR UPDATE`;
    const p = await tx.pedidoMarketplace.findUniqueOrThrow({ where: { id: trava.id } });
    if (p.etapa === "LIBERADO" || !p.vendaId) return { etapa: p.etapa as EtapaPedido, baixado: false };
    const abertas = await tx.lancamento.findMany({ where: { origemTipo: "VENDA", origemId: p.vendaId, tipo: "RECEBER" }, orderBy: { parcela: "asc" } });
    const venda = await tx.venda.findUniqueOrThrow({ where: { id: p.vendaId }, select: { numero: true, empresaId: true } });
    if (!abertas.length) {
      await tx.pedidoMarketplace.update({ where: { id: p.id }, data: { etapa: "ERRO", erro: `Dinheiro liberado, mas a venda nº ${venda.numero} não tem conta a receber (a situação dela não lança o financeiro?)` } });
      return { etapa: "ERRO" as EtapaPedido, baixado: false };
    }
    const pendentes = abertas.filter((l) => !l.pagoEm);
    const recebido = abertas.reduce((s, l) => s + Number(l.valor), 0);
    const tarifa = arred(recebido - pg.liquido);
    if (pendentes.length < abertas.length) {
      // alguém já baixou à mão: não mexe, só registra
      await tx.pedidoMarketplace.update({ where: { id: p.id }, data: { etapa: "LIBERADO", liberadoEm: quando, tarifa: D(tarifa), erro: "A conta a receber já tinha sido baixada à mão: a tarifa não foi lançada" } });
      return { etapa: "LIBERADO" as EtapaPedido, baixado: false };
    }
    // líquido maior que o valor dos itens (ex.: frete pago pelo comprador que fica com o vendedor): a sobra entra como juros/acréscimo
    const sobra = tarifa < 0 ? -tarifa : 0;
    for (const [k, l] of pendentes.entries()) {
      const juros = k === 0 ? sobra : 0;
      await tx.lancamento.update({ where: { id: l.id }, data: { pagoEm: quando, contaBancariaId: fin.contaId, juros: D(juros), desconto: D(0), valorPago: D(Number(l.valor) + juros), observacao: [l.observacao, `Liberado pelo Mercado Pago (pedido ${externoId})`].filter(Boolean).join("\n") } });
    }
    let lancamentoTarifaId: string | null = null;
    if (tarifa > 0.009) {
      const t = await tx.lancamento.create({
        data: {
          tipo: "PAGAR", descricao: `Tarifas Mercado Livre · pedido ${externoId} (venda nº ${venda.numero})`, categoriaId: fin.tarifaId, contaBancariaId: fin.contaId,
          formaPagamentoId: fin.formaId, valor: D(tarifa), vencimento: quando, competencia: quando, pagoEm: quando, valorPago: D(tarifa), empresaId: venda.empresaId,
          observacao: "Comissão, taxa do Mercado Pago e frete descontados na liberação",
        },
      });
      lancamentoTarifaId = t.id;
    }
    await tx.pedidoMarketplace.update({ where: { id: p.id }, data: { etapa: "LIBERADO", liberadoEm: quando, tarifa: D(Math.max(0, tarifa)), lancamentoTarifaId, erro: null } });
    return { etapa: "LIBERADO" as EtapaPedido, baixado: true };
  });
}

// ---------- sincronização

export type ResumoSinc = { pedidos: number; vendas: number; baixas: number; cancelados: number; semVinculo: number; erros: string[] };

/**
 * Busca os pedidos alterados desde a última vez (com 2 dias de folga) e reconfere os que esperam a liberação do dinheiro.
 * Sem conexão, desligada ou com a busca automática desligada (quando `auto`), não faz nada.
 */
export async function sincronizarMercadoLivre(deps: DepsML & { auto?: boolean } = {}): Promise<ResumoSinc | { ignorado: string }> {
  const r = await integracaoML();
  if (!r?.refreshTokenCifrado) return { ignorado: "Mercado Livre não conectado" };
  if (!r.ativo) return { ignorado: "integração com o Mercado Livre desligada" };
  if (deps.auto && !r.sincronizarAuto) return { ignorado: "busca automática desligada" };
  const agora = deps.agora ?? new Date();
  const res: ResumoSinc = { pedidos: 0, vendas: 0, baixas: 0, cancelados: 0, semVinculo: 0, erros: [] };
  const conta = (x: Resultado) => {
    res.pedidos++;
    if (x.vendaCriada) res.vendas++;
    if (x.baixado) res.baixas++;
    if (x.cancelado) res.cancelados++;
    if (x.etapa === "SEM_VINCULO") res.semVinculo++;
  };
  try {
    const ml = await ClienteML.criar(deps);
    const inicio = new Date(Math.max(r.importarDesde?.getTime() ?? agora.getTime() - 30 * 86400_000, (r.ultimaSincEm?.getTime() ?? 0) - 2 * 86400_000));
    const vistos = new Set<string>();
    for (let offset = 0; offset < 5000; offset += 50) {
      const q = new URLSearchParams({ seller: ml.contaId ?? "", "order.date_last_updated.from": inicio.toISOString(), sort: "date_asc", offset: String(offset), limit: "50" });
      const pag = await ml.get<{ results: PedidoML[]; paging: { total: number } }>(`/orders/search?${q}`);
      for (const pedido of pag.results) {
        vistos.add(String(pedido.id));
        try { conta(await processarPedidoML(ml, pedido, { ...deps, agora })); } catch (e) { res.erros.push(`Pedido ${pedido.id}: ${e instanceof Error ? e.message : String(e)}`); }
      }
      if (offset + 50 >= pag.paging.total || !pag.results.length) break;
    }
    // a liberação do dinheiro não muda o pedido: reconfere os que esperam (e os que deram erro ou faltava vínculo)
    const esperando = await prisma.pedidoMarketplace.findMany({
      where: { canal: CANAL_ML, OR: [{ etapa: "AGUARDANDO_LIBERACAO", OR: [{ liberacaoPrevista: null }, { liberacaoPrevista: { lte: agora } }] }, { etapa: { in: ["ERRO", "SEM_VINCULO", "GERANDO"] }, updatedAt: { lte: new Date(agora.getTime() - 10 * 60_000) } }] },
      take: 200, orderBy: { dataPedido: "asc" },
    });
    for (const p of esperando) {
      if (vistos.has(p.externoId)) continue;
      try {
        if (p.etapa === "GERANDO" && !p.vendaId) await prisma.pedidoMarketplace.update({ where: { id: p.id }, data: { etapa: "ERRO" } });
        const pedido = await ml.get<PedidoML>(`/orders/${p.externoId}`);
        conta(await processarPedidoML(ml, pedido, { ...deps, agora }));
      } catch (e) { res.erros.push(`Pedido ${p.externoId}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    const msg = `${res.pedidos} pedido(s) conferido(s): ${res.vendas} venda(s) nova(s), ${res.baixas} baixa(s), ${res.cancelados} cancelado(s)${res.semVinculo ? `, ${res.semVinculo} sem vínculo` : ""}${res.erros.length ? `, ${res.erros.length} erro(s): ${res.erros[0]}` : ""}`;
    await prisma.integracaoMarketplace.update({ where: { id: CANAL_ML }, data: { ultimaSincEm: agora, ultimaSincMsg: msg } });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.integracaoMarketplace.update({ where: { id: CANAL_ML }, data: { ultimaSincMsg: `Erro: ${msg}` } });
    throw e;
  }
}

/** Notificação do Mercado Livre (tópico orders_v2): reprocessa o pedido. Outros tópicos são ignorados. */
export async function receberNotificacaoML(token: string, corpo: { topic?: string; resource?: string; user_id?: number | string }, deps: DepsML = {}) {
  const r = await integracaoML();
  if (!r?.webhookToken || Buffer.from(token).length !== Buffer.from(r.webhookToken).length || !timingSafeEqual(Buffer.from(token), Buffer.from(r.webhookToken))) return { status: 404 as const };
  if (!r.ativo || !r.refreshTokenCifrado) return { status: 200 as const, ignorado: "integração desligada" };
  if (r.contaId && corpo.user_id != null && String(corpo.user_id) !== r.contaId) return { status: 200 as const, ignorado: "outra conta" };
  const m = /^\/orders\/(\d+)$/.exec(corpo.resource ?? "");
  if (!corpo.topic?.startsWith("orders") || !m) return { status: 200 as const, ignorado: corpo.topic ?? "sem tópico" };
  const ml = await ClienteML.criar(deps);
  const pedido = await ml.get<PedidoML>(`/orders/${m[1]}`);
  const x = await processarPedidoML(ml, pedido, deps);
  return { status: 200 as const, etapa: x.etapa };
}

/** Liga um anúncio a um produto (pelo código) e reprocessa os pedidos que esperavam por ele. */
export async function vincularAnuncio(anuncioIdInterno: string, codigoProduto: string, deps: DepsML = {}) {
  const a = await prisma.anuncioMarketplace.findUniqueOrThrow({ where: { id: anuncioIdInterno } });
  const codigo = codigoProduto.trim();
  let produtoId: string | null = null;
  if (codigo) {
    const p = (await prisma.produto.findUnique({ where: { codigo }, select: { id: true } })) ?? (await prisma.produto.findFirst({ where: { gtin: codigo }, select: { id: true } }));
    if (!p) throw new MercadoLivreError(`Não há produto com o código ${codigo}`);
    produtoId = p.id;
  }
  await prisma.anuncioMarketplace.update({ where: { id: a.id }, data: { produtoId } });
  if (!produtoId) return { reprocessados: 0 };
  const esperando = await prisma.pedidoMarketplace.findMany({ where: { canal: CANAL_ML, etapa: "SEM_VINCULO" } });
  const doAnuncio = esperando.filter((p) => ((p.dados as unknown as PedidoML).order_items ?? []).some((i) => i.item.id === a.anuncioId && variacaoDo(i) === a.variacaoId));
  if (!doAnuncio.length) return { reprocessados: 0 };
  const ml = await ClienteML.criar(deps);
  let n = 0;
  for (const p of doAnuncio) {
    const pedido = await ml.get<PedidoML>(`/orders/${p.externoId}`);
    await processarPedidoML(ml, pedido, deps);
    n++;
  }
  return { reprocessados: n };
}
