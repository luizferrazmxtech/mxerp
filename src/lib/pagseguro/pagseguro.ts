import { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { cifrar, decifrar } from "@/lib/seguranca/segredos";
import { empresaDoDocumento } from "@/lib/empresa/atual";
import { categoria, garantirPadroes } from "@/lib/financeiro/padroes";
import { diaSP, somarDias } from "@/lib/datas";
import { LOJA_ATUAL } from "@/lib/empresa/loja";

/**
 * PagSeguro (PagBank):
 *  - PIX dinâmico no PDV pela API de pedidos (/orders com qr_codes): o caixa mostra o QR e a venda fecha sozinha
 *    quando o PagSeguro confirma o pagamento;
 *  - conciliação pelo EDI (extrato de movimentos): cada venda da maquininha (crédito, débito) e cada PIX vem com a
 *    taxa real e a data do repasse. A conta a receber muda o vencimento para a data do repasse, é baixada na conta
 *    "PagSeguro" quando o dinheiro cai e a taxa vira uma despesa paga ("Tarifas bancárias e taxas de cartão").
 * Tokens cifrados em Configuracao "pagseguro", como os do Inter, MXChat e Melhor Envio. Toda chamada aceita um
 * fetch falso: os testes nunca falam com o PagSeguro de verdade.
 */
export const URL_API = { PRODUCAO: "https://api.pagseguro.com", SANDBOX: "https://sandbox.api.pagseguro.com" } as const;
export const URL_EDI = "https://edi.api.pagseguro.com.br/edi/v1/2.01/movimentos";
export const NOME_CONTA = "PagSeguro";

export type ConfigPagSeguro = {
  ativo: boolean;
  ambiente: keyof typeof URL_API;
  tokenCifrado: string; // token da conta PagBank (Venda online → Integrações → Gerar token)
  pix: boolean; // PIX com QR no PDV
  pixMinutos: number; // validade do QR
  edi: boolean; // conciliar a maquininha e o PIX pelo extrato EDI
  ediUsuario: string; // código de estabelecimento / usuário do EDI
  ediTokenCifrado: string;
  conciliarDesde: string; // AAAA-MM-DD: transações anteriores não são conciliadas
};
export type ConfigPagSeguroTela = Omit<ConfigPagSeguro, "tokenCifrado" | "ediTokenCifrado"> & { temToken: boolean; temEdiToken: boolean };

export class PagSeguroError extends Error {}
/** `hoje`: o dia de hoje já como data civil (meia-noite UTC, igual a diaSP), para os testes. */
export type OpcoesPS = { fetch?: typeof fetch; hoje?: Date };

const hojeISO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const PADRAO: ConfigPagSeguro = { ativo: false, ambiente: "PRODUCAO", tokenCifrado: "", pix: true, pixMinutos: 15, edi: false, ediUsuario: "", ediTokenCifrado: "", conciliarDesde: "" };

export async function configPagSeguro(): Promise<ConfigPagSeguro> {
  const c = await prisma.configuracao.findUnique({ where: { chave: "pagseguro" } });
  return { ...PADRAO, ...((c?.valor ?? {}) as Partial<ConfigPagSeguro>) };
}

export async function configPagSeguroTela(): Promise<ConfigPagSeguroTela> {
  const { tokenCifrado, ediTokenCifrado, ...resto } = await configPagSeguro();
  return { ...resto, temToken: !!tokenCifrado, temEdiToken: !!ediTokenCifrado };
}

/** PIX do PagSeguro pronto para o PDV? */
export async function pixPagSeguroAtivo() {
  const c = await configPagSeguro();
  return c.ativo && c.pix && !!c.tokenCifrado;
}

/** Formas criadas ao ligar: recebidas pelo PagSeguro, com o à vista caindo na conta PagSeguro. */
export const FORMAS_PAGSEGURO = [
  { nome: "PIX (PagSeguro)", tPag: "17", diasPrazo: 0 },
  { nome: "Cartão de débito (PagSeguro)", tPag: "04", diasPrazo: 1 },
  { nome: "Cartão de crédito (PagSeguro)", tPag: "03", diasPrazo: 30 },
];

export async function salvarConfigPagSeguro(d: Omit<ConfigPagSeguro, "tokenCifrado" | "ediTokenCifrado"> & { token?: string; apagarToken?: boolean; ediToken?: string; apagarEdiToken?: boolean }) {
  const atual = await configPagSeguro();
  const tokenCifrado = d.apagarToken ? "" : d.token?.trim() ? cifrar(d.token.trim()) : atual.tokenCifrado;
  const ediTokenCifrado = d.apagarEdiToken ? "" : d.ediToken?.trim() ? cifrar(d.ediToken.trim()) : atual.ediTokenCifrado;
  if (d.ativo && d.pix && !tokenCifrado) throw new PagSeguroError("Cole o token do PagSeguro para gerar PIX no PDV");
  if (d.ativo && d.edi && (!d.ediUsuario.trim() || !ediTokenCifrado)) throw new PagSeguroError("Informe o usuário e o token do EDI para conciliar a maquininha");
  if (d.conciliarDesde && !/^\d{4}-\d{2}-\d{2}$/.test(d.conciliarDesde)) throw new PagSeguroError("Data inicial da conciliação inválida");
  const valor: ConfigPagSeguro = {
    ativo: d.ativo, ambiente: d.ambiente === "SANDBOX" ? "SANDBOX" : "PRODUCAO", tokenCifrado, pix: d.pix, pixMinutos: Math.min(Math.max(Math.trunc(d.pixMinutos) || 15, 2), 120),
    edi: d.edi, ediUsuario: d.ediUsuario.trim(), ediTokenCifrado, conciliarDesde: d.conciliarDesde || atual.conciliarDesde || hojeISO(),
  };
  await prisma.$transaction(async (tx) => {
    await tx.configuracao.upsert({ where: { chave: "pagseguro" }, create: { chave: "pagseguro", valor }, update: { valor } });
    if (!valor.ativo) return;
    const conta = await tx.contaBancaria.upsert({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: NOME_CONTA } }, create: { nome: NOME_CONTA, banco: "290 PagSeguro" }, update: { ativa: true } });
    for (const f of FORMAS_PAGSEGURO) await tx.formaPagamento.upsert({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: f.nome } }, create: { ...f, pagseguro: true, contaBancariaId: conta.id }, update: { pagseguro: true, ativa: true, contaBancariaId: conta.id } });
  });
}

// ---------- API de pedidos (PIX)

async function chamarApi<T>(caminho: string, corpo: unknown, opts: OpcoesPS & { c?: ConfigPagSeguro } = {}): Promise<T> {
  const c = opts.c ?? (await configPagSeguro());
  if (!c.tokenCifrado) throw new PagSeguroError("O PagSeguro não está configurado (Configurações → Integrações → PagSeguro)");
  if (process.env.NODE_ENV === "test" && !opts.fetch) throw new PagSeguroError("Nos testes o PagSeguro só é chamado com um fetch falso");
  let r: Response;
  try {
    r = await (opts.fetch ?? fetch)(`${URL_API[c.ambiente]}${caminho}`, {
      method: corpo === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${decifrar(c.tokenCifrado)}`, "Content-Type": "application/json", Accept: "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo), signal: AbortSignal.timeout(20000),
    });
  } catch (e) { throw new PagSeguroError(`Não foi possível falar com o PagSeguro: ${e instanceof Error ? e.message : String(e)}`); }
  const txt = await r.text();
  let j: unknown = null;
  try { j = txt ? JSON.parse(txt) : null; } catch { /* sem JSON */ }
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) throw new PagSeguroError(`O PagSeguro recusou o token (${r.status}). Gere um token novo na sua conta e salve de novo.`);
    const msgs = (j as { error_messages?: { description?: string; parameter_name?: string }[] } | null)?.error_messages?.map((m) => [m.description, m.parameter_name].filter(Boolean).join(": ")).join("; ");
    throw new PagSeguroError(`O PagSeguro respondeu ${r.status}${msgs ? `: ${msgs}` : txt ? `: ${txt.slice(0, 200)}` : ""}`);
  }
  return j as T;
}

type Pedido = { id: string; qr_codes?: { id?: string; text?: string; expiration_date?: string }[]; charges?: { id?: string; status?: string; paid_at?: string; amount?: { value?: number } }[] };
const soDigitos = (x: string | null | undefined) => (x ?? "").replace(/\D/g, "");

/** Cria o PIX dinâmico do valor (em reais) e guarda a cobrança. Volta o copia e cola e o QR em imagem. */
export async function criarPix(a: { valor: number; caixaId?: string | null; usuarioId?: string | null; cliente?: { nome: string; email?: string | null; documento?: string | null } | null }, opts: OpcoesPS = {}) {
  const c = await configPagSeguro();
  if (!c.ativo || !c.pix || !c.tokenCifrado) throw new PagSeguroError("O PIX do PagSeguro está desligado (Configurações → Integrações → PagSeguro)");
  const centavos = Math.round(a.valor * 100);
  if (centavos < 1) throw new PagSeguroError("Valor do PIX inválido");
  const emp = await empresaDoDocumento(null);
  // o PagSeguro exige um comprador: o cliente da venda, ou a própria loja no consumidor final
  const doc = soDigitos(a.cliente?.documento);
  const comprador = a.cliente && (doc.length === 11 || doc.length === 14)
    ? { name: a.cliente.nome.slice(0, 120), email: a.cliente.email || emp?.email || "pdv@mxerp.com.br", tax_id: doc }
    : { name: (emp?.nomeFantasia || emp?.razaoSocial || "Consumidor").slice(0, 120), email: emp?.email || "pdv@mxerp.com.br", tax_id: soDigitos(emp?.cnpj) };
  const expira = new Date(Date.now() + c.pixMinutos * 60000);
  const ref = `PDV-${Date.now()}`;
  const p = await chamarApi<Pedido>("/orders", {
    reference_id: ref, customer: comprador,
    items: [{ reference_id: "pdv", name: "Venda no balcão", quantity: 1, unit_amount: centavos }],
    qr_codes: [{ amount: { value: centavos }, expiration_date: `${new Date(expira.getTime() - 3 * 3600000).toISOString().slice(0, 19)}-03:00` }],
  }, { ...opts, c });
  const qr = p.qr_codes?.[0];
  if (!p.id || !qr?.text) throw new PagSeguroError("O PagSeguro não devolveu o QR do PIX");
  const cob = await prisma.cobrancaPix.create({ data: { pedidoId: p.id, qrId: qr.id ?? null, texto: qr.text, valor: new Prisma.Decimal(a.valor.toFixed(2)), caixaId: a.caixaId ?? null, usuarioId: a.usuarioId ?? null, expiraEm: expira } });
  return { id: cob.id, texto: cob.texto, valor: a.valor, expiraEm: expira.toISOString(), imagem: await QRCode.toDataURL(cob.texto, { margin: 1, width: 280 }) };
}

/** Consulta o pedido no PagSeguro e marca a cobrança como paga quando a cobrança (charge) do PIX está PAID. */
export async function consultarPix(id: string, opts: OpcoesPS = {}) {
  const cob = await prisma.cobrancaPix.findUniqueOrThrow({ where: { id } });
  if (cob.situacao !== "PENDENTE") return cob;
  const p = await chamarApi<Pedido>(`/orders/${encodeURIComponent(cob.pedidoId)}`, undefined, opts);
  const paga = (p.charges ?? []).find((x) => x.status === "PAID");
  if (paga) {
    const valor = (paga.amount?.value ?? 0) / 100;
    if (Math.abs(valor - Number(cob.valor)) > 0.009) throw new PagSeguroError(`O PIX foi pago com valor diferente (${valor.toFixed(2)})`);
    return prisma.cobrancaPix.update({ where: { id }, data: { situacao: "PAGA", pagaEm: paga.paid_at ? new Date(paga.paid_at) : new Date() } });
  }
  if (cob.expiraEm < new Date()) return prisma.cobrancaPix.update({ where: { id }, data: { situacao: "EXPIRADA" } });
  return cob;
}

/** Desiste do PIX no PDV (o QR expira sozinho no PagSeguro). Cobrança já paga não é cancelada. */
export async function cancelarPix(id: string) {
  const cob = await prisma.cobrancaPix.findUniqueOrThrow({ where: { id } });
  if (cob.situacao === "PAGA") throw new PagSeguroError("Este PIX já foi pago: finalize a venda");
  return prisma.cobrancaPix.update({ where: { id }, data: { situacao: "CANCELADA" } });
}

/** Antes de fechar a venda com PIX do PagSeguro: a cobrança tem de estar paga, no mesmo valor e sem venda. */
export async function conferirPixDaVenda(cobrancaId: string, valorPix: number) {
  const cob = await prisma.cobrancaPix.findUnique({ where: { id: cobrancaId } });
  if (!cob || cob.situacao !== "PAGA") throw new PagSeguroError("O PIX ainda não foi pago");
  if (cob.vendaId) throw new PagSeguroError("Este PIX já foi usado em outra venda");
  if (Math.abs(Number(cob.valor) - valorPix) > 0.009) throw new PagSeguroError("O valor do PIX não confere com o da venda");
  return cob;
}

// ---------- EDI (conciliação da maquininha e do PIX)

/** Linha do EDI (campos do layout 2.01 que o MXERP usa). */
export type LinhaEdi = {
  codigo_transacao: string; parcela?: string | number; quantidade_parcela?: string | number;
  data_venda_ajuste?: string; data_inicial_transacao?: string; hora_inicial_transacao?: string;
  meio_pagamento?: string | number; valor_parcela?: string | number; valor_total_transacao?: string | number;
  valor_liquido_transacao?: string | number; taxa_intermediacao?: string | number; tarifa_intermediacao?: string | number;
  data_prevista_pagamento?: string; data_movimentacao?: string; status_pagamento?: string | number; tipo_evento?: string | number;
  nsu?: string; cartao_bin?: string; cartao_holder?: string; instituicao_financeira?: string;
};

const MEIO: Record<string, string> = { "1": "CREDITO", "8": "DEBITO", "11": "PIX", "15": "DEBITO" };
const TPAG: Record<string, string> = { CREDITO: "03", DEBITO: "04", PIX: "17" };
const num = (x: unknown) => Number(String(x ?? "0").replace(",", ".")) || 0;
const dia = (x?: string | null) => (x && /^\d{4}-\d{2}-\d{2}/.test(x) ? new Date(`${x.slice(0, 10)}T00:00:00Z`) : null);

async function chamarEdi(data: string, tipo: 1 | 2, c: ConfigPagSeguro, opts: OpcoesPS): Promise<LinhaEdi[]> {
  if (process.env.NODE_ENV === "test" && !opts.fetch) throw new PagSeguroError("Nos testes o EDI só é chamado com um fetch falso");
  const linhas: LinhaEdi[] = [];
  const auth = `Basic ${Buffer.from(`${c.ediUsuario}:${decifrar(c.ediTokenCifrado)}`).toString("base64")}`;
  for (let pag = 1; pag <= 50; pag++) {
    let r: Response;
    try {
      r = await (opts.fetch ?? fetch)(`${URL_EDI}?dataMovimento=${data}&pageNumber=${pag}&pageSize=1000&tipoMovimento=${tipo}`, { headers: { Authorization: auth, Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
    } catch (e) { throw new PagSeguroError(`Não foi possível falar com o EDI do PagSeguro: ${e instanceof Error ? e.message : String(e)}`); }
    if (r.status === 401 || r.status === 403) throw new PagSeguroError("O EDI do PagSeguro recusou o usuário/token. Confira em Configurações → Integrações → PagSeguro.");
    if (r.status === 404 || r.status === 204) break;
    if (!r.ok) throw new PagSeguroError(`O EDI do PagSeguro respondeu ${r.status}`);
    const j = (await r.json()) as { detalhes?: LinhaEdi[]; pagination?: { totalPages?: number } };
    linhas.push(...(j.detalhes ?? []));
    if (!j.pagination?.totalPages || pag >= j.pagination.totalPages) break;
  }
  return linhas;
}

/** Grava (ou atualiza) as transações de um dia do EDI transacional. */
export async function gravarTransacoes(linhas: LinhaEdi[]) {
  let n = 0;
  for (const l of linhas) {
    if (!l.codigo_transacao) continue;
    const parcela = Math.max(1, Math.trunc(num(l.parcela)) || 1);
    const bruto = num(l.valor_parcela) || num(l.valor_total_transacao);
    if (!(bruto > 0)) continue; // estornos e ajustes negativos ficam fora da conciliação
    const liquido = l.valor_liquido_transacao != null && l.valor_liquido_transacao !== "" ? num(l.valor_liquido_transacao) : bruto - num(l.taxa_intermediacao) - num(l.tarifa_intermediacao);
    const dv = l.data_venda_ajuste || l.data_inicial_transacao || "";
    const dataVenda = dv ? new Date(`${dv.slice(0, 10)}T${(l.hora_inicial_transacao || "12:00:00").slice(0, 8)}-03:00`) : new Date();
    const pago = /pag|liquid/i.test(String(l.status_pagamento ?? "")) ? dia(l.data_prevista_pagamento) : null;
    const dados = {
      totalParcelas: Math.max(1, Math.trunc(num(l.quantidade_parcela)) || 1), dataVenda, meio: MEIO[String(l.meio_pagamento ?? "")] ?? "OUTRO",
      valorBruto: new Prisma.Decimal(bruto.toFixed(2)), valorLiquido: new Prisma.Decimal(liquido.toFixed(2)), taxa: new Prisma.Decimal(Math.max(bruto - liquido, 0).toFixed(2)),
      dataPrevista: dia(l.data_prevista_pagamento), nsu: l.nsu || null, cartao: [l.instituicao_financeira, l.cartao_holder ? `final ${String(l.cartao_holder).slice(-4)}` : null].filter(Boolean).join(" ") || null,
      dados: l as unknown as Prisma.InputJsonValue,
    };
    const atual = await prisma.transacaoPagSeguro.findUnique({ where: { codigo_parcela: { codigo: l.codigo_transacao, parcela } } });
    if (atual) await prisma.transacaoPagSeguro.update({ where: { id: atual.id }, data: { ...dados, ...(pago && !atual.pagaEm ? { pagaEm: pago } : {}) } });
    else await prisma.transacaoPagSeguro.create({ data: { codigo: l.codigo_transacao, parcela, ...dados, pagaEm: pago } });
    n++;
  }
  return n;
}

/** Movimento financeiro do dia (repasses): marca as parcelas pagas naquela data. */
export async function gravarRepasses(linhas: LinhaEdi[], data: string) {
  let n = 0;
  for (const l of linhas) {
    if (!l.codigo_transacao) continue;
    const parcela = Math.max(1, Math.trunc(num(l.parcela)) || 1);
    const r = await prisma.transacaoPagSeguro.updateMany({ where: { codigo: l.codigo_transacao, parcela, pagaEm: null }, data: { pagaEm: dia(l.data_movimentacao) ?? dia(data)! } });
    n += r.count;
  }
  return n;
}

/**
 * Liga cada transação à conta a receber da venda (forma do PagSeguro, mesmo valor, parcela e dia), muda o
 * vencimento para a data do repasse, baixa quando o dinheiro cai e lança a taxa como despesa paga.
 */
export async function conciliarTransacoes(opts: OpcoesPS = {}) {
  const c = await configPagSeguro();
  const desde = c.conciliarDesde ? new Date(`${c.conciliarDesde}T00:00:00-03:00`) : new Date(0);
  const conta = await prisma.contaBancaria.findUnique({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: NOME_CONTA } } });
  if (!conta) return { ligadas: 0, recebidas: 0, taxas: 0 };
  const hoje = (opts.hoje ?? diaSP(new Date()));
  let ligadas = 0, recebidas = 0, taxas = 0;
  const pend = await prisma.transacaoPagSeguro.findMany({ where: { situacao: { in: ["SEM_CONTA", "CONCILIADA"] }, dataVenda: { gte: desde } }, orderBy: [{ dataVenda: "asc" }, { parcela: "asc" }] });
  for (const t of pend) {
    await prisma.$transaction(async (tx) => {
      let lancId = t.lancamentoId;
      if (!lancId) {
        const d0 = diaSP(t.dataVenda);
        const cand = await tx.lancamento.findFirst({
          where: {
            tipo: "RECEBER", valor: t.valorBruto, parcela: t.parcela, totalParcelas: t.totalParcelas,
            competencia: { gte: somarDias(d0, -1), lte: somarDias(d0, 1) },
            formaPagamento: { pagseguro: true, ...(TPAG[t.meio] ? { tPag: TPAG[t.meio] } : {}) },
            NOT: { id: { in: (await tx.transacaoPagSeguro.findMany({ where: { lancamentoId: { not: null } }, select: { lancamentoId: true } })).map((x) => x.lancamentoId!) } },
          },
          orderBy: { createdAt: "asc" },
        });
        if (!cand) return;
        lancId = cand.id;
        await tx.transacaoPagSeguro.update({ where: { id: t.id }, data: { lancamentoId: cand.id, situacao: "CONCILIADA" } });
        if (!cand.pagoEm && t.dataPrevista) await tx.lancamento.update({ where: { id: cand.id }, data: { vencimento: t.dataPrevista } });
        ligadas++;
      }
      const l = await tx.lancamento.findUnique({ where: { id: lancId } });
      if (!l) { await tx.transacaoPagSeguro.update({ where: { id: t.id }, data: { lancamentoId: null, situacao: "SEM_CONTA" } }); return; }
      let pagoEm = l.pagoEm;
      if (!pagoEm && t.pagaEm && t.pagaEm <= hoje) {
        await tx.lancamento.update({ where: { id: l.id }, data: { pagoEm: t.pagaEm, contaBancariaId: conta.id, valorPago: l.valor } });
        pagoEm = t.pagaEm;
        recebidas++;
      }
      let taxaId = t.taxaLancamentoId;
      if (pagoEm && !taxaId && Number(t.taxa) > 0) {
        await garantirPadroes(tx);
        const cat = await categoria(tx, "Tarifas bancárias e taxas de cartão", "PAGAR");
        const x = await tx.lancamento.create({
          data: {
            tipo: "PAGAR", descricao: `Taxa PagSeguro – ${l.descricao}`, categoriaId: cat.id, contaBancariaId: l.contaBancariaId ?? conta.id, valor: t.taxa, valorPago: t.taxa,
            vencimento: pagoEm, competencia: l.competencia, pagoEm, empresaId: l.empresaId, observacao: `Transação ${t.codigo}${t.totalParcelas > 1 ? ` parcela ${t.parcela}/${t.totalParcelas}` : ""}`,
          },
        });
        taxaId = x.id; taxas++;
      }
      await tx.transacaoPagSeguro.update({ where: { id: t.id }, data: { taxaLancamentoId: taxaId, situacao: pagoEm && (taxaId || !(Number(t.taxa) > 0)) ? "RECEBIDA" : "CONCILIADA" } });
    });
  }
  return { ligadas, recebidas, taxas };
}

/** Agendador: busca no EDI os últimos dias (vendas e repasses) e concilia. */
export async function sincronizarPagSeguro(opts: OpcoesPS = {}) {
  const c = await configPagSeguro();
  const expirados = await prisma.cobrancaPix.updateMany({ where: { situacao: "PENDENTE", expiraEm: { lt: new Date(Date.now() - 3600000) } }, data: { situacao: "EXPIRADA" } });
  if (!c.ativo || !c.edi || !c.ediTokenCifrado) return { ignorado: "conciliação do PagSeguro desligada", pixExpirados: expirados.count };
  const hoje = (opts.hoje ?? diaSP(new Date()));
  let transacoes = 0, repasses = 0;
  for (let i = 3; i >= 0; i--) {
    const d = somarDias(hoje, -i).toISOString().slice(0, 10);
    if (c.conciliarDesde && d < c.conciliarDesde) continue;
    transacoes += await gravarTransacoes(await chamarEdi(d, 1, c, opts));
    repasses += await gravarRepasses(await chamarEdi(d, 2, c, opts), d);
  }
  return { transacoes, repasses, ...(await conciliarTransacoes(opts)) };
}

/** Teste de conexão da tela: um pedido não é criado; só consulta o EDI de ontem e/ou valida o token. */
export async function testarPagSeguro(opts: OpcoesPS = {}) {
  const c = await configPagSeguro();
  const partes: string[] = [];
  if (c.tokenCifrado) {
    // consulta de pedido inexistente: 404 = token aceito; 401/403 = token recusado
    try { await chamarApi("/orders/ORDE_00000000-0000-0000-0000-000000000000", undefined, { ...opts, c }); partes.push("token da API aceito"); }
    catch (e) { if (e instanceof PagSeguroError && /respondeu (404|400)/.test(e.message)) partes.push("token da API aceito"); else throw e; }
  }
  if (c.edi && c.ediTokenCifrado) {
    const ontem = somarDias(diaSP(new Date()), -1).toISOString().slice(0, 10);
    const n = (await chamarEdi(ontem, 1, c, opts)).length;
    partes.push(`EDI respondeu (${n} transaç${n === 1 ? "ão" : "ões"} ontem)`);
  }
  return partes.join(" · ") || "nada para testar";
}
