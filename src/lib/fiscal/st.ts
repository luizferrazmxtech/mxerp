import { XMLParser } from "fast-xml-parser";
import { prisma } from "@/lib/db";

/**
 * Substituição tributária (ST) pelos XMLs das notas de compra.
 *
 * Quando o produto tem ST, o fornecedor já recolheu o ICMS da cadeia e isso aparece no item da NF-e de entrada:
 * CST 10/30/60/70 (regime normal), CSOSN 201/202/203/500 (Simples), valor em vICMSST / vICMSSTRet,
 * ou CFOP de saída com ST (5401–5405, 6401–6404). Na revenda desses produtos a nota sai com
 * CFOP 5405 (dentro do estado) / 6404 (fora) e CSOSN 500 (Simples) ou CST 60 (regime normal).
 */

export const CST_COM_ST = ["10", "30", "60", "70"];
export const CSOSN_COM_ST = ["201", "202", "203", "500"];
export const CFOP_COM_ST = ["5401", "5402", "5403", "5405", "6401", "6402", "6403", "6404"];

/** Regra fiscal de saída de produto com ST já retida. */
export const REGRA_ST = { cfopInterno: "5405", cfopExterno: "6404", csosn: "500", cstIcms: "60" } as const;

export type ItemNotaSt = {
  ordem: number;
  codigo: string;
  nome: string;
  gtin: string;
  ncm: string;
  cest: string;
  cfop: string;
  /** CST (regime normal) ou CSOSN (Simples) do ICMS do item */
  cst: string;
  valorSt: number;
  /** motivo de o item ser ST, ou null quando a nota trata o item sem ST */
  motivoSt: string | null;
};

export type NotaSt = { chave: string; numero: string; emissao: string; emitenteDocumento: string; emitenteNome: string; itens: ItemNotaSt[] };

const s = (v: unknown) => (v == null ? "" : String(v)).trim();
const num = (v: unknown) => Number(s(v) || 0) || 0;
const lista = <T,>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Lê os itens de uma NF-e (procNFe ou NFe) com o que diz sobre ST. Retorna null se não for NF-e. */
export function lerNotaSt(xml: string): NotaSt | null {
  let doc: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", parseTagValue: false }).parse(xml);
  } catch {
    return null;
  }
  const inf = (doc?.nfeProc?.NFe ?? doc?.NFe)?.infNFe;
  if (!inf?.det || !inf?.emit) return null;
  const itens = lista(inf.det).map((d: Record<string, any>, i: number): ItemNotaSt => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const p = d.prod ?? {};
    const grupoIcms = d.imposto?.ICMS ? (Object.values(d.imposto.ICMS)[0] as Record<string, unknown>) ?? {} : {};
    const cst = s(grupoIcms.CSOSN || grupoIcms.CST);
    const cfop = s(p.CFOP);
    const valorSt = num(grupoIcms.vICMSST) + num(grupoIcms.vICMSSTRet) + num(grupoIcms.vICMSSubstituto);
    const ehCsosn = !!s(grupoIcms.CSOSN);
    const motivo = ehCsosn && CSOSN_COM_ST.includes(cst) ? `CSOSN ${cst}`
      : !ehCsosn && CST_COM_ST.includes(cst) ? `CST ${cst}`
      : CFOP_COM_ST.includes(cfop) ? `CFOP ${cfop}`
      : valorSt > 0 ? "valor de ICMS-ST no item"
      : null;
    return {
      ordem: i, codigo: s(p.cProd), nome: s(p.xProd), gtin: s(p.cEAN), ncm: s(p.NCM).replace(/\D/g, ""), cest: s(p.CEST).replace(/\D/g, ""),
      cfop, cst, valorSt, motivoSt: motivo,
    };
  });
  return {
    chave: s(inf["@Id"]).replace(/^NFe/, ""), numero: s(inf.ide?.nNF), emissao: s(inf.ide?.dhEmi || inf.ide?.dEmi).slice(0, 10),
    emitenteDocumento: s(inf.emit.CNPJ || inf.emit.CPF).replace(/\D/g, ""), emitenteNome: s(inf.emit.xNome), itens,
  };
}

export type Evidencia = { nota: string; fornecedor: string; data: string; item: string; cst: string; cfop: string; motivo: string | null };

export type ProdutoSt = {
  id: string;
  codigo: string;
  nome: string;
  ncm: string | null;
  cest: string | null;
  cfopInterno: string | null;
  cfopExterno: string | null;
  csosn: string | null;
  cstIcms: string | null;
  /** NOTA: veio com ST em nota de compra · NCM: mesmo NCM de item que veio com ST · CEST: tem CEST no cadastro (CEST só existe para ST) */
  fonte: "NOTA" | "NCM" | "CEST";
  /** já está com CFOP 5405 e CSOSN 500 */
  ajustado: boolean;
  /** também veio SEM ST em alguma nota (conferir com o contador) */
  conflito: boolean;
  evidencias: Evidencia[];
  /** NCM/CEST da nota para completar o cadastro (só quando o produto não tem) */
  ncmNota: string | null;
  cestNota: string | null;
};

export type AnaliseSt = { notasLidas: number; itensLidos: number; itensComSt: number; itensSemVinculo: { nota: string; fornecedor: string; item: string; motivo: string }[]; produtos: ProdutoSt[] };

const ajustadoSt = (p: { cfopInterno: string | null; csosn: string | null; cstIcms: string | null }) => p.cfopInterno === REGRA_ST.cfopInterno && (p.csosn === REGRA_ST.csosn || p.cstIcms === REGRA_ST.cstIcms);

/**
 * Cruza os XMLs das notas recebidas da loja com o cadastro de produtos. O item da nota se liga ao produto pelo
 * código do fornecedor (aba Fornecedores do produto), pelo código de barras, pela compra lançada desta nota
 * (mesma posição do item) ou pelo nome igual.
 */
export async function analisarSt(empresaId: string): Promise<AnaliseSt> {
  const notas = await prisma.notaRecebida.findMany({
    where: { empresaId, xml: { not: null }, situacao: { not: "CANCELADA" } },
    select: { chave: true, xml: true, compraId: true },
    orderBy: { emissao: "desc" },
  });
  const produtos = await prisma.produto.findMany({
    where: { ativo: true, OR: [{ lojas: { isEmpty: true } }, { lojas: { has: empresaId } }] },
    select: { id: true, codigo: true, nome: true, gtin: true, ncm: true, cest: true, cfopInterno: true, cfopExterno: true, csosn: true, cstIcms: true },
  });
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const porGtin = new Map(produtos.filter((p) => /^\d{8,14}$/.test(p.gtin ?? "")).map((p) => [p.gtin!, p.id]));
  const porNome = new Map<string, string>();
  for (const p of produtos) porNome.set(p.nome.trim().toUpperCase(), p.id);
  const vinculos = await prisma.itemFornecedor.findMany({ where: { produtoId: { not: null }, codigo: { not: null } }, select: { produtoId: true, codigo: true, fornecedor: { select: { documento: true } } } });
  const porCodForn = new Map(vinculos.map((v) => [`${(v.fornecedor.documento ?? "").replace(/\D/g, "")}|${(v.codigo ?? "").trim()}`, v.produtoId!]));
  // compras lançadas destas notas: o item na mesma posição (quando a compra tem o mesmo número de itens)
  const chaves = notas.map((n) => n.chave);
  const compras = await prisma.compra.findMany({
    where: { OR: [{ chaveNfe: { in: chaves } }, { id: { in: notas.map((n) => n.compraId).filter((x): x is string => !!x) } }] },
    select: { id: true, chaveNfe: true, itens: { select: { produtoId: true }, orderBy: { ordem: "asc" } } },
  });
  const compraDaChave = new Map<string, string[]>();
  for (const c of compras) if (c.chaveNfe) compraDaChave.set(c.chaveNfe, c.itens.map((i) => i.produtoId));
  for (const n of notas) {
    const c = n.compraId ? compras.find((x) => x.id === n.compraId) : null;
    if (c && !compraDaChave.has(n.chave)) compraDaChave.set(n.chave, c.itens.map((i) => i.produtoId));
  }

  const ev = new Map<string, { com: Evidencia[]; sem: number; ncm: string; cest: string }>();
  const ncmComSt = new Set<string>();
  const itensSemVinculo: AnaliseSt["itensSemVinculo"] = [];
  let notasLidas = 0, itensLidos = 0, itensComSt = 0;
  for (const n of notas) {
    const nota = lerNotaSt(n.xml!);
    if (!nota) continue;
    notasLidas++;
    const daCompra = compraDaChave.get(nota.chave || n.chave);
    for (const it of nota.itens) {
      itensLidos++;
      if (it.motivoSt) { itensComSt++; if (it.ncm) ncmComSt.add(it.ncm); }
      const pid = porCodForn.get(`${nota.emitenteDocumento}|${it.codigo}`)
        ?? (/^\d{8,14}$/.test(it.gtin) ? porGtin.get(it.gtin) : undefined)
        ?? (daCompra && daCompra.length === nota.itens.length ? daCompra[it.ordem] : undefined)
        ?? porNome.get(it.nome.toUpperCase());
      if (!pid || !porId.has(pid)) {
        if (it.motivoSt) itensSemVinculo.push({ nota: nota.numero, fornecedor: nota.emitenteNome, item: `${it.codigo} ${it.nome}`, motivo: it.motivoSt });
        continue;
      }
      const e = ev.get(pid) ?? { com: [], sem: 0, ncm: "", cest: "" };
      if (it.motivoSt) {
        e.com.push({ nota: nota.numero, fornecedor: nota.emitenteNome, data: nota.emissao, item: `${it.codigo} ${it.nome}`, cst: it.cst, cfop: it.cfop, motivo: it.motivoSt });
        e.ncm ||= it.ncm; e.cest ||= it.cest;
      } else e.sem++;
      ev.set(pid, e);
    }
  }

  const resultado: ProdutoSt[] = [];
  for (const p of produtos) {
    const e = ev.get(p.id);
    const ncm = (p.ncm ?? "").replace(/\D/g, "");
    const fonte: ProdutoSt["fonte"] | null = e?.com.length ? "NOTA"
      : e?.sem ? null // só veio sem ST: não sugere pelo NCM/CEST
      : ncm && ncmComSt.has(ncm) ? "NCM"
      : (p.cest ?? "").replace(/\D/g, "").length === 7 ? "CEST"
      : null;
    if (!fonte) continue;
    resultado.push({
      id: p.id, codigo: p.codigo, nome: p.nome, ncm: p.ncm, cest: p.cest, cfopInterno: p.cfopInterno, cfopExterno: p.cfopExterno, csosn: p.csosn, cstIcms: p.cstIcms,
      fonte, ajustado: ajustadoSt(p), conflito: !!e && e.com.length > 0 && e.sem > 0, evidencias: e?.com ?? [],
      ncmNota: !ncm && e?.ncm ? e.ncm : null, cestNota: !(p.cest ?? "").trim() && e?.cest ? e.cest : null,
    });
  }
  const ordemFonte = { NOTA: 0, NCM: 1, CEST: 2 };
  resultado.sort((a, b) => Number(a.ajustado) - Number(b.ajustado) || ordemFonte[a.fonte] - ordemFonte[b.fonte] || a.nome.localeCompare(b.nome));
  return { notasLidas, itensLidos, itensComSt, itensSemVinculo, produtos: resultado };
}

/**
 * Grava a regra de ST nos produtos escolhidos: CFOP 5405 / 6404, CSOSN 500 e CST 60.
 * Completa NCM/CEST vazios com o que veio na nota, quando informado.
 */
export async function aplicarSt(ids: string[], completar: Record<string, { ncm?: string | null; cest?: string | null }> = {}) {
  if (!ids.length) return 0;
  await prisma.$transaction(ids.map((id) => prisma.produto.update({
    where: { id },
    data: {
      ...REGRA_ST,
      ...(completar[id]?.ncm ? { ncm: completar[id].ncm } : {}),
      ...(completar[id]?.cest ? { cest: completar[id].cest } : {}),
    },
  })));
  return ids.length;
}

/** Desfaz: volta para a regra padrão da empresa (em branco) só os campos que estão com os valores de ST. */
export async function removerSt(ids: string[]) {
  if (!ids.length) return 0;
  const ps = await prisma.produto.findMany({ where: { id: { in: ids } }, select: { id: true, cfopInterno: true, cfopExterno: true, csosn: true, cstIcms: true } });
  await prisma.$transaction(ps.map((p) => prisma.produto.update({
    where: { id: p.id },
    data: {
      ...(p.cfopInterno === REGRA_ST.cfopInterno ? { cfopInterno: null } : {}),
      ...(p.cfopExterno === REGRA_ST.cfopExterno ? { cfopExterno: null } : {}),
      ...(p.csosn === REGRA_ST.csosn ? { csosn: null } : {}),
      ...(p.cstIcms === REGRA_ST.cstIcms ? { cstIcms: null } : {}),
    },
  })));
  return ps.length;
}
