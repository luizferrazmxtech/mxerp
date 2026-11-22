import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { todasAsLojas } from "@/lib/empresa/loja";
import { prisma, type Tx } from "@/lib/db";
import { lerPlanilha, normalizar, numeroBr, campo } from "@/lib/migracao/planilha";
import { baixarLancamento, estornarLancamento } from "./lancamentos";
import { nomeConfere } from "./conciliacao";

/**
 * Conciliação bancária: lê o extrato (OFX ou CSV/Excel do banco), guarda as
 * transações e casa cada uma com contas a pagar/receber em aberto pelo valor,
 * pela data e pelo nome. O que casa sem dúvida é baixado na hora; o resto
 * aparece como sugestão para confirmar.
 */

export type TransacaoExtrato = {
  data: Date; valor: number; descricao: string; documento?: string | null; chave: string;
  /** data e hora do lançamento no banco (quando o extrato traz a hora) */
  dataHora?: Date | null;
  /** CPF/CNPJ de quem pagou/recebeu (só dígitos), quando o banco manda */
  contraparteDocumento?: string | null;
};

const D = (v: number) => new Prisma.Decimal(v.toFixed(2));
const DIA = 86400000;

// ---------- leitura

function dataOfx(s: string) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(s.trim());
  return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`) : null;
}

/** "20261105103000[-3:BRT]" → instante (sem fuso no arquivo, considera o horário de Brasília). Null sem hora. */
export function dataHoraOfx(s: string) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\.\d+)?(?:\[([+-]?\d{1,2})(?:[.:]\d+)?(?::[^\]]*)?\])?/.exec(s.trim());
  if (!m) return null;
  if (m[4] === "00" && m[5] === "00" && (m[6] ?? "00") === "00") return null; // meia-noite em ponto = o banco não mandou a hora
  const fuso = m[7] !== undefined ? Number(m[7]) : -3;
  const off = `${fuso < 0 ? "-" : "+"}${String(Math.abs(fuso)).padStart(2, "0")}:00`;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}${off}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function lerOfx(texto: string): TransacaoExtrato[] {
  const out: TransacaoExtrato[] = [];
  const tag = (bloco: string, nome: string) => {
    const m = new RegExp(`<${nome}>([^<\\r\\n]*)`, "i").exec(bloco);
    return m ? m[1].trim() : "";
  };
  for (const m of texto.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi)) {
    const b = m[1];
    const data = dataOfx(tag(b, "DTPOSTED"));
    const valor = Number(tag(b, "TRNAMT").replace(",", "."));
    if (!data || !Number.isFinite(valor) || valor === 0) continue;
    const descricao = [tag(b, "NAME"), tag(b, "MEMO")].filter(Boolean).join(" - ") || "(sem descrição)";
    const fitid = tag(b, "FITID");
    out.push({ data, valor, descricao, documento: tag(b, "CHECKNUM") || tag(b, "REFNUM") || null, chave: fitid ? `ofx:${fitid}` : "", dataHora: dataHoraOfx(tag(b, "DTPOSTED")) });
  }
  return comChaves(out);
}

/** Linhas iguais no mesmo dia (duas tarifas iguais, por exemplo) ganham chaves diferentes pela ordem. */
function comChaves(ts: TransacaoExtrato[]) {
  const vistos = new Map<string, number>();
  return ts.map((t) => {
    if (t.chave) return t;
    const base = `${t.data.toISOString().slice(0, 10)}|${t.valor.toFixed(2)}|${normalizar(t.descricao)}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    return { ...t, chave: `lin:${createHash("sha1").update(`${base}|${n}`).digest("hex").slice(0, 24)}` };
  });
}

function dataBrOuIso(s: string) {
  let m = /^(\d{2})\/(\d{2})\/(\d{2,4})/.exec(s.trim());
  if (m) return new Date(`${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2]}-${m[1]}T00:00:00Z`);
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`) : null;
}

const COL = {
  data: ["data lancamento", "data lançamento", "data", "data movimento", "data da transacao", "data mov", "dt lancamento"],
  descricao: ["descricao", "descrição", "historico", "histórico", "lancamento", "lançamento", "detalhes", "transacao", "transação", "estabelecimento"],
  complemento: ["complemento", "detalhe", "favorecido", "nome"],
  valor: ["valor", "valor r", "valor (r$)", "valor rs", "quantia", "montante"],
  credito: ["credito", "crédito", "entrada", "entradas"],
  debito: ["debito", "débito", "saida", "saída", "saidas"],
  documento: ["documento", "nº documento", "n documento", "doc"],
};

/** Valor com sinal: aceita "-10,00", "10,00 D", "(10,00)". */
function valorComSinal(s: string) {
  const neg = /-|\bD\b|^\(.*\)$/i.test(s.trim());
  return Math.abs(numeroBr(s)) * (neg ? -1 : 1);
}

export async function lerExtrato(nome: string, conteudo: Buffer): Promise<TransacaoExtrato[]> {
  const texto = conteudo.toString("latin1");
  if (/\.ofx$/i.test(nome) || /<OFX>/i.test(texto.slice(0, 5000))) {
    const utf = conteudo.toString("utf8");
    return lerOfx(utf.includes("�") ? texto : utf);
  }
  const { linhas } = await lerPlanilha(nome, conteudo);
  const out: TransacaoExtrato[] = [];
  for (const l of linhas) {
    const data = dataBrOuIso(campo(l, COL.data));
    if (!data) continue; // linhas de saldo, cabeçalhos repetidos, rodapé
    const desc = [campo(l, COL.descricao), campo(l, COL.complemento)].filter(Boolean).join(" - ");
    if (/^saldo\b/i.test(desc)) continue;
    const v = campo(l, COL.valor);
    const valor = v ? valorComSinal(v) : Math.abs(numeroBr(campo(l, COL.credito))) - Math.abs(numeroBr(campo(l, COL.debito)));
    if (!valor) continue;
    out.push({ data, valor: Math.round(valor * 100) / 100, descricao: desc || "(sem descrição)", documento: campo(l, COL.documento) || null, chave: "" });
  }
  if (!out.length) throw new Error("Não achei transações no arquivo. Envie o extrato em OFX (preferível) ou CSV/Excel com colunas de data, descrição e valor.");
  return comChaves(out);
}

// ---------- casamento

type Aberto = { id: string; tipo: "PAGAR" | "RECEBER"; valor: number; vencimento: Date; descricao: string; pessoa: string | null };
export type Sugestao = { transacaoId: string; lancamentoId: string; tipo: "PAGAR" | "RECEBER"; confianca: "alta" | "media"; dias: number; porNome: boolean };

/** Nome do cliente/fornecedor (razão social ou fantasia) no extrato; ver nomeConfere. */
function casaNome(t: string, l: Aberto) {
  return (l.pessoa ?? "").split(" / ").some((n) => nomeConfere(t, n));
}

/**
 * Casa transações e lançamentos em aberto de mesmo valor (até R$ 0,01), com
 * vencimento de 45 dias antes a 15 dias depois da data do extrato. Cada
 * lançamento é usado uma vez; ganha o par mais próximo (nome bate > data perto).
 * "alta" = nome do fornecedor confere. Valor e data sozinhos (mesmo único candidato) nunca baixam: o Luiz viu
 * pagamentos de um cliente indo para contas de outro.
 * Contas a RECEBER nunca saem "alta": valor e data não bastam para dizer quem pagou. Elas são baixadas pelo
 * boleto do Inter (ou pelo nosso número do boleto no extrato) e aqui só aparecem como sugestão.
 */
export function casar(transacoes: { id: string; data: Date; valor: number; descricao: string }[], abertos: Aberto[]): Sugestao[] {
  const pares: (Omit<Sugestao, "tipo"> & { score: number })[] = [];
  const candT = new Map<string, number>();
  const candL = new Map<string, number>();
  for (const t of transacoes) {
    const tipo = t.valor < 0 ? "PAGAR" : "RECEBER";
    for (const l of abertos) {
      if (l.tipo !== tipo || Math.abs(Math.abs(t.valor) - l.valor) > 0.009) continue;
      const dias = Math.round((t.data.getTime() - l.vencimento.getTime()) / DIA);
      if (dias < -15 || dias > 45) continue;
      const porNome = casaNome(t.descricao, l);
      pares.push({ transacaoId: t.id, lancamentoId: l.id, dias, porNome, confianca: "media", score: (porNome ? 0 : 1000) + Math.abs(dias) });
      candT.set(t.id, (candT.get(t.id) ?? 0) + 1);
      candL.set(l.id, (candL.get(l.id) ?? 0) + 1);
    }
  }
  pares.sort((a, b) => a.score - b.score);
  const usadosT = new Set<string>();
  const usadosL = new Set<string>();
  const out: Sugestao[] = [];
  for (const p of pares) {
    if (usadosT.has(p.transacaoId) || usadosL.has(p.lancamentoId)) continue;
    usadosT.add(p.transacaoId);
    usadosL.add(p.lancamentoId);
    const tipo = abertos.find((l) => l.id === p.lancamentoId)!.tipo;
    out.push({ transacaoId: p.transacaoId, lancamentoId: p.lancamentoId, tipo, dias: p.dias, porNome: p.porNome, confianca: tipo === "PAGAR" && p.porNome ? "alta" : "media" });
  }
  return out;
}

export async function sugestoes(contaBancariaId?: string) {
  const ts = await prisma.transacaoBancaria.findMany({ where: { situacao: "PENDENTE", ...(contaBancariaId ? { contaBancariaId } : {}) } });
  if (!ts.length) return [];
  const min = new Date(Math.min(...ts.map((t) => t.data.getTime())) - 45 * DIA);
  const max = new Date(Math.max(...ts.map((t) => t.data.getTime())) + 15 * DIA);
  // a conta bancária é de todas as lojas: procura o lançamento em qualquer uma
  const abertos = await todasAsLojas(() => prisma.lancamento.findMany({ where: { pagoEm: null, vencimento: { gte: min, lte: max } }, include: { pessoa: true } }));
  return casar(
    ts.map((t) => ({ id: t.id, data: t.data, valor: Number(t.valor), descricao: t.descricao })),
    abertos.map((l) => ({ id: l.id, tipo: l.tipo, valor: Number(l.valor), vencimento: l.vencimento, descricao: l.descricao, pessoa: l.pessoa ? [l.pessoa.nome, l.pessoa.fantasia].filter(Boolean).join(" / ") : null })),
  );
}

// ---------- ações

/** Baixa os lançamentos com a data e a conta da transação. Diferença de valor vira juros (a mais) ou desconto (a menos). */
/**
 * Baixa uma ou mais contas com uma linha do extrato. Com várias contas, a soma delas tem que bater com o valor da linha;
 * diferença só com `aceitarDiferenca` (vira juros, se o banco mostrou mais, ou desconto, se mostrou menos).
 */
export async function conciliarTx(tx: Tx, transacaoId: string, lancamentoIds: string[], opts: { centroCustoId?: string | null; aceitarDiferenca?: boolean } = {}) {
  const t = await tx.transacaoBancaria.findUniqueOrThrow({ where: { id: transacaoId } });
  if (t.situacao !== "PENDENTE") throw new Error("Transação já conciliada ou ignorada");
  if (!lancamentoIds.length) throw new Error("Escolha ao menos uma conta");
  const ids = [...new Set(lancamentoIds)];
  const ls = await tx.lancamento.findMany({ where: { id: { in: ids } } });
  if (ls.length !== ids.length) throw new Error("Conta não encontrada");
  if (ls.some((l) => l.pagoEm)) throw new Error("Uma das contas já está baixada");
  const tipo = Number(t.valor) < 0 ? "PAGAR" : "RECEBER";
  if (ls.some((l) => l.tipo !== tipo)) throw new Error(tipo === "PAGAR" ? "Saída do extrato só baixa contas a pagar" : "Entrada do extrato só baixa contas a receber");
  const soma = ls.reduce((s, l) => s + Number(l.valor), 0);
  const dif = Math.round((Math.abs(Number(t.valor)) - soma) * 100) / 100;
  if (ls.length > 1 && Math.abs(dif) >= 0.01 && !opts.aceitarDiferenca) {
    throw new Error(`A soma das ${ls.length} contas (${brl(soma)}) não bate com o valor do extrato (${brl(Math.abs(Number(t.valor)))}): diferença de ${brl(Math.abs(dif))}`);
  }
  for (const [i, l] of ls.entries()) {
    const ajuste = i === 0 ? dif : 0; // diferença vai toda no primeiro
    await baixarLancamento(tx, l.id, { data: t.data, contaBancariaId: t.contaBancariaId, juros: Math.max(0, ajuste), desconto: Math.max(0, -ajuste) });
    await tx.lancamento.update({ where: { id: l.id }, data: { transacaoId, ...(opts.centroCustoId ? { centroCustoId: opts.centroCustoId } : {}) } });
  }
  return tx.transacaoBancaria.update({ where: { id: transacaoId }, data: { situacao: "CONCILIADA" } });
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Várias linhas do extrato pagam uma conta só (cliente que pagou em duas vezes, por exemplo): a conta é dividida em
 * uma parte por linha, cada parte baixada com a sua linha. A soma das linhas não pode passar do valor da conta; se
 * ficar abaixo, só com `deixarRestante` (o que falta continua em aberto numa parte a mais).
 */
export async function conciliarLinhasTx(tx: Tx, transacaoIds: string[], lancamentoId: string, opts: { centroCustoId?: string | null; deixarRestante?: boolean } = {}) {
  const ids = [...new Set(transacaoIds)];
  if (ids.length < 2) throw new Error("Escolha duas ou mais linhas do extrato");
  const ts = await tx.transacaoBancaria.findMany({ where: { id: { in: ids } }, orderBy: [{ data: "asc" }, { createdAt: "asc" }] });
  if (ts.length !== ids.length) throw new Error("Linha do extrato não encontrada");
  if (ts.some((t) => t.situacao !== "PENDENTE")) throw new Error("Uma das linhas já foi conciliada ou ignorada");
  const l = await tx.lancamento.findUniqueOrThrow({ where: { id: lancamentoId }, include: { rateio: true } });
  if (l.pagoEm) throw new Error("A conta já está baixada");
  if (l.transferenciaId) throw new Error("Transferência entre contas não pode ser dividida");
  const tipo = Number(ts[0].valor) < 0 ? "PAGAR" : "RECEBER";
  if (ts.some((t) => (Number(t.valor) < 0 ? "PAGAR" : "RECEBER") !== tipo)) throw new Error("Junte só entradas ou só saídas");
  if (l.tipo !== tipo) throw new Error(tipo === "PAGAR" ? "Saídas do extrato só baixam contas a pagar" : "Entradas do extrato só baixam contas a receber");
  const valores = ts.map((t) => Math.round(Math.abs(Number(t.valor)) * 100) / 100);
  const soma = Math.round(valores.reduce((a, b) => a + b, 0) * 100) / 100;
  const total = Number(l.valor);
  const resto = Math.round((total - soma) * 100) / 100;
  if (resto <= -0.01) throw new Error(`A soma das ${ts.length} linhas (${brl(soma)}) passa do valor da conta (${brl(total)}) em ${brl(-resto)}`);
  if (resto >= 0.01 && !opts.deixarRestante) throw new Error(`A soma das ${ts.length} linhas (${brl(soma)}) não fecha a conta (${brl(total)}): faltam ${brl(resto)}`);
  const partes = ts.length + (resto >= 0.01 ? 1 : 0);
  const copia = {
    empresaId: l.empresaId, tipo: l.tipo, pessoaId: l.pessoaId, categoriaId: l.categoriaId, formaPagamentoId: l.formaPagamentoId, vencimento: l.vencimento,
    competencia: l.competencia, parcela: l.parcela, totalParcelas: l.totalParcelas, origemTipo: l.origemTipo, origemId: l.origemId,
    centroCustoId: opts.centroCustoId || l.centroCustoId, funcionarioId: l.funcionarioId, observacao: l.observacao,
  };
  const desc = (i: number) => `${l.descricao} (parte ${i}/${partes})`.slice(0, 300);
  const novos: string[] = [];
  for (let i = 1; i < partes; i++) {
    const valor = i < ts.length ? valores[i] : resto;
    const n = await tx.lancamento.create({ data: { ...copia, descricao: desc(i + 1), valor: D(valor), rateio: { create: l.rateio.map((r) => ({ categoriaId: r.categoriaId, fracao: r.fracao })) } } });
    novos.push(n.id);
  }
  await tx.lancamento.update({ where: { id: l.id }, data: { descricao: desc(1), valor: D(valores[0]), ...(opts.centroCustoId ? { centroCustoId: opts.centroCustoId } : {}) } });
  const alvos = [l.id, ...novos];
  for (const [i, t] of ts.entries()) {
    await baixarLancamento(tx, alvos[i], { data: t.data, contaBancariaId: t.contaBancariaId });
    await tx.lancamento.update({ where: { id: alvos[i] }, data: { transacaoId: t.id } });
    await tx.transacaoBancaria.update({ where: { id: t.id }, data: { situacao: "CONCILIADA" } });
  }
  return { partes, restante: resto >= 0.01 ? resto : 0 };
}

/** Transação sem conta correspondente (tarifa, rendimento, PIX avulso): cria o lançamento já baixado. */
export async function lancarAvulsoTx(tx: Tx, transacaoId: string, categoriaId: string, descricao?: string, centroCustoId?: string | null, competencia?: Date | null, funcionarioId?: string | null) {
  const t = await tx.transacaoBancaria.findUniqueOrThrow({ where: { id: transacaoId } });
  if (t.situacao !== "PENDENTE") throw new Error("Transação já conciliada ou ignorada");
  const valor = Math.abs(Number(t.valor));
  const tipo = Number(t.valor) < 0 ? "PAGAR" : "RECEBER";
  const cat = await tx.categoriaFinanceira.findUniqueOrThrow({ where: { id: categoriaId } });
  if (cat.tipo !== tipo) throw new Error(`Categoria de ${cat.tipo === "PAGAR" ? "despesa" : "receita"} não serve para ${tipo === "PAGAR" ? "uma saída" : "uma entrada"}`);
  await tx.lancamento.create({
    data: {
      tipo, descricao: (descricao || t.descricao).slice(0, 300), categoriaId, valor: D(valor), vencimento: t.data, competencia: competencia ?? t.data,
      pagoEm: t.data, valorPago: D(valor), contaBancariaId: t.contaBancariaId, transacaoId, idLegado: `extrato:${t.id}`, centroCustoId: centroCustoId || null, funcionarioId: funcionarioId || null,
    },
  });
  return tx.transacaoBancaria.update({ where: { id: transacaoId }, data: { situacao: "CONCILIADA" } });
}

export async function ignorarTx(tx: Tx, transacaoId: string) {
  return tx.transacaoBancaria.update({ where: { id: transacaoId }, data: { situacao: "IGNORADA" } });
}

/** Volta a transação para pendente: estorna as baixas e apaga o lançamento avulso criado por ela. */
export async function desfazerTx(tx: Tx, transacaoId: string) {
  const ls = await tx.lancamento.findMany({ where: { transacaoId } });
  for (const l of ls) {
    if (l.idLegado === `extrato:${transacaoId}`) { await tx.lancamento.delete({ where: { id: l.id } }); continue; }
    await estornarLancamento(tx, l.id);
    await tx.lancamento.update({ where: { id: l.id }, data: { transacaoId: null } });
  }
  const t = await tx.transacaoBancaria.findUniqueOrThrow({ where: { id: transacaoId }, select: { motivo: true } });
  // a que saiu sozinha (boleto do Inter) e foi reaberta à mão não sai de novo
  return tx.transacaoBancaria.update({ where: { id: transacaoId }, data: { situacao: "PENDENTE", ...(t.motivo === MOTIVO_BOLETO ? { motivo: "REABERTA" } : {}) } });
}

export const MOTIVO_BOLETO = "BOLETO_INTER";
/** Entrada do extrato que é recebimento de boleto (o Inter descreve assim; o BolePix pago por Pix vem com o txid). */
export const ehBoletoRecebido = (descricao: string) => /^\s*(boleto de cobran[cç]a recebido|recebimento de boleto|liquida[cç][aã]o de boleto|boleto recebido)/i.test(descricao);

/**
 * Regra do Luiz (22/11): boleto recebido não precisa de conciliação, porque a API de cobrança do Inter já baixa a
 * conta. Depois de amarrar os boletos do ERP (conciliarPorBoleto), as entradas de boleto que sobraram (boleto emitido
 * fora do MXERP, ou já baixado) saem da lista de pendentes, marcadas como "baixado pela cobrança". Só fica para
 * conciliar o Pix direto na conta. Devolve quantas saíram.
 */
export async function tirarBoletosRecebidos(contaBancariaId?: string) {
  const ts = await prisma.transacaoBancaria.findMany({
    where: { situacao: "PENDENTE", motivo: null, valor: { gt: 0 }, ...(contaBancariaId ? { contaBancariaId } : {}) },
    select: { id: true, descricao: true, documento: true },
  });
  const docs = [...new Set(ts.map((t) => t.documento).filter((x): x is string => !!x))];
  const [bs, avs] = docs.length
    ? await Promise.all([
      prisma.boleto.findMany({ where: { OR: [{ nossoNumero: { in: docs } }, { txid: { in: docs } }] }, select: { nossoNumero: true, txid: true } }),
      prisma.avisoBoleto.findMany({ where: { nossoNumero: { in: docs } }, select: { nossoNumero: true } }),
    ])
    : [[], []];
  const doBoleto = new Set([...bs.flatMap((b) => [b.nossoNumero, b.txid]), ...avs.map((a) => a.nossoNumero)].filter((x): x is string => !!x));
  const ids = ts.filter((t) => ehBoletoRecebido(t.descricao) || (t.documento && doBoleto.has(t.documento))).map((t) => t.id);
  if (!ids.length) return 0;
  const r = await prisma.transacaoBancaria.updateMany({ where: { id: { in: ids }, situacao: "PENDENTE" }, data: { situacao: "IGNORADA", motivo: MOTIVO_BOLETO } });
  return r.count;
}

/**
 * Entradas do extrato que trazem o nosso número (ou o txid do Pix) de um boleto emitido pelo ERP: amarra com a
 * conta do boleto. Se a conta ainda estiver em aberto (a consulta de boletos ainda não rodou), baixa com a data do extrato.
 * É casamento pelo identificador do boleto, não por valor/data.
 */
export async function conciliarPorBoleto(contaBancariaId: string) {
  const ts = await prisma.transacaoBancaria.findMany({ where: { contaBancariaId, situacao: "PENDENTE", valor: { gt: 0 }, documento: { not: null } } });
  let baixadas = 0;
  for (const t of ts) {
    const b = await prisma.boleto.findFirst({ where: { OR: [{ nossoNumero: t.documento }, { txid: t.documento }], lancamentoId: { not: null } }, include: { lancamento: true } });
    const l = b?.lancamento;
    if (!l || l.tipo !== "RECEBER" || (l.transacaoId && l.transacaoId !== t.id)) continue;
    await prisma.$transaction(async (tx) => {
      if (!l.pagoEm) {
        await conciliarTx(tx, t.id, [l.id]);
        baixadas++;
      } else {
        await tx.lancamento.update({ where: { id: l.id }, data: { transacaoId: t.id } });
        await tx.transacaoBancaria.update({ where: { id: t.id }, data: { situacao: "CONCILIADA" } });
      }
    });
  }
  return baixadas;
}

/** Grava as transações novas do extrato (as que já vieram em outro arquivo são puladas) e baixa as de confiança alta. */
export async function importarExtrato(contaBancariaId: string, ts: TransacaoExtrato[], opts: { baixarAutomatico?: boolean } = {}) {
  let novas = 0;
  for (const t of ts) {
    const extras = { dataHora: t.dataHora ?? null, contraparteDocumento: t.contraparteDocumento ?? null };
    const r = await prisma.transacaoBancaria.createMany({
      data: [{ contaBancariaId, data: t.data, valor: D(t.valor), descricao: t.descricao.slice(0, 500), documento: t.documento ?? null, chave: t.chave, ...extras }],
      skipDuplicates: true,
    });
    novas += r.count;
    // linha que já tinha vindo antes desta versão: completa a hora e o CPF/CNPJ que agora o banco manda
    if (!r.count && (extras.dataHora || extras.contraparteDocumento)) {
      if (extras.dataHora) await prisma.transacaoBancaria.updateMany({ where: { contaBancariaId, chave: t.chave, dataHora: null }, data: { dataHora: extras.dataHora } });
      if (extras.contraparteDocumento) await prisma.transacaoBancaria.updateMany({ where: { contaBancariaId, chave: t.chave, contraparteDocumento: null }, data: { contraparteDocumento: extras.contraparteDocumento } });
    }
  }
  let baixadas = await conciliarPorBoleto(contaBancariaId);
  const boletos = await tirarBoletosRecebidos(contaBancariaId);
  if (opts.baixarAutomatico !== false) {
    for (const s of (await sugestoes(contaBancariaId)).filter((x) => x.confianca === "alta")) {
      await prisma.$transaction((tx) => conciliarTx(tx, s.transacaoId, [s.lancamentoId]));
      baixadas++;
    }
  }
  return { lidas: ts.length, novas, repetidas: ts.length - novas, baixadas, boletos };
}
