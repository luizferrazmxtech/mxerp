import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { lerPlanilha, normalizar, numeroBr, campo } from "@/lib/migracao/planilha";
import { baixarLancamento, estornarLancamento } from "./lancamentos";

/**
 * Conciliação bancária: lê o extrato (OFX ou CSV/Excel do banco), guarda as
 * transações e casa cada uma com contas a pagar/receber em aberto pelo valor,
 * pela data e pelo nome. O que casa sem dúvida é baixado na hora; o resto
 * aparece como sugestão para confirmar.
 */

export type TransacaoExtrato = { data: Date; valor: number; descricao: string; documento?: string | null; chave: string };

const D = (v: number) => new Prisma.Decimal(v.toFixed(2));
const DIA = 86400000;

// ---------- leitura

function dataOfx(s: string) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(s.trim());
  return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`) : null;
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
    out.push({ data, valor, descricao, documento: tag(b, "CHECKNUM") || tag(b, "REFNUM") || null, chave: fitid ? `ofx:${fitid}` : "" });
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

const palavras = (s: string) => new Set(normalizar(s).split(" ").filter((p) => p.length >= 4 && !/^(ltda|eireli|comercio|servicos|transferencia|pagamento|recebido|enviado|boleto|compra|venda|ordem|servico)$/.test(p)));
function casaNome(t: string, l: Aberto) {
  const pt = palavras(t);
  const alvo = palavras(`${l.pessoa ?? ""} ${l.descricao}`);
  let n = 0;
  for (const p of alvo) if (pt.has(p)) n++;
  return n > 0;
}

/**
 * Casa transações e lançamentos em aberto de mesmo valor (até R$ 0,01), com
 * vencimento de 45 dias antes a 15 dias depois da data do extrato. Cada
 * lançamento é usado uma vez; ganha o par mais próximo (nome bate > data perto).
 * "alta" = nome bate, ou era o único candidato para a transação e a transação a única para ele.
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
    const unico = candT.get(p.transacaoId) === 1 && candL.get(p.lancamentoId) === 1;
    const tipo = abertos.find((l) => l.id === p.lancamentoId)!.tipo;
    out.push({ transacaoId: p.transacaoId, lancamentoId: p.lancamentoId, tipo, dias: p.dias, porNome: p.porNome, confianca: tipo === "PAGAR" && (p.porNome || unico) ? "alta" : "media" });
  }
  return out;
}

export async function sugestoes(contaBancariaId?: string) {
  const ts = await prisma.transacaoBancaria.findMany({ where: { situacao: "PENDENTE", ...(contaBancariaId ? { contaBancariaId } : {}) } });
  if (!ts.length) return [];
  const min = new Date(Math.min(...ts.map((t) => t.data.getTime())) - 45 * DIA);
  const max = new Date(Math.max(...ts.map((t) => t.data.getTime())) + 15 * DIA);
  const abertos = await prisma.lancamento.findMany({ where: { pagoEm: null, vencimento: { gte: min, lte: max } }, include: { pessoa: true } });
  return casar(
    ts.map((t) => ({ id: t.id, data: t.data, valor: Number(t.valor), descricao: t.descricao })),
    abertos.map((l) => ({ id: l.id, tipo: l.tipo, valor: Number(l.valor), vencimento: l.vencimento, descricao: l.descricao, pessoa: l.pessoa ? `${l.pessoa.nome} ${l.pessoa.fantasia ?? ""}` : null })),
  );
}

// ---------- ações

/** Baixa os lançamentos com a data e a conta da transação. Diferença de valor vira juros (a mais) ou desconto (a menos). */
export async function conciliarTx(tx: Tx, transacaoId: string, lancamentoIds: string[]) {
  const t = await tx.transacaoBancaria.findUniqueOrThrow({ where: { id: transacaoId } });
  if (t.situacao !== "PENDENTE") throw new Error("Transação já conciliada ou ignorada");
  if (!lancamentoIds.length) throw new Error("Escolha ao menos uma conta");
  const ls = await tx.lancamento.findMany({ where: { id: { in: lancamentoIds } } });
  const tipo = Number(t.valor) < 0 ? "PAGAR" : "RECEBER";
  if (ls.some((l) => l.tipo !== tipo)) throw new Error(tipo === "PAGAR" ? "Saída do extrato só baixa contas a pagar" : "Entrada do extrato só baixa contas a receber");
  const soma = ls.reduce((s, l) => s + Number(l.valor), 0);
  const dif = Math.round((Math.abs(Number(t.valor)) - soma) * 100) / 100;
  for (const [i, l] of ls.entries()) {
    const ajuste = i === 0 ? dif : 0; // diferença vai toda no primeiro
    await baixarLancamento(tx, l.id, { data: t.data, contaBancariaId: t.contaBancariaId, juros: Math.max(0, ajuste), desconto: Math.max(0, -ajuste) });
    await tx.lancamento.update({ where: { id: l.id }, data: { transacaoId } });
  }
  return tx.transacaoBancaria.update({ where: { id: transacaoId }, data: { situacao: "CONCILIADA" } });
}

/** Transação sem conta correspondente (tarifa, rendimento, PIX avulso): cria o lançamento já baixado. */
export async function lancarAvulsoTx(tx: Tx, transacaoId: string, categoriaId: string, descricao?: string) {
  const t = await tx.transacaoBancaria.findUniqueOrThrow({ where: { id: transacaoId } });
  if (t.situacao !== "PENDENTE") throw new Error("Transação já conciliada ou ignorada");
  const valor = Math.abs(Number(t.valor));
  const tipo = Number(t.valor) < 0 ? "PAGAR" : "RECEBER";
  const cat = await tx.categoriaFinanceira.findUniqueOrThrow({ where: { id: categoriaId } });
  if (cat.tipo !== tipo) throw new Error(`Categoria de ${cat.tipo === "PAGAR" ? "despesa" : "receita"} não serve para ${tipo === "PAGAR" ? "uma saída" : "uma entrada"}`);
  await tx.lancamento.create({
    data: {
      tipo, descricao: (descricao || t.descricao).slice(0, 300), categoriaId, valor: D(valor), vencimento: t.data, competencia: t.data,
      pagoEm: t.data, valorPago: D(valor), contaBancariaId: t.contaBancariaId, transacaoId, idLegado: `extrato:${t.id}`,
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
  return tx.transacaoBancaria.update({ where: { id: transacaoId }, data: { situacao: "PENDENTE" } });
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
    const r = await prisma.transacaoBancaria.createMany({
      data: [{ contaBancariaId, data: t.data, valor: D(t.valor), descricao: t.descricao.slice(0, 500), documento: t.documento ?? null, chave: t.chave }],
      skipDuplicates: true,
    });
    novas += r.count;
  }
  let baixadas = await conciliarPorBoleto(contaBancariaId);
  if (opts.baixarAutomatico !== false) {
    for (const s of (await sugestoes(contaBancariaId)).filter((x) => x.confianca === "alta")) {
      await prisma.$transaction((tx) => conciliarTx(tx, s.transacaoId, [s.lancamentoId]));
      baixadas++;
    }
  }
  return { lidas: ts.length, novas, repetidas: ts.length - novas, baixadas };
}
