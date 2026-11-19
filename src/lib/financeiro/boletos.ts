import { randomBytes } from "node:crypto";
import { Prisma, type OrigemDocumento } from "@prisma/client";
import { prisma } from "@/lib/db";
import { proximoNumero } from "@/lib/sequencia";
import { diaSP, somarDias } from "@/lib/datas";
import { baixarLancamento } from "./lancamentos";
import { ClienteInter, ESCOPOS_COBRANCA, explicar, lerConfigInter, mensagemErro, temCobranca, type ConfigInter, type RespostaInter } from "./inter";

/**
 * Boletos (BolePix) do Banco Inter pela API de Cobrança v3.
 *
 * - Parcela a receber cuja forma de pagamento está marcada como "boleto Inter" vira um boleto registrado no
 *   banco, com nosso número, linha digitável, Pix copia e cola e PDF.
 * - Quando o Inter informa que o boleto foi pago (webhook ou consulta de hora em hora), a conta a receber é
 *   baixada na data do pagamento, na conta do Inter, com a diferença em juros/desconto.
 * - Se a parcela some (venda editada, cancelada ou excluída) ou é recebida por outro meio, o boleto é cancelado no Inter.
 *
 * Contas a receber não são mais baixadas por valor/data do extrato: só pelo boleto (ou à mão).
 */

const API = "/cobranca/v3/cobrancas";
const D = (v: number) => new Prisma.Decimal(v.toFixed(2));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const so = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Situações em que o boleto ainda pode ser pago. */
export const ATIVOS = ["EMITINDO", "EM_PROCESSAMENTO", "A_RECEBER", "ATRASADO", "PROTESTO"];
export const ROTULO_BOLETO: Record<string, string> = {
  EMITINDO: "Registrando no Inter", EM_PROCESSAMENTO: "Em processamento no Inter", A_RECEBER: "Boleto emitido", ATRASADO: "Boleto vencido",
  PROTESTO: "Em protesto", RECEBIDO: "Boleto pago", MARCADO_RECEBIDO: "Marcado como recebido no Inter", CANCELADO: "Boleto cancelado",
  EXPIRADO: "Boleto expirado", FALHA_EMISSAO: "Falha na emissão", ERRO: "Não emitido",
};

export class BoletoError extends Error {}

type Ajustes = { emitirBoletos: boolean; boletosDesde: Date | null; multaPct: number; jurosMesPct: number; diasBaixa: number; mensagemBoleto: string | null; ambiente: string };

/** Cliente da API + parâmetros dos boletos. `null` quando a integração não existe ou não tem a permissão de cobrança. */
export async function contextoBoletos(cliente?: ClienteInter) {
  const r = await prisma.integracaoInter.findUnique({ where: { id: "inter" } });
  const cfg: ConfigInter | null = cliente?.configuracao ?? (await lerConfigInter());
  if (!cfg || !temCobranca(cliente ? ESCOPOS_COBRANCA : cfg.escopos)) return null;
  const ajustes: Ajustes = {
    emitirBoletos: r?.emitirBoletos ?? true, boletosDesde: r?.boletosDesde ?? null,
    multaPct: Number(r?.multaPct ?? 2), jurosMesPct: Number(r?.jurosMesPct ?? 1), diasBaixa: r?.diasBaixa ?? 30,
    mensagemBoleto: r?.mensagemBoleto ?? null, ambiente: r?.ambiente ?? (cfg.base.includes("sandbox") ? "sandbox" : "producao"),
  };
  return { cliente: cliente ?? new ClienteInter(cfg), cfg, ajustes };
}
type Contexto = NonNullable<Awaited<ReturnType<typeof contextoBoletos>>>;

async function chamar(ctx: Contexto, metodo: "GET" | "POST" | "PUT", caminho: string, opts: { params?: Record<string, string | number>; json?: unknown } = {}) {
  return ctx.cliente.chamar(metodo, caminho, { ...opts, escopo: ESCOPOS_COBRANCA });
}
function falha(o: string, r: RespostaInter): never {
  let detalhe = r.corpo.slice(0, 400);
  try {
    const j = JSON.parse(r.corpo) as { title?: string; detail?: string; violacoes?: { razao?: string; propriedade?: string }[] };
    detalhe = [j.title, j.detail, ...(j.violacoes ?? []).map((v) => `${v.propriedade ?? ""}: ${v.razao ?? ""}`)].filter(Boolean).join(" · ") || detalhe;
  } catch { /* corpo não é JSON */ }
  throw new BoletoError(`Inter: ${o} (HTTP ${r.status}): ${r.status === 400 || r.status === 403 ? explicar({ ...r, corpo: detalhe }, ESCOPOS_COBRANCA) : detalhe}`);
}

/** Conta do ERP onde caem os recebimentos do Inter (a mesma do extrato). */
export async function contaDoInter(cfg: ConfigInter | null) {
  if (cfg?.contaBancariaId) return prisma.contaBancaria.findUniqueOrThrow({ where: { id: cfg.contaBancariaId } });
  const nome = cfg?.contaErp ?? "INTER MXTECH";
  return prisma.contaBancaria.upsert({ where: { nome }, create: { nome, banco: "077" }, update: {} });
}

// ---------- pagador

type PessoaBoleto = {
  nome: string; documento: string | null; tipoPessoa: string; email: string | null; telefone: string | null; celular: string | null;
  logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null; cep: string | null;
};

/** Monta o pagador do Inter a partir do cadastro do cliente; diz tudo o que falta de uma vez. */
export function pagadorInter(p: PessoaBoleto | null) {
  if (!p) throw new BoletoError("A conta não tem cliente: o boleto precisa de um pagador com CPF/CNPJ e endereço");
  const doc = so(p.documento);
  const cep = so(p.cep);
  const faltam = [
    !(doc.length === 11 || doc.length === 14) && "CPF/CNPJ",
    !p.logradouro?.trim() && "endereço",
    !p.cidade?.trim() && "cidade",
    !(p.uf ?? "").trim().match(/^[A-Za-z]{2}$/) && "UF",
    cep.length !== 8 && "CEP",
  ].filter(Boolean);
  if (faltam.length) throw new BoletoError(`Complete o cadastro de ${p.nome} para emitir o boleto: ${faltam.join(", ")}`);
  const fone = so(p.celular || p.telefone).replace(/^55(?=\d{10,11}$)/, "");
  return {
    cpfCnpj: doc, tipoPessoa: doc.length === 11 ? "FISICA" : "JURIDICA", nome: p.nome.slice(0, 100),
    endereco: p.logradouro!.trim().slice(0, 90), numero: (p.numero ?? "").trim().slice(0, 10) || undefined, complemento: (p.complemento ?? "").trim().slice(0, 30) || undefined,
    bairro: (p.bairro ?? "").trim().slice(0, 60) || undefined, cidade: p.cidade!.trim().slice(0, 60), uf: p.uf!.trim().toUpperCase(), cep,
    email: p.email?.trim() || undefined,
    ...(fone.length === 10 || fone.length === 11 ? { ddd: fone.slice(0, 2), telefone: fone.slice(2) } : {}),
  };
}

// ---------- emissão

const lancamentoComTudo = (id: string) =>
  prisma.lancamento.findUnique({ where: { id }, include: { pessoa: true, formaPagamento: true, boletos: { orderBy: { createdAt: "desc" } } } });

function descricaoParcela(l: { descricao: string; parcela: number; totalParcelas: number }) {
  return l.totalParcelas > 1 && !/\(\d+\/\d+\)/.test(l.descricao) ? `${l.descricao} (${l.parcela}/${l.totalParcelas})` : l.descricao;
}

/**
 * Registra o boleto de uma parcela no Inter. Se já houver um boleto ativo, devolve ele.
 * Erros de cadastro/API ficam gravados no boleto (situação ERRO) e voltam como exceção.
 */
export async function emitirBoleto(lancamentoId: string, opts: { cliente?: ClienteInter } = {}) {
  const ctx = await contextoBoletos(opts.cliente);
  if (!ctx) throw new BoletoError("Integração com o Banco Inter sem a permissão de boletos: configure em Financeiro → Conciliação → Configurar Banco Inter");
  const l = await lancamentoComTudo(lancamentoId);
  if (!l) throw new BoletoError("Conta a receber não encontrada");
  if (l.tipo !== "RECEBER") throw new BoletoError("Boleto só para contas a receber");
  if (l.pagoEm) throw new BoletoError("Esta conta já foi recebida");
  const ativo = l.boletos.find((b) => ATIVOS.includes(b.situacao));
  if (ativo) return ativo;

  const valor = Number(l.valor);
  const hoje = diaSP();
  // o registro começa gravado (EMITINDO) antes de ir ao banco: dois cliques não geram dois boletos
  const reg = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Lancamento" WHERE id = ${lancamentoId} FOR NO KEY UPDATE`;
    const outro = await tx.boleto.findFirst({ where: { lancamentoId, situacao: { in: ATIVOS } } });
    if (outro) return { boleto: outro, novo: false };
    const seuNumero = String(await proximoNumero(tx, "BOLETO"));
    return { novo: true, boleto: await tx.boleto.create({ data: { lancamentoId, token: randomBytes(18).toString("base64url"), seuNumero, valor: l.valor, vencimento: l.vencimento, ambiente: ctx.ajustes.ambiente } }) };
  });
  if (!reg.novo) return reg.boleto;
  const b = reg.boleto;

  try {
    if (valor < 2.5) throw new BoletoError("O Inter só registra boletos a partir de R$ 2,50");
    if (l.vencimento < hoje) throw new BoletoError(`O vencimento (${l.vencimento.toLocaleDateString("pt-BR", { timeZone: "UTC" })}) já passou: altere a data da parcela para emitir o boleto`);
    const pagador = pagadorInter(l.pessoa);
    const a = ctx.ajustes;
    const corpo = {
      seuNumero: b.seuNumero, valorNominal: Math.round(valor * 100) / 100, dataVencimento: iso(l.vencimento),
      numDiasAgenda: Math.max(0, Math.min(60, a.diasBaixa)), pagador,
      mensagem: { linha1: descricaoParcela(l).slice(0, 78), ...(a.mensagemBoleto ? { linha2: a.mensagemBoleto.slice(0, 78) } : {}) },
      ...(a.multaPct > 0 ? { multa: { codigo: "PERCENTUAL", taxa: a.multaPct } } : {}),
      ...(a.jurosMesPct > 0 ? { mora: { codigo: "TAXAMENSAL", taxa: a.jurosMesPct } } : {}),
    };
    const r = await chamar(ctx, "POST", API, { json: corpo });
    if (r.status !== 200 && r.status !== 201) falha("não registrou o boleto", r);
    const { codigoSolicitacao } = JSON.parse(r.corpo) as { codigoSolicitacao?: string };
    if (!codigoSolicitacao) throw new BoletoError(`Inter: resposta sem código da cobrança: ${r.corpo.slice(0, 200)}`);
    await prisma.boleto.update({ where: { id: b.id }, data: { codigoSolicitacao, situacao: "EM_PROCESSAMENTO", erro: null } });
    // os dados do boleto (linha digitável, Pix) costumam sair na hora; se não, a consulta seguinte completa
    try { await atualizarBoleto(b.id, ctx); } catch { /* fica EM_PROCESSAMENTO */ }
    return prisma.boleto.findUniqueOrThrow({ where: { id: b.id } });
  } catch (e) {
    const m = e instanceof BoletoError ? e.message : mensagemErro(e);
    await prisma.boleto.update({ where: { id: b.id }, data: { situacao: "ERRO", erro: m.slice(0, 500) } });
    throw new BoletoError(m);
  }
}

/** A parcela deve virar boleto sozinha? (forma "boleto Inter", lançada depois de ligar os boletos, não migrada). */
export function deveEmitir(l: { tipo: string; pagoEm: Date | null; idLegado: string | null; createdAt: Date; formaPagamento: { boletoInter: boolean } | null }, a: Ajustes) {
  return l.tipo === "RECEBER" && !l.pagoEm && !l.idLegado && !!l.formaPagamento?.boletoInter && a.emitirBoletos && (!a.boletosDesde || l.createdAt >= a.boletosDesde);
}

/**
 * Depois de salvar uma venda/OS/conta: cancela no Inter os boletos de parcelas que sumiram e emite os das
 * parcelas novas. Nunca derruba o que chamou; devolve um aviso para mostrar.
 */
export async function boletosDoDocumento(alvo: { origemTipo: OrigemDocumento; origemId: string } | { lancamentoIds: string[] }, opts: { cliente?: ClienteInter } = {}) {
  try {
    const ctx = await contextoBoletos(opts.cliente);
    if (!ctx) return { emitidos: 0, erros: [] as string[] };
    await cancelarOrfaos(ctx);
    const where = "origemTipo" in alvo ? { origemTipo: alvo.origemTipo, origemId: alvo.origemId } : { id: { in: alvo.lancamentoIds } };
    const ls = await prisma.lancamento.findMany({ where: { ...where, tipo: "RECEBER", pagoEm: null }, include: { formaPagamento: true, boletos: true }, orderBy: [{ vencimento: "asc" }, { parcela: "asc" }] });
    let emitidos = 0; const erros: string[] = [];
    for (const l of ls) {
      if (!deveEmitir(l, ctx.ajustes) || l.boletos.some((b) => ATIVOS.includes(b.situacao) || b.situacao === "ERRO")) continue;
      try { await emitirBoleto(l.id, { cliente: ctx.cliente }); emitidos++; } catch (e) { erros.push(e instanceof Error ? e.message : String(e)); }
    }
    return { emitidos, erros };
  } catch (e) {
    return { emitidos: 0, erros: [mensagemErro(e)] };
  }
}

/** Texto curto para acrescentar à mensagem de uma ação. */
export function avisoBoletos(r: { emitidos: number; erros: string[] }) {
  return [r.emitidos ? `${r.emitidos} boleto(s) registrado(s) no Inter.` : "", r.erros.length ? `Boleto não emitido: ${[...new Set(r.erros)][0]}` : ""].filter(Boolean).join(" ");
}

// ---------- consulta, baixa e cancelamento

type DetalheInter = {
  cobranca?: {
    codigoSolicitacao?: string; seuNumero?: string; situacao?: string; dataSituacao?: string; valorNominal?: string | number; valorTotalRecebido?: string | number;
    origemRecebimento?: string; dataVencimento?: string; pagador?: { nome?: string; cpfCnpj?: string };
  };
  boleto?: { nossoNumero?: string; codigoBarras?: string; linhaDigitavel?: string };
  pix?: { txid?: string; pixCopiaECola?: string };
};

export const MOTIVO_AVISO: Record<string, string> = {
  NAO_EMITIDO: "Boleto não foi emitido pelo MXERP",
  SEM_CONTA: "A conta a receber deste boleto foi excluída",
  CONTA_JA_PAGA: "A conta já estava baixada por outro meio (possível pagamento em dobro)",
};

/**
 * Boleto pago no Inter que não baixou nenhuma conta: vira um aviso para alguém lançar o recebimento, baixar a
 * conta certa ou explicar (ex.: devolvido ao cliente). Um aviso por boleto; repetir a consulta não duplica.
 */
async function registrarAviso(motivo: keyof typeof MOTIVO_AVISO, d: DetalheInter, extra: { boletoId?: string; lancamentoId?: string | null } = {}) {
  const c = d.cobranca ?? {};
  if (!c.codigoSolicitacao) return null;
  const num = (v: string | number | undefined) => (v == null || v === "" || isNaN(Number(v)) ? null : D(Number(v)));
  return prisma.avisoBoleto.upsert({
    where: { codigoSolicitacao: c.codigoSolicitacao },
    update: {},
    create: {
      codigoSolicitacao: c.codigoSolicitacao, motivo, boletoId: extra.boletoId ?? null, lancamentoId: extra.lancamentoId ?? null,
      seuNumero: c.seuNumero ?? null, nossoNumero: d.boleto?.nossoNumero ?? null,
      pagadorNome: c.pagador?.nome?.slice(0, 200) ?? null, pagadorDocumento: so(c.pagador?.cpfCnpj) || null,
      valor: num(c.valorNominal), valorRecebido: num(c.valorTotalRecebido),
      pagoEm: c.dataSituacao ? new Date(`${c.dataSituacao.slice(0, 10)}T00:00:00Z`) : null, origemRecebimento: c.origemRecebimento ?? null,
    },
  });
}

/** Grava o que o Inter disse do boleto e, se foi pago, baixa a conta a receber na data do pagamento. */
export async function aplicarDetalhe(boletoId: string, d: DetalheInter, ctx: Pick<Contexto, "cfg"> | null) {
  const b = await prisma.boleto.findUniqueOrThrow({ where: { id: boletoId } });
  const contaAntes = b.lancamentoId ? await prisma.lancamento.findUnique({ where: { id: b.lancamentoId }, select: { id: true, pagoEm: true, transacao: { select: { documento: true } } } }) : null;
  const c = d.cobranca ?? {};
  const situacao = c.situacao || b.situacao;
  const recebido = situacao === "RECEBIDO";
  const pagoEm = recebido && c.dataSituacao ? new Date(`${c.dataSituacao.slice(0, 10)}T00:00:00Z`) : b.pagoEm;
  const valorRecebido = recebido && c.valorTotalRecebido != null ? Number(c.valorTotalRecebido) : null;
  const atualizado = await prisma.boleto.update({
    where: { id: b.id },
    data: {
      situacao, erro: null,
      nossoNumero: d.boleto?.nossoNumero || b.nossoNumero, linhaDigitavel: d.boleto?.linhaDigitavel || b.linhaDigitavel, codigoBarras: d.boleto?.codigoBarras || b.codigoBarras,
      txid: d.pix?.txid || b.txid, pixCopiaECola: d.pix?.pixCopiaECola || b.pixCopiaECola,
      ...(recebido ? { pagoEm, valorRecebido: valorRecebido != null ? D(valorRecebido) : b.valorRecebido, origemRecebimento: c.origemRecebimento ?? b.origemRecebimento } : {}),
    },
  });
  if (recebido && b.lancamentoId && pagoEm) await baixarPeloBoleto(atualizado.id, ctx?.cfg ?? null);
  if (recebido && b.situacao !== "RECEBIDO") {
    const docs = [atualizado.nossoNumero, atualizado.txid].filter(Boolean);
    if (!contaAntes) await registrarAviso("SEM_CONTA", d, { boletoId: b.id });
    // já estava paga, e não pela entrada do extrato deste mesmo boleto
    else if (contaAntes.pagoEm && !(contaAntes.transacao?.documento && docs.includes(contaAntes.transacao.documento))) {
      await registrarAviso("CONTA_JA_PAGA", d, { boletoId: b.id, lancamentoId: contaAntes.id });
    }
  }
  return atualizado;
}

/** Baixa a conta a receber do boleto pago (se ainda estiver em aberto) e amarra a entrada do extrato, se já veio. */
export async function baixarPeloBoleto(boletoId: string, cfg: ConfigInter | null) {
  const b = await prisma.boleto.findUniqueOrThrow({ where: { id: boletoId }, include: { lancamento: true } });
  if (!b.lancamento || !b.pagoEm) return false;
  const conta = await contaDoInter(cfg);
  const docs = [b.nossoNumero, b.txid].filter((x): x is string => !!x);
  const transacao = docs.length
    ? await prisma.transacaoBancaria.findFirst({ where: { contaBancariaId: conta.id, documento: { in: docs }, valor: { gt: 0 } } })
    : null;
  return prisma.$transaction(async (tx) => {
    const l = await tx.lancamento.findUniqueOrThrow({ where: { id: b.lancamento!.id } });
    let baixou = false;
    if (!l.pagoEm) {
      const recebido = b.valorRecebido != null ? Number(b.valorRecebido) : Number(l.valor);
      const dif = Math.round((recebido - Number(l.valor)) * 100) / 100;
      await baixarLancamento(tx, l.id, { data: b.pagoEm!, contaBancariaId: conta.id, juros: Math.max(0, dif), desconto: Math.max(0, -dif), valorPago: recebido });
      baixou = true;
    }
    if (transacao && transacao.situacao === "PENDENTE" && (!l.transacaoId || l.transacaoId === transacao.id)) {
      await tx.lancamento.update({ where: { id: l.id }, data: { transacaoId: transacao.id } });
      await tx.transacaoBancaria.update({ where: { id: transacao.id }, data: { situacao: "CONCILIADA" } });
    }
    return baixou;
  });
}

/** Consulta um boleto no Inter e grava. */
export async function atualizarBoleto(boletoId: string, ctx?: Contexto | null) {
  ctx ??= await contextoBoletos();
  if (!ctx) throw new BoletoError("Integração com o Banco Inter sem a permissão de boletos");
  const b = await prisma.boleto.findUniqueOrThrow({ where: { id: boletoId } });
  if (!b.codigoSolicitacao) return b;
  const r = await chamar(ctx, "GET", `${API}/${b.codigoSolicitacao}`);
  if (r.status !== 200) falha("não consultou o boleto", r);
  return aplicarDetalhe(b.id, JSON.parse(r.corpo) as DetalheInter, ctx);
}

/** Cancela o boleto no Inter (venda alterada/cancelada, conta recebida por outro meio). */
export async function cancelarBoleto(boletoId: string, motivo: string, ctx?: Contexto | null) {
  const b = await prisma.boleto.findUniqueOrThrow({ where: { id: boletoId } });
  if (!ATIVOS.includes(b.situacao) && b.situacao !== "ERRO") return b;
  if (!b.codigoSolicitacao) return prisma.boleto.update({ where: { id: b.id }, data: { situacao: "CANCELADO" } });
  ctx ??= await contextoBoletos();
  if (!ctx) throw new BoletoError("Integração com o Banco Inter sem a permissão de boletos");
  const r = await chamar(ctx, "POST", `${API}/${b.codigoSolicitacao}/cancelar`, { json: { motivoCancelamento: motivo.slice(0, 50) } });
  if (r.status === 200 || r.status === 202 || r.status === 204) return prisma.boleto.update({ where: { id: b.id }, data: { situacao: "CANCELADO", erro: null } });
  // pode já ter sido pago ou cancelado no banco: consulta e grava o que for
  const atual = await atualizarBoleto(b.id, ctx).catch(() => null);
  if (atual && !ATIVOS.includes(atual.situacao)) return atual;
  falha("não cancelou o boleto", r);
}

/** Boletos cuja parcela foi apagada (venda editada/excluída): cancela no Inter. */
async function cancelarOrfaos(ctx: Contexto) {
  const orfaos = await prisma.boleto.findMany({ where: { lancamentoId: null, situacao: { in: ATIVOS } } });
  let n = 0;
  for (const b of orfaos) {
    try { await cancelarBoleto(b.id, "Parcela alterada ou cancelada no ERP", ctx); n++; }
    catch (e) { await prisma.boleto.update({ where: { id: b.id }, data: { erro: `Cancelamento pendente: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500) } }); }
  }
  return n;
}

/** Recebimento à mão de uma conta com boleto em aberto: cancela o boleto para o cliente não pagar duas vezes. */
export async function cancelarBoletosDoLancamento(lancamentoId: string, motivo = "Recebido por outro meio", opts: { cliente?: ClienteInter } = {}) {
  const bs = await prisma.boleto.findMany({ where: { lancamentoId, situacao: { in: ATIVOS } } });
  if (!bs.length) return 0;
  const ctx = await contextoBoletos(opts.cliente);
  let n = 0;
  for (const b of bs) {
    try { await cancelarBoleto(b.id, motivo, ctx); n++; }
    catch (e) { await prisma.boleto.update({ where: { id: b.id }, data: { erro: `Cancelamento pendente: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500) } }); }
  }
  return n;
}

/** PDF do boleto (fica guardado depois da primeira vez). */
export async function pdfBoleto(boletoId: string, ctx?: Contexto | null) {
  const b = await prisma.boleto.findUniqueOrThrow({ where: { id: boletoId } });
  if (b.pdf) return Buffer.from(b.pdf);
  if (!b.codigoSolicitacao) throw new BoletoError("Boleto não registrado no Inter");
  ctx ??= await contextoBoletos();
  if (!ctx) throw new BoletoError("Integração com o Banco Inter sem a permissão de boletos");
  const r = await chamar(ctx, "GET", `${API}/${b.codigoSolicitacao}/pdf`);
  if (r.status !== 200) falha("não gerou o PDF do boleto", r);
  const { pdf } = JSON.parse(r.corpo) as { pdf?: string };
  if (!pdf) throw new BoletoError("Inter: PDF ainda não disponível, tente de novo em instantes");
  const bytes = Buffer.from(pdf, "base64");
  if (ATIVOS.includes(b.situacao) && b.situacao !== "EMITINDO" && b.situacao !== "EM_PROCESSAMENTO") await prisma.boleto.update({ where: { id: b.id }, data: { pdf: bytes } });
  return bytes;
}

// ---------- rotina de hora em hora e webhook

/**
 * Consulta no Inter os boletos que mudaram de situação nos últimos dias (pagos, vencidos, cancelados), baixa
 * as contas pagas, completa os que ficaram em processamento, cancela os órfãos e emite os que faltaram.
 */
export async function sincronizarBoletos(opts: { dias?: number; cliente?: ClienteInter } = {}) {
  const ctx = await contextoBoletos(opts.cliente);
  if (!ctx) return null;
  const res = { consultados: 0, baixados: 0, emitidos: 0, cancelados: 0, avisos: 0, erros: [] as string[] };
  const avisosAntes = await prisma.avisoBoleto.count();
  try {
    res.cancelados = await cancelarOrfaos(ctx);

    // 1) mudanças de situação no período, em páginas
    const fim = diaSP();
    const inicio = somarDias(fim, -(opts.dias ?? 5));
    const nossos = new Map((await prisma.boleto.findMany({ where: { codigoSolicitacao: { not: null }, createdAt: { gte: somarDias(inicio, -400) } }, select: { id: true, codigoSolicitacao: true, situacao: true, lancamentoId: true } })).map((b) => [b.codigoSolicitacao!, b]));
    for (let pagina = 0; ; pagina++) {
      const r = await chamar(ctx, "GET", API, { params: { dataInicial: iso(inicio), dataFinal: iso(fim), filtrarDataPor: "SITUACAO", "paginacao.paginaAtual": pagina, "paginacao.itensPorPagina": 1000 } });
      if (r.status !== 200) falha("não listou os boletos", r);
      const j = JSON.parse(r.corpo) as { cobrancas?: DetalheInter[]; totalPaginas?: number; ultimaPagina?: boolean };
      for (const d of j.cobrancas ?? []) {
        const cs = d.cobranca?.codigoSolicitacao ?? "";
        const b = nossos.get(cs) ?? (cs ? await prisma.boleto.findUnique({ where: { codigoSolicitacao: cs }, select: { id: true, codigoSolicitacao: true, situacao: true, lancamentoId: true } }) : null);
        if (!b) {
          // pago no Inter, mas não foi emitido por aqui (app do banco, outro sistema)
          if (d.cobranca?.situacao === "RECEBIDO" && !(await prisma.avisoBoleto.findUnique({ where: { codigoSolicitacao: cs }, select: { id: true } }))) {
            await registrarAviso("NAO_EMITIDO", d);
          }
          continue;
        }
        res.consultados++;
        const antes = b.lancamentoId ? await prisma.lancamento.findUnique({ where: { id: b.lancamentoId }, select: { pagoEm: true } }) : null;
        await aplicarDetalhe(b.id, d, ctx);
        if (antes && !antes.pagoEm && d.cobranca?.situacao === "RECEBIDO") res.baixados++;
      }
      if (j.ultimaPagina !== false && (j.totalPaginas ?? 1) <= pagina + 1) break;
    }

    // 2) os que ficaram sem linha digitável (registro assíncrono) ou travados no meio da emissão
    const incompletos = await prisma.boleto.findMany({ where: { OR: [{ situacao: "EM_PROCESSAMENTO" }, { situacao: { in: ["A_RECEBER", "ATRASADO"] }, linhaDigitavel: null }] }, take: 50 });
    for (const b of incompletos) { try { await atualizarBoleto(b.id, ctx); } catch (e) { res.erros.push(e instanceof Error ? e.message : String(e)); } }
    const travados = await prisma.boleto.findMany({ where: { situacao: "EMITINDO", codigoSolicitacao: null, createdAt: { lt: new Date(Date.now() - 10 * 60000) } }, take: 20 });
    for (const b of travados) await recuperarTravado(b.id, b.seuNumero, b.createdAt, ctx).catch((e) => res.erros.push(e instanceof Error ? e.message : String(e)));

    // 3) parcelas novas que ficaram sem boleto (lançadas por outro caminho, ou o Inter estava fora do ar)
    if (ctx.ajustes.emitirBoletos) {
      const ls = await prisma.lancamento.findMany({
        where: { tipo: "RECEBER", pagoEm: null, idLegado: null, formaPagamento: { boletoInter: true }, boletos: { none: {} }, vencimento: { gte: diaSP() },
          createdAt: { gte: ctx.ajustes.boletosDesde && ctx.ajustes.boletosDesde > somarDias(fim, -7) ? ctx.ajustes.boletosDesde : somarDias(fim, -7) } },
        select: { id: true }, take: 100,
      });
      for (const l of ls) { try { await emitirBoleto(l.id, { cliente: ctx.cliente }); res.emitidos++; } catch (e) { res.erros.push(e instanceof Error ? e.message : String(e)); } }
    }
  } catch (e) {
    res.erros.unshift(e instanceof BoletoError ? e.message : mensagemErro(e));
  }
  res.avisos = (await prisma.avisoBoleto.count()) - avisosAntes;
  const msg = `${res.baixados} pago(s) baixado(s), ${res.emitidos} emitido(s), ${res.cancelados} cancelado(s)${res.avisos ? `, ${res.avisos} pago(s) sem conta no sistema` : ""}${res.erros.length ? ` · Erro: ${res.erros[0]}` : ""}`;
  await prisma.integracaoInter.updateMany({ where: { id: "inter" }, data: { ultimaSincBoletosEm: new Date(), ultimaSincBoletosMsg: msg.slice(0, 500) } });
  return res;
}

/** O servidor caiu entre registrar no Inter e gravar a resposta: procura pelo "seu número"; se não achar, marca erro. */
async function recuperarTravado(boletoId: string, seuNumero: string, criado: Date, ctx: Contexto) {
  const r = await chamar(ctx, "GET", API, { params: { dataInicial: iso(somarDias(diaSP(criado), -1)), dataFinal: iso(somarDias(diaSP(), 1)), filtrarDataPor: "EMISSAO", seuNumero, "paginacao.itensPorPagina": 10 } });
  if (r.status !== 200) falha("não consultou o boleto pendente", r);
  const achou = ((JSON.parse(r.corpo) as { cobrancas?: DetalheInter[] }).cobrancas ?? []).find((d) => d.cobranca?.seuNumero === seuNumero && d.cobranca?.codigoSolicitacao);
  if (!achou) return prisma.boleto.update({ where: { id: boletoId }, data: { situacao: "ERRO", erro: "O registro no Inter não foi concluído; emita de novo" } });
  await prisma.boleto.update({ where: { id: boletoId }, data: { codigoSolicitacao: achou.cobranca!.codigoSolicitacao } });
  return aplicarDetalhe(boletoId, achou, ctx);
}

/**
 * Aviso do Inter (webhook). O conteúdo não é confiável por si: para cada boleto nosso citado, a situação é
 * consultada de novo no Inter antes de baixar.
 */
export async function receberWebhook(itens: unknown, opts: { cliente?: ClienteInter } = {}) {
  const lista = (Array.isArray(itens) ? itens : [itens]) as { codigoSolicitacao?: string }[];
  const ctx = await contextoBoletos(opts.cliente);
  if (!ctx) return 0;
  let n = 0;
  for (const it of lista.slice(0, 200)) {
    const cs = it?.codigoSolicitacao ? String(it.codigoSolicitacao).slice(0, 100) : "";
    const b = cs ? await prisma.boleto.findUnique({ where: { codigoSolicitacao: cs } }) : null;
    if (!b) {
      // boleto que não é nosso: consulta no Inter e, se foi pago, avisa (nada é baixado)
      if (cs && /^[\w-]+$/.test(cs) && !(await prisma.avisoBoleto.findUnique({ where: { codigoSolicitacao: cs }, select: { id: true } }))) {
        const r = await chamar(ctx, "GET", `${API}/${cs}`).catch(() => null);
        if (r?.status === 200) {
          const d = JSON.parse(r.corpo) as DetalheInter;
          if (d.cobranca?.situacao === "RECEBIDO" && d.cobranca.codigoSolicitacao === cs) await registrarAviso("NAO_EMITIDO", d);
        }
      }
      continue;
    }
    await atualizarBoleto(b.id, ctx);
    n++;
  }
  return n;
}

/** Cadastra no Inter o endereço do webhook de boletos (precisa ser https e público). */
export async function registrarWebhook(urlPublica: string, opts: { cliente?: ClienteInter } = {}) {
  const ctx = await contextoBoletos(opts.cliente);
  if (!ctx) throw new BoletoError("Integração com o Banco Inter sem a permissão de boletos");
  if (!/^https:\/\/[^/\s]+/i.test(urlPublica)) throw new BoletoError("O endereço público precisa começar com https://");
  const atual = await prisma.integracaoInter.findUnique({ where: { id: "inter" } });
  const token = atual?.webhookToken || randomBytes(24).toString("base64url");
  const url = `${urlPublica.replace(/\/+$/, "")}/api/inter/webhook/${token}`;
  const r = await chamar(ctx, "PUT", `${API}/webhook`, { json: { webhookUrl: url } });
  if (r.status !== 200 && r.status !== 204) falha("não cadastrou o webhook", r);
  await prisma.integracaoInter.updateMany({ where: { id: "inter" }, data: { urlPublica, webhookToken: token, webhookMsg: `Webhook cadastrado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` } });
  return url;
}

/** Teste da permissão de boletos (para a tela de configuração). */
export async function testarCobranca(ctx: Contexto) {
  const hoje = diaSP();
  const r = await chamar(ctx, "GET", API, { params: { dataInicial: iso(somarDias(hoje, -1)), dataFinal: iso(hoje), "paginacao.itensPorPagina": 1 } });
  if (r.status !== 200) falha("não liberou os boletos", r);
}

/** Há integração com permissão de boletos? (sem abrir os segredos; para as telas) */
export async function boletosDisponiveis() {
  const r = await prisma.integracaoInter.findUnique({ where: { id: "inter" }, select: { escopos: true } });
  if (r) return temCobranca(r.escopos);
  return temCobranca(process.env.INTER_ESCOPOS) && !!process.env.INTER_CLIENT_ID;
}

/**
 * Endereço público do ERP para o link do boleto mandado ao cliente. Só existe se configurado na tela: o
 * endereço local (localhost / rede interna) não abre no celular do cliente, então sem ele a mensagem leva só a
 * linha digitável e o Pix copia e cola (e o PDF vai impresso ou anexado).
 */
export async function baseLinks() {
  const r = await prisma.integracaoInter.findUnique({ where: { id: "inter" }, select: { urlPublica: true } });
  return r?.urlPublica?.replace(/\/+$/, "") || null;
}
