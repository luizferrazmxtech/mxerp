import { createHash } from "node:crypto";
import { dataHoraTz, dec, g, so, t } from "./xml";
import { gerarChave } from "./chave";

/**
 * Montagem do XML da NF-e (modelo 55) e NFC-e (modelo 65), layout 4.00
 * (pacote de schemas PL_010, já com os campos opcionais da reforma tributária).
 */

export const NS_NFE = "http://www.portalfiscal.inf.br/nfe";
export const VERSAO = "4.00";
export const VER_PROC = "MXERP 1.0";

export type Endereco = {
  logradouro: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  codigoMunicipio: string; // IBGE 7 dígitos
  municipio: string;
  uf: string;
  cep: string;
  telefone?: string | null;
};

export type Emitente = {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string | null;
  ie: string;
  im?: string | null;
  cnae?: string | null;
  crt: 1 | 2 | 3 | 4; // 1 Simples, 2 Simples excesso, 3 Normal, 4 MEI
  endereco: Endereco;
};

export type Destinatario = {
  documento: string; // CPF ou CNPJ
  nome: string;
  ie?: string | null;
  indIEDest: 1 | 2 | 9; // 1 contribuinte, 2 isento, 9 não contribuinte
  email?: string | null;
  endereco?: Endereco | null;
};

export type ItemNota = {
  codigo: string;
  gtin?: string | null;
  descricao: string;
  ncm: string;
  cest?: string | null;
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnit: number;
  desconto?: number;
  origem: number; // 0 nacional...
  /** Simples: CSOSN (102, 103, 300, 400, 500). Normal: CST (00, 40, 41, 60). */
  csosn?: string | null;
  cstIcms?: string | null;
  aliquotaIcms?: number | null;
  cstPis?: string | null; // padrão 99 (Simples) / 01...
  cstCofins?: string | null;
  aliquotaPis?: number | null; // regime normal (padrão 0,65% - cumulativo)
  aliquotaCofins?: number | null; // regime normal (padrão 3% - cumulativo)
  vTotTrib?: number; // Lei da transparência (IBPT)
  /** ICMS-ST retido anteriormente (CSOSN 500 / CST 60), já para a quantidade do item. Sem isso a SEFAZ rejeita (938). */
  stRetido?: StRetidoItem | null;
};

/** Valores do ST retido na entrada (vêm da nota de compra), proporcionais à quantidade vendida. */
export type StRetidoItem = { vBCSTRet: number; pST: number; vICMSSubstituto: number; vICMSSTRet: number; vBCFCPSTRet?: number; pFCPSTRet?: number; vFCPSTRet?: number };

/** Grupo do ST retido (ICMSSN500 e ICMS60): sempre informado; sem dado da compra vai zerado. */
function stRetidoTags(r: StRetidoItem | null | undefined) {
  const v = r ?? { vBCSTRet: 0, pST: 0, vICMSSubstituto: 0, vICMSSTRet: 0 };
  return [
    t("vBCSTRet", dec(v.vBCSTRet)), t("pST", dec(v.pST, 4)), t("vICMSSubstituto", dec(v.vICMSSubstituto)), t("vICMSSTRet", dec(v.vICMSSTRet)),
    ...(v.vFCPSTRet ? [t("vBCFCPSTRet", dec(v.vBCFCPSTRet ?? 0)), t("pFCPSTRet", dec(v.pFCPSTRet ?? 0, 4)), t("vFCPSTRet", dec(v.vFCPSTRet))] : []),
  ];
}

export type PagamentoNota = {
  tPag: string; // 01 dinheiro, 03 crédito, 04 débito, 15 boleto, 17 PIX, 99 outros
  valor: number;
  descricao?: string; // obrigatório quando tPag = 99
};

export type DadosNota = {
  modelo: 55 | 65;
  serie: number;
  numero: number;
  cNF: number;
  emissao: Date;
  tpAmb: 1 | 2; // 1 produção, 2 homologação
  naturezaOperacao: string;
  tpNF?: 0 | 1; // 0 entrada, 1 saída
  finalidade?: 1 | 2 | 3 | 4; // 1 normal, 4 devolução
  consumidorFinal: boolean;
  presenca: 1 | 2 | 3 | 4 | 9; // 1 presencial
  emitente: Emitente;
  destinatario?: Destinatario | null;
  itens: ItemNota[];
  pagamentos: PagamentoNota[];
  troco?: number;
  frete?: number;
  modFrete?: 0 | 1 | 2 | 9;
  infCpl?: string;
};

const UF_IBGE: Record<string, string> = {
  RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17", MA: "21", PI: "22", CE: "23", RN: "24",
  PB: "25", PE: "26", AL: "27", SE: "28", BA: "29", MG: "31", ES: "32", RJ: "33", SP: "35", PR: "41", SC: "42",
  RS: "43", MS: "50", MT: "51", GO: "52", DF: "53",
};
export const codigoUf = (uf: string) => {
  const c = UF_IBGE[uf.toUpperCase()];
  if (!c) throw new Error(`UF inválida: ${uf}`);
  return c;
};

const HOMOLOG_NOME = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

function endereco(tag: string, e: Endereco) {
  return g(tag, [
    t("xLgr", e.logradouro),
    t("nro", e.numero || "SN"),
    t("xCpl", e.complemento),
    t("xBairro", e.bairro),
    t("cMun", e.codigoMunicipio),
    t("xMun", e.municipio),
    t("UF", e.uf),
    t("CEP", so(e.cep)),
    t("cPais", "1058"),
    t("xPais", "BRASIL"),
    t("fone", so(e.telefone) || undefined),
  ]);
}

function docTag(doc: string) {
  const d = so(doc);
  return d.length === 11 ? t("CPF", d) : t("CNPJ", d);
}

function icms(item: ItemNota, crt: number) {
  const orig = item.origem ?? 0;
  if (crt === 1 || crt === 2 || crt === 4) {
    const csosn = item.csosn ?? "102";
    if (["102", "103", "300", "400"].includes(csosn)) return g("ICMS", g("ICMSSN102", [t("orig", orig), t("CSOSN", csosn)]));
    if (csosn === "500") return g("ICMS", g("ICMSSN500", [t("orig", orig), t("CSOSN", csosn), ...stRetidoTags(item.stRetido)]));
    throw new Error(`CSOSN ${csosn} ainda não suportado (item ${item.codigo})`);
  }
  const cst = item.cstIcms ?? "00";
  const vProd = item.quantidade * item.valorUnit - (item.desconto ?? 0);
  if (cst === "00") {
    const p = item.aliquotaIcms ?? 0;
    return g("ICMS", g("ICMS00", [t("orig", orig), t("CST", "00"), t("modBC", 3), t("vBC", dec(vProd)), t("pICMS", dec(p, 4)), t("vICMS", dec((vProd * p) / 100))]));
  }
  if (["40", "41", "50"].includes(cst)) return g("ICMS", g("ICMS40", [t("orig", orig), t("CST", cst)]));
  if (cst === "60") return g("ICMS", g("ICMS60", [t("orig", orig), t("CST", "60"), ...stRetidoTags(item.stRetido)]));
  throw new Error(`CST ICMS ${cst} ainda não suportado (item ${item.codigo})`);
}

function pisCofins(tag: "PIS" | "COFINS", cst: string, base: number, aliquota: number) {
  const p = tag === "PIS" ? "pPIS" : "pCOFINS";
  const v = tag === "PIS" ? "vPIS" : "vCOFINS";
  if (["01", "02"].includes(cst)) {
    const valor = Math.round(base * aliquota) / 100;
    return { xml: g(tag, g(`${tag}Aliq`, [t("CST", cst), t("vBC", dec(base)), t(p, dec(aliquota, 4)), t(v, dec(valor))])), valor };
  }
  if (["04", "05", "06", "07", "08", "09"].includes(cst)) return { xml: g(tag, g(`${tag}NT`, t("CST", cst))), valor: 0 };
  // Simples Nacional: PIS/COFINS recolhidos no DAS → CST 99 (ou 49) com valores zerados
  return { xml: g(tag, g(`${tag}Outr`, [t("CST", cst), t("vBC", "0.00"), t(p, "0.0000"), t(v, "0.00")])), valor: 0 };
}

export type NotaMontada = { chave: string; xml: string; totais: { vProd: number; vDesc: number; vNF: number; vTotTrib: number } };

/** Monta o <NFe> sem assinatura. */
export function montarNfe(d: DadosNota): NotaMontada {
  if (!d.itens.length) throw new Error("Nota sem itens");
  const uf = d.emitente.endereco.uf;
  const cUF = codigoUf(uf);
  const { chave, cDV, cNF } = gerarChave({
    cUF, emissao: d.emissao, cnpj: d.emitente.cnpj, modelo: d.modelo, serie: d.serie, numero: d.numero, cNF: d.cNF,
  });
  const nfce = d.modelo === 65;
  const homolog = d.tpAmb === 2;
  const dest = d.destinatario;
  const idDest = !dest?.endereco || dest.endereco.uf === uf ? 1 : 2;

  let vProd = 0, vDesc = 0, vTotTrib = 0, vPIS = 0, vCOFINS = 0;
  const dets = d.itens.map((it, i) => {
    const bruto = Math.round(it.quantidade * it.valorUnit * 100) / 100;
    const desc = it.desconto ?? 0;
    vProd += bruto; vDesc += desc; vTotTrib += it.vTotTrib ?? 0;
    const gtin = it.gtin && /^\d{8}$|^\d{12,14}$/.test(it.gtin) ? it.gtin : "SEM GTIN";
    // em homologação a SEFAZ exige este texto na descrição do 1º item da NFC-e
    const xProd = homolog && nfce && i === 0 ? "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL" : it.descricao;
    const crt = d.emitente.crt;
    const cstPadrao = crt === 3 ? "01" : "99";
    const baseItem = Math.round((bruto - desc) * 100) / 100;
    const pis = pisCofins("PIS", it.cstPis ?? cstPadrao, baseItem, it.aliquotaPis ?? 0.65);
    const cofins = pisCofins("COFINS", it.cstCofins ?? cstPadrao, baseItem, it.aliquotaCofins ?? 3);
    vPIS += pis.valor; vCOFINS += cofins.valor;
    return g("det", [
      g("prod", [
        t("cProd", it.codigo),
        t("cEAN", gtin),
        t("xProd", xProd.slice(0, 120)),
        t("NCM", so(it.ncm)),
        t("CEST", so(it.cest) || undefined),
        t("CFOP", it.cfop),
        t("uCom", it.unidade.slice(0, 6)),
        t("qCom", dec(it.quantidade, 4)),
        t("vUnCom", dec(it.valorUnit, 10)),
        t("vProd", dec(bruto)),
        t("cEANTrib", gtin),
        t("uTrib", it.unidade.slice(0, 6)),
        t("qTrib", dec(it.quantidade, 4)),
        t("vUnTrib", dec(it.valorUnit, 10)),
        desc > 0 && t("vDesc", dec(desc)),
        t("indTot", 1),
      ]),
      g("imposto", [
        it.vTotTrib ? t("vTotTrib", dec(it.vTotTrib)) : "",
        icms(it, crt),
        pis.xml,
        cofins.xml,
      ]),
    ], { nItem: i + 1 });
  });

  // ICMS próprio só no regime normal
  const vBC = d.emitente.crt === 3 ? d.itens.filter((i) => (i.cstIcms ?? "00") === "00").reduce((s, i) => s + i.quantidade * i.valorUnit - (i.desconto ?? 0), 0) : 0;
  const vICMS = d.emitente.crt === 3 ? d.itens.filter((i) => (i.cstIcms ?? "00") === "00").reduce((s, i) => s + Math.round((i.quantidade * i.valorUnit - (i.desconto ?? 0)) * (i.aliquotaIcms ?? 0)) / 100, 0) : 0;
  const frete = d.frete ?? 0;
  const vNF = Math.round((vProd - vDesc + frete) * 100) / 100;
  const somaPag = d.pagamentos.reduce((s, p) => s + p.valor, 0);
  if (Math.abs(somaPag - (d.troco ?? 0) - vNF) > 0.005) throw new Error(`Pagamentos (${somaPag.toFixed(2)}) não fecham com a nota (${vNF.toFixed(2)})`);

  const infNFe = g("infNFe", [
    g("ide", [
      t("cUF", cUF), t("cNF", cNF), t("natOp", d.naturezaOperacao.slice(0, 60)), t("mod", d.modelo), t("serie", d.serie),
      t("nNF", d.numero), t("dhEmi", dataHoraTz(d.emissao)),
      !nfce && t("dhSaiEnt", dataHoraTz(d.emissao)),
      t("tpNF", d.tpNF ?? 1), t("idDest", idDest), t("cMunFG", d.emitente.endereco.codigoMunicipio),
      t("tpImp", nfce ? 4 : 1), t("tpEmis", 1), t("cDV", cDV), t("tpAmb", d.tpAmb), t("finNFe", d.finalidade ?? 1),
      t("indFinal", d.consumidorFinal ? 1 : 0), t("indPres", d.presenca),
      // indIntermed: 0 = sem intermediador (venda própria). Obrigatório quando indPres 2,3,4,9
      [2, 3, 4, 9].includes(d.presenca) && t("indIntermed", 0),
      t("procEmi", 0), t("verProc", VER_PROC),
    ]),
    g("emit", [
      t("CNPJ", so(d.emitente.cnpj)), t("xNome", d.emitente.razaoSocial.slice(0, 60)), t("xFant", d.emitente.nomeFantasia),
      endereco("enderEmit", d.emitente.endereco),
      t("IE", so(d.emitente.ie)),
      d.emitente.im && t("IM", d.emitente.im), d.emitente.im && t("CNAE", so(d.emitente.cnae) || undefined),
      t("CRT", d.emitente.crt),
    ]),
    dest && g("dest", [
      docTag(dest.documento),
      t("xNome", homolog ? HOMOLOG_NOME : dest.nome.slice(0, 60)),
      dest.endereco && endereco("enderDest", dest.endereco),
      t("indIEDest", nfce ? 9 : dest.indIEDest),
      dest.indIEDest === 1 && !nfce && t("IE", so(dest.ie)),
      t("email", dest.email),
    ]),
    ...dets,
    g("total", g("ICMSTot", [
      t("vBC", dec(vBC)), t("vICMS", dec(vICMS)), t("vICMSDeson", "0.00"), t("vFCP", "0.00"), t("vBCST", "0.00"), t("vST", "0.00"),
      t("vFCPST", "0.00"), t("vFCPSTRet", "0.00"), t("vProd", dec(vProd)), t("vFrete", dec(frete)), t("vSeg", "0.00"),
      t("vDesc", dec(vDesc)), t("vII", "0.00"), t("vIPI", "0.00"), t("vIPIDevol", "0.00"), t("vPIS", dec(vPIS)), t("vCOFINS", dec(vCOFINS)),
      t("vOutro", "0.00"), t("vNF", dec(vNF)), vTotTrib > 0 && t("vTotTrib", dec(vTotTrib)),
    ])),
    g("transp", t("modFrete", d.modFrete ?? 9)),
    g("pag", [
      ...d.pagamentos.map((p) => g("detPag", [
        t("tPag", p.tPag),
        p.tPag === "99" && t("xPag", p.descricao ?? "Outros"),
        t("vPag", dec(p.valor)),
        // cartão: integração "não integrado" (POS próprio)
        ["03", "04", "17"].includes(p.tPag) && g("card", t("tpIntegra", 2)),
      ])),
      (d.troco ?? 0) > 0 && t("vTroco", dec(d.troco!)),
    ]),
    (d.infCpl || vTotTrib > 0) && g("infAdic", t("infCpl", [d.infCpl, vTotTrib > 0 ? `Val Aprox Tributos R$ ${dec(vTotTrib)} Fonte: IBPT` : ""].filter(Boolean).join(" | ").slice(0, 5000))),
  ], { versao: VERSAO, Id: `NFe${chave}` });

  return { chave, xml: `<NFe xmlns="${NS_NFE}">${infNFe}</NFe>`, totais: { vProd, vDesc, vNF, vTotTrib } };
}

/** URLs da NFC-e em SP (QR Code e consulta pela chave). */
export const URLS_NFCE_SP = {
  1: { qrCode: "https://www.nfce.fazenda.sp.gov.br/qrcode", consulta: "https://www.nfce.fazenda.sp.gov.br/consulta" },
  2: { qrCode: "https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode", consulta: "https://www.homologacao.nfce.fazenda.sp.gov.br/consulta" },
} as const;

/**
 * QR Code da NFC-e versão 2 (emissão normal, online):
 *   URL?p=chave|2|tpAmb|cIdToken|hash, hash = SHA1(chave|2|tpAmb|cIdToken + CSC).
 */
export function qrCodeNfce(chave: string, tpAmb: 1 | 2, cscId: string, csc: string) {
  const idToken = String(Number(cscId)); // sem zeros à esquerda
  const base = `${chave}|2|${tpAmb}|${idToken}`;
  const hash = createHash("sha1").update(base + csc).digest("hex").toUpperCase();
  return `${URLS_NFCE_SP[tpAmb].qrCode}?p=${base}|${hash}`;
}

/** Insere o <infNFeSupl> (obrigatório na NFC-e) logo após o </infNFe>. */
export function incluirInfNFeSupl(xmlNfe: string, qrCode: string, tpAmb: 1 | 2) {
  const supl = `<infNFeSupl><qrCode><![CDATA[${qrCode}]]></qrCode><urlChave>${URLS_NFCE_SP[tpAmb].consulta}</urlChave></infNFeSupl>`;
  return xmlNfe.replace("</infNFe>", `</infNFe>${supl}`);
}
