import https from "node:https";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { XMLParser } from "fast-xml-parser";
import { prisma } from "@/lib/db";
import { autoridadesSefaz, certificadoDaEmpresa, opcoesTls, type Certificado } from "./certificado";
import { URL_DANFSE } from "./nfse";
import { APURACOES_NFSE, IMUNIDADES_NFSE, SUSPENSOES_NFSE } from "./configNfse";

/**
 * DANFSe (PDF da NFS-e nacional). Por padrão o MXERP monta o DANFSe no leiaute nacional (v1.0) a partir do XML
 * autorizado, com o logo da empresa emissora (pedido do Luiz, 25/11/2026: como o do Gestão Click). O PDF do
 * portal (ADN) continua disponível: o servidor baixa com o certificado A1 da empresa que emitiu a nota (o link
 * público pede o certificado no navegador); se o ADN estiver fora do ar (503 é comum), cai no nosso.
 */

export type RespostaBinaria = { status: number; tipo: string; corpo: Buffer };
export type TransporteBinario = (url: string, cert: Certificado) => Promise<RespostaBinaria>;

export const transporteBinario: TransporteBinario = (url, cert) =>
  new Promise((resolve, reject) => {
    const req = https.request(url, { method: "GET", ...opcoesTls(cert), ca: autoridadesSefaz(), timeout: 30000, headers: { Accept: "application/pdf" } }, (res) => {
      const partes: Buffer[] = [];
      res.on("data", (c) => partes.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, tipo: String(res.headers["content-type"] ?? ""), corpo: Buffer.concat(partes) }));
    });
    req.on("timeout", () => req.destroy(new Error("tempo esgotado")));
    req.on("error", reject);
    req.end();
  });

const ehPdf = (b: Buffer) => b.subarray(0, 5).toString("latin1") === "%PDF-";

export type Danfse = { pdf: Buffer; oficial: boolean; nome: string; motivo?: string };

/**
 * PDF da NFS-e. Padrão: o nosso DANFSe (leiaute nacional, com o logo da emissora). `oficial`: o PDF do portal
 * nacional, baixado com o certificado da empresa emissora; se o portal falhar, volta o nosso com o motivo.
 */
export async function danfseDaNota(id: string, deps: { oficial?: boolean; cert?: Certificado; transporte?: TransporteBinario } = {}): Promise<Danfse> {
  const n = await prisma.notaFiscal.findUnique({ where: { id } });
  if (!n || n.modelo !== "NFSE") throw new Error("NFS-e não encontrada");
  if (!n.chave || !["AUTORIZADA", "CANCELADA"].includes(n.status)) throw new Error("A NFS-e ainda não foi autorizada");
  const e = n.empresaId ? await prisma.empresa.findUnique({ where: { id: n.empresaId } }) : null;
  const nome = `DANFSe-${n.numeroNfse ?? n.numero}-${n.chave}.pdf`;
  let motivo: string | undefined;
  if (deps.oficial || !n.xml) {
    try {
      if (!e) throw new Error("empresa emissora não encontrada");
      const cert = deps.cert ?? certificadoDaEmpresa(e);
      const r = await (deps.transporte ?? transporteBinario)(`${URL_DANFSE[n.ambiente === "PRODUCAO" ? 1 : 2]}/${n.chave}`, cert);
      if (r.status >= 200 && r.status < 300 && ehPdf(r.corpo)) return { pdf: r.corpo, oficial: true, nome };
      motivo = r.status === 503 || r.status === 502 || r.status === 504 ? `portal da NFS-e Nacional indisponível (HTTP ${r.status})` : `portal da NFS-e Nacional respondeu HTTP ${r.status}`;
    } catch (err) {
      motivo = (err as Error).message;
    }
    if (!n.xml) throw new Error(`Não foi possível baixar o DANFSe: ${motivo}`);
  }
  // município do tomador: o XML só traz o código IBGE; o nome vem do cadastro do cliente, quando bate
  const d = lerNfse(n.xml);
  let munTomador: string | null = null;
  if (d.tomador.cMun && d.tomador.cMun !== d.emitente.cMun && d.tomador.doc) {
    const p = await prisma.pessoa.findFirst({ where: { documento: d.tomador.doc }, select: { cidade: true, uf: true } });
    if (p?.cidade) munTomador = `${p.cidade}${p.uf ? ` / ${p.uf}` : ""}`;
  }
  const pdf = await gerarDanfsePdf(n.xml, {
    logo: e?.logo ? Buffer.from(e.logo) : null, cancelada: n.status === "CANCELADA", munTomador,
    aviso: motivo ? `O PDF do portal nacional não veio (${motivo}). Este DANFSe foi montado pelo MXERP com o XML autorizado.` : null,
  });
  return { pdf, oficial: false, nome, motivo };
}

const doc = (d: string) => d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : d;
const cepFmt = (c: string) => c.replace(/^(\d{5})(\d{3})$/, "$1-$2");
const dinheiro = (v: string) => (v === "" ? "-" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const valor = (v: string) => (v === "" ? "-" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const tz = { timeZone: "America/Sao_Paulo" };
const dataHora = (v: string) => (v ? `${new Date(v).toLocaleDateString("pt-BR", tz)} ${new Date(v).toLocaleTimeString("pt-BR", tz)}` : "-");
const dataSo = (v: string) => (v ? new Date(`${v.slice(0, 10)}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "-");
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const ou = (v: string) => v || "-";
/** 140101 → 14.01.01 */
const fmtTrib = (c: string) => (/^\d{6}$/.test(c) ? c.replace(/^(\d{2})(\d{2})(\d{2})$/, "$1.$2.$3") : c);
/** 120012000 → 1.2001.20.00 */
const fmtNbs = (c: string) => (/^\d{9}$/.test(c) ? c.replace(/^(\d)(\d{4})(\d{2})(\d{2})$/, "$1.$2.$3.$4") : c);
const rotulo = (lista: [number, string][], v: string) => (v === "" ? "-" : lista.find(([k]) => String(k) === v)?.[1] ?? v);

const SIMPLES: [number, string][] = [[1, "Não Optante"], [2, "Optante - Microempreendedor Individual (MEI)"], [3, "Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)"]];
const REG_ESP: [number, string][] = [[0, "Nenhum"], [1, "Ato Cooperado (Cooperativa)"], [2, "Estimativa"], [3, "Microempresa Municipal"], [4, "Notário ou Registrador"], [5, "Profissional Autônomo"], [6, "Sociedade de Profissionais"]];
const TRIB_ISSQN: [number, string][] = [[1, "Operação tributável"], [2, "Imunidade"], [3, "Exportação de serviço"], [4, "Não incidência"]];
const RETENCAO: [number, string][] = [[1, "Não Retido"], [2, "Retido pelo Tomador"], [3, "Retido pelo Intermediário"]];

type No = Record<string, unknown>;
const no = (v: unknown): No => (v && typeof v === "object" ? (v as No) : {});

/** Lê o XML da NFS-e autorizada (NFSe/infNFSe com a DPS dentro). */
export function lerNfse(xml: string) {
  const raiz = no(new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", parseTagValue: false }).parse(xml));
  const inf = no(no(raiz.NFSe).infNFSe);
  const dps = no(no(no(inf.DPS).infDPS));
  const emit = no(inf.emit), end = no(emit.enderNac);
  const prest = no(dps.prest), reg = no(prest.regTrib);
  const toma = no(dps.toma), endT = no(no(toma.end).endNac), endTx = no(toma.end);
  const serv = no(no(dps.serv).cServ), loc = no(no(dps.serv).locPrest);
  const val = no(inf.valores), valDps = no(dps.valores);
  const trib = no(valDps.trib), tribMun = no(trib.tribMun), tribFed = no(trib.tribFed), pisCofins = no(tribFed.piscofins), totTrib = no(trib.totTrib);
  const desc = no(valDps.vDescCondIncond), susp = no(tribMun.exigSusp), bm = no(tribMun.BM);
  return {
    chave: s(inf["@Id"]).replace(/^NFS/, ""), numero: s(inf.nNFSe), emitidaEm: s(inf.dhProc), local: s(inf.xLocEmi), localPrestacao: s(inf.xLocPrestacao),
    localIncidencia: s(inf.xLocIncid), tribNac: s(inf.xTribNac), nbsTexto: s(inf.xNBS), ambGer: s(inf.ambGer), cStat: s(inf.cStat), outrasInf: s(val.xOutInf),
    tpAmb: s(dps.tpAmb), dhEmiDps: s(dps.dhEmi), competencia: s(dps.dCompet), serieDps: s(dps.serie), numeroDps: s(dps.nDPS), tpEmit: s(dps.tpEmit),
    emitente: {
      doc: s(emit.CNPJ || emit.CPF), im: s(emit.IM), nome: s(emit.xNome), fantasia: s(emit.xFant), cMun: s(end.cMun), uf: s(end.UF), cep: s(end.CEP),
      endereco: [s(end.xLgr), s(end.nro), s(end.xCpl), s(end.xBairro)].filter(Boolean).join(", "), fone: s(emit.fone), email: s(emit.email),
      simples: s(reg.opSimpNac), apuracao: s(reg.regApTribSN), regEsp: s(reg.regEspTrib),
    },
    tomador: {
      doc: s(toma.CNPJ || toma.CPF || toma.NIF), im: s(toma.IM), nome: s(toma.xNome), cMun: s(endT.cMun), cep: s(endT.CEP), fone: s(toma.fone), email: s(toma.email),
      endereco: [s(endTx.xLgr), s(endTx.nro), s(endTx.xCpl), s(endTx.xBairro)].filter(Boolean).join(", "),
    },
    servico: { codigo: s(serv.cTribNac), codigoMun: s(serv.cTribMun), nbs: s(serv.cNBS), descricao: s(serv.xDescServ), cLocPrestacao: s(loc.cLocPrestacao) },
    trib: {
      tribISSQN: s(tribMun.tribISSQN), tpImunidade: s(tribMun.tpImunidade), tpSusp: s(susp.tpSusp), nProcesso: s(susp.nProcesso), bm: s(bm.nBM), tpRet: s(tribMun.tpRetISSQN),
      irrf: s(tribFed.vRetIRRF), cp: s(tribFed.vRetCP), csll: s(tribFed.vRetCSLL), pis: s(pisCofins.vPis), cofins: s(pisCofins.vCofins), tpRetPisCofins: s(pisCofins.tpRetPisCofins),
      pTotTribSN: s(totTrib.pTotTribSN), indTotTrib: s(totTrib.indTotTrib),
    },
    valores: {
      servico: s(no(valDps.vServPrest).vServ), descIncond: s(desc.vDescIncond), descCond: s(desc.vDescCond), deducoes: s(val.vCalcDR), calcBm: s(val.vCalcBM),
      base: s(val.vBC), aliquota: s(val.pAliqAplic), iss: s(val.vISSQN), retencoes: s(val.vTotalRet), liquido: s(val.vLiq),
    },
  };
}
export type Nfse = ReturnType<typeof lerNfse>;

type Doc = InstanceType<typeof PDFDocument>;
const M = 18, W = 595.28 - 2 * M, PAG_H = 841.89;
const F = "Helvetica", FB = "Helvetica-Bold";
const CINZA = "#e5e7eb";

/** Caixa com rótulo pequeno em cima e valor em negrito embaixo (como o DANFSe nacional). */
function caixa(pdf: Doc, x: number, y: number, w: number, h: number, rot: string, val: string, o: { titulo?: boolean; tam?: number } = {}) {
  if (o.titulo) pdf.save().rect(x, y, w, h).fill(CINZA).restore();
  pdf.lineWidth(0.4).strokeColor("#6b7280").rect(x, y, w, h).stroke();
  if (o.titulo) { pdf.fillColor("black").font(FB).fontSize(7.2).text(rot, x + 3, y + 3, { width: w - 6 }); return; }
  pdf.fillColor("#374151").font(F).fontSize(5.6).text(rot, x + 3, y + 2, { width: w - 6, lineBreak: false, ellipsis: true });
  pdf.fillColor("black").font(FB).fontSize(o.tam ?? 7.4).text(val || "-", x + 3, y + 9.5, { width: w - 6, height: h - 10, ellipsis: true });
}
/** Linha de 4 colunas; `cols` diz quantas colunas cada célula ocupa. */
function linha(pdf: Doc, y: number, h: number, celulas: { r: string; v?: string; cols?: number; titulo?: boolean }[], larg = W, x0 = M) {
  const c = larg / 4;
  let x = x0;
  for (const k of celulas) {
    const w = c * (k.cols ?? 1);
    caixa(pdf, x, y, w, h, k.r, k.v ?? "", { titulo: k.titulo });
    x += w;
  }
  return y + h;
}
/** Faixa de largura total com texto em negrito (destinatário, intermediário, títulos). */
function faixa(pdf: Doc, y: number, texto: string, cinza = true, tam = 7.2) {
  pdf.font(FB).fontSize(tam);
  const h = Math.max(13, pdf.heightOfString(texto, { width: W - 6 }) + 5);
  if (cinza) pdf.save().rect(M, y, W, h).fill(CINZA).restore();
  pdf.lineWidth(0.4).strokeColor("#6b7280").rect(M, y, W, h).stroke();
  pdf.fillColor("black").font(FB).fontSize(tam).text(texto, M + 3, y + 3, { width: W - 6 });
  return y + h;
}

/** DANFSe no leiaute nacional (v1.0), montado com o XML autorizado, com o logo da empresa emissora. */
export async function gerarDanfsePdf(xml: string, o: { logo?: Buffer | null; cancelada?: boolean; munTomador?: string | null; aviso?: string | null } = {}): Promise<Buffer> {
  const d = lerNfse(xml);
  const pdf = new PDFDocument({ size: "A4", margin: 0, info: { Title: `DANFSe ${d.numero}`, Author: d.emitente.nome } });
  const partes: Buffer[] = [];
  pdf.on("data", (c: Buffer) => partes.push(c));
  const fim = new Promise<Buffer>((ok) => pdf.on("end", () => ok(Buffer.concat(partes))));
  const homolog = d.tpAmb === "2";
  const munEmit = [d.local, d.emitente.uf].filter(Boolean).join(" / ");

  // cabeçalho: logo da emissora | DANFSe | município e ambiente
  let y = M;
  const hCab = 54, w1 = W * 0.36, w2 = W * 0.3, w3 = W - w1 - w2;
  pdf.lineWidth(0.4).strokeColor("#6b7280").rect(M, y, w1, hCab).rect(M + w1, y, w2, hCab).rect(M + w1 + w2, y, w3, hCab).stroke();
  let comLogo = false;
  if (o.logo) {
    try { pdf.image(o.logo, M + 5, y + 4, { fit: [w1 - 10, hCab - 8], align: "center", valign: "center" }); comLogo = true; } catch { /* formato que o pdfkit não lê */ }
  }
  if (!comLogo) pdf.font(FB).fontSize(10).text(d.emitente.fantasia || d.emitente.nome, M + 5, y + hCab / 2 - 7, { width: w1 - 10, align: "center" });
  pdf.font(FB).fontSize(13).text("DANFSe v1.0", M + w1, y + 12, { width: w2, align: "center" });
  pdf.font(F).fontSize(8).text("Documento Auxiliar da NFS-e", M + w1, y + 30, { width: w2, align: "center" });
  const x3 = M + w1 + w2 + 5;
  pdf.font(FB).fontSize(8).text(`Município: ${munEmit || "-"}`, x3, y + 9, { width: w3 - 10 });
  pdf.font(F).fontSize(6.8)
    .text(`Ambiente Gerador: ${d.ambGer === "1" ? "Prefeitura" : "Sefin Nacional NFS-e"}`, x3, y + 22, { width: w3 - 10 })
    .text(`Tipo de Ambiente: ${homolog ? "Homologação (sem valor fiscal)" : "Produção"}`, x3, y + 32, { width: w3 - 10 });
  y += hCab;

  // chave, números e QR Code
  const wQr = W / 4, larg = W - wQr, hl = 19;
  const yQr = y;
  caixa(pdf, M, y, larg, hl, "Chave de Acesso da NFS-e", d.chave, { tam: 8.4 }); y += hl;
  y = linha(pdf, y, hl, [{ r: "Número da NFS-e", v: d.numero }, { r: "Competência da NFS-e", v: dataSo(d.competencia) }, { r: "Data e Hora da Emissão da NFS-e", v: dataHora(d.emitidaEm), cols: 2 }], larg);
  y = linha(pdf, y, hl, [{ r: "Número da DPS", v: d.numeroDps }, { r: "Série da DPS", v: d.serieDps }, { r: "Data e Hora da Emissão da DPS", v: dataHora(d.dhEmiDps), cols: 2 }], larg);
  y = linha(pdf, y, hl, [
    { r: "Emitente da NFS-e", v: d.tpEmit === "2" ? "Tomador" : d.tpEmit === "3" ? "Intermediário" : "Prestador" },
    { r: "Situação da NFS-e", v: o.cancelada ? "NFS-e Cancelada" : "NFS-e Gerada" }, { r: "Finalidade", v: "-", cols: 2 }], larg);
  const hQr = y - yQr;
  pdf.lineWidth(0.4).strokeColor("#6b7280").rect(M + larg, yQr, wQr, hQr).stroke();
  const qr = await QRCode.toBuffer(`https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${d.chave}`, { margin: 0, width: 220 });
  const lado = Math.min(52, hQr - 26);
  pdf.image(qr, M + larg + (wQr - lado) / 2, yQr + 3, { width: lado, height: lado });
  pdf.font(F).fontSize(5.2).fillColor("#374151")
    .text("A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e", M + larg + 4, yQr + lado + 5, { width: wQr - 8, align: "center" })
    .fillColor("black");

  // prestador
  const e = d.emitente;
  y = linha(pdf, y, hl, [{ r: "PRESTADOR / FORNECEDOR", titulo: true }, { r: "CNPJ / CPF / NIF", v: doc(e.doc) }, { r: "Indicador Municipal (Inscrição)", v: ou(e.im) }, { r: "Telefone", v: ou(e.fone) }]);
  y = linha(pdf, y, hl, [{ r: "Nome / Nome Empresarial", v: e.nome, cols: 2 }, { r: "Município / Sigla UF", v: ou(munEmit) }, { r: "Código IBGE / CEP", v: [e.cMun, e.cep && cepFmt(e.cep)].filter(Boolean).join(" / ") || "-" }]);
  y = linha(pdf, y, hl, [{ r: "Endereço", v: ou(e.endereco), cols: 2 }, { r: "E-mail", v: ou(e.email), cols: 2 }]);
  y = linha(pdf, y, hl, [{ r: "Simples Nacional na Data de Competência", v: rotulo(SIMPLES, e.simples), cols: 2 }, { r: "Regime de Apuração Tributária pelo SN", v: e.simples === "3" ? rotulo(APURACOES_NFSE, e.apuracao) : "-", cols: 2 }]);

  // tomador
  const t = d.tomador;
  const munToma = t.cMun && t.cMun === e.cMun ? munEmit : o.munTomador ?? "";
  y = linha(pdf, y, hl, [{ r: "TOMADOR / ADQUIRENTE", titulo: true }, { r: "CNPJ / CPF / NIF", v: t.doc ? doc(t.doc) : "-" }, { r: "Indicador Municipal (Inscrição)", v: ou(t.im) }, { r: "Telefone", v: ou(t.fone) }]);
  y = linha(pdf, y, hl, [{ r: "Nome / Nome Empresarial", v: ou(t.nome), cols: 2 }, { r: "Município / Sigla UF", v: ou(munToma) }, { r: "Código IBGE / CEP", v: [t.cMun, t.cep && cepFmt(t.cep)].filter(Boolean).join(" / ") || "-" }]);
  y = linha(pdf, y, hl, [{ r: "Endereço", v: ou(t.endereco), cols: 2 }, { r: "E-mail", v: ou(t.email), cols: 2 }]);
  y = faixa(pdf, y, "DESTINATÁRIO DA OPERAÇÃO - O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO", false, 6.8);
  y = faixa(pdf, y, "INTERMEDIÁRIO DA OPERAÇÃO - INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-E", false, 6.8);

  // serviço
  y = linha(pdf, y, hl, [{ r: "SERVIÇO PRESTADO", titulo: true }, { r: "Código de Tributação Nacional / Municipal", v: [fmtTrib(d.servico.codigo), d.servico.codigoMun].filter(Boolean).join(" / ") || "-" },
    { r: "Código da NBS", v: ou(fmtNbs(d.servico.nbs)) }, { r: "Local da Prestação", v: ou(d.localPrestacao) }]);
  if (d.tribNac) y = faixa(pdf, y, d.tribNac, false, 6.8);
  // descrição: cresce com o texto (mínimo de 70 pt)
  pdf.font(FB).fontSize(8);
  const hDesc = Math.max(70, pdf.heightOfString(d.servico.descricao || "-", { width: W - 8 }) + 16);
  caixa(pdf, M, y, W, hDesc, "Descrição do Serviço", d.servico.descricao, { tam: 8 });
  y += hDesc;

  // tributação municipal
  const tb = d.trib, v = d.valores;
  y = linha(pdf, y, hl, [{ r: "TRIBUTAÇÃO MUNICIPAL (ISSQN)", titulo: true }, { r: "Tipo de Tributação do ISSQN", v: rotulo(TRIB_ISSQN, tb.tribISSQN) }, { r: "Município de Incidência do ISSQN", v: ou(d.localIncidencia || munEmit), cols: 2 }]);
  y = linha(pdf, y, hl, [{ r: "Regime Especial de Tributação do ISSQN", v: rotulo(REG_ESP, e.regEsp || "0") }, { r: "Tipo de Imunidade do ISSQN", v: tb.tpImunidade ? rotulo(IMUNIDADES_NFSE, tb.tpImunidade) : "-" },
    { r: "Suspensão da Exigibilidade do ISSQN", v: tb.tpSusp ? rotulo(SUSPENSOES_NFSE, tb.tpSusp) : "-" }, { r: "Número Processo Suspensão", v: ou(tb.nProcesso) }]);
  y = linha(pdf, y, hl, [{ r: "Benefício Municipal", v: ou(tb.bm) }, { r: "Cálculo do BM", v: valor(v.calcBm) }, { r: "Total Deduções/Reduções", v: valor(v.deducoes) }, { r: "Desconto Incondicionado", v: valor(v.descIncond) }]);
  y = linha(pdf, y, hl, [{ r: "BC ISSQN", v: valor(v.base) }, { r: "Alíquota Aplicada", v: v.aliquota ? `${valor(v.aliquota)}%` : "-" }, { r: "Retenção do ISSQN", v: rotulo(RETENCAO, tb.tpRet) }, { r: "ISSQN Apurado", v: valor(v.iss) }]);

  // tributação federal
  y = linha(pdf, y, hl, [{ r: "TRIBUTAÇÃO FEDERAL", titulo: true }, { r: "IRRF", v: valor(tb.irrf) }, { r: "Contribuição Previdenciária - Retida", v: valor(tb.cp) }, { r: "CSLL - Retida", v: valor(tb.csll) }]);
  y = linha(pdf, y, hl, [{ r: "PIS - Débito Apuração Própria", v: valor(tb.pis) }, { r: "COFINS - Débito Apuração Própria", v: valor(tb.cofins) },
    { r: "Retenção do PIS/COFINS", v: tb.tpRetPisCofins === "1" ? "PIS/COFINS Retidos" : "PIS/COFINS Não Retidos", cols: 2 }]);

  // totais
  y = linha(pdf, y, hl, [{ r: "VALOR TOTAL DA NFS-E", titulo: true }, { r: "Valor da Operação / Serviço", v: dinheiro(v.servico) }, { r: "Desconto Incondicionado", v: v.descIncond ? dinheiro(v.descIncond) : "-" }, { r: "Desconto Condicionado", v: v.descCond ? dinheiro(v.descCond) : "-" }]);
  y = linha(pdf, y, hl, [{ r: "Total das Retenções (ISSQN / Federais)", v: v.retencoes ? dinheiro(v.retencoes) : "-", cols: 2 }, { r: "Valor Líquido da NFS-e", v: dinheiro(v.liquido || v.servico), cols: 2 }]);

  // informações complementares
  const inf = [
    tb.pTotTribSN ? `Totais aproximados dos tributos cfe. Lei nº 12.741/2012: ${valor(tb.pTotTribSN)}% (alíquota do Simples Nacional).` : "",
    d.outrasInf, o.aviso ?? "",
  ].filter(Boolean).join("\n");
  y = faixa(pdf, y, "INFORMAÇÕES COMPLEMENTARES");
  pdf.font(F).fontSize(7);
  const hInf = Math.max(40, pdf.heightOfString(inf || "-", { width: W - 8 }) + 8);
  pdf.lineWidth(0.4).strokeColor("#6b7280").rect(M, y, W, hInf).stroke();
  pdf.fillColor("black").font(F).fontSize(7).text(inf || "-", M + 4, y + 4, { width: W - 8 });
  y += hInf;

  // cientificação (canhoto)
  if (y + 50 > PAG_H - M) { pdf.addPage({ size: "A4", margin: 0 }); y = M; } else y += 6;
  const hc = 30;
  caixa(pdf, M, y, W * 0.3, hc, "Data Cientificação", " ");
  caixa(pdf, M + W * 0.3, y, W * 0.36, hc, "Identificação e Assinatura", " ");
  caixa(pdf, M + W * 0.66, y, W * 0.34, hc, "Nº NFS-e / Chave NFS-e", `${d.numero}\n${d.chave}`, { tam: 6.4 });
  pdf.font(F).fontSize(6).fillColor("#6b7280").text("DANFSe gerado pelo MXERP a partir do XML autorizado da NFS-e", M, y + hc + 3, { width: W, align: "right" }).fillColor("black");

  // tarjas: cancelada / homologação
  if (o.cancelada || homolog) {
    pdf.save().rotate(-35, { origin: [297, 420] }).font(FB).fontSize(54).fillColor("#dc2626").opacity(0.18)
      .text(o.cancelada ? "CANCELADA" : "SEM VALOR FISCAL", 0, 390, { width: 595, align: "center" }).restore();
  }
  pdf.end();
  return fim;
}
