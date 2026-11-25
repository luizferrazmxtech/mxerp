import https from "node:https";
import PDFDocument from "pdfkit";
import { XMLParser } from "fast-xml-parser";
import { prisma } from "@/lib/db";
import { autoridadesSefaz, certificadoDaEmpresa, opcoesTls, type Certificado } from "./certificado";
import { URL_DANFSE } from "./nfse";

/**
 * DANFSe (PDF da NFS-e nacional). O link público do ADN pede o certificado no navegador do usuário; aqui o
 * servidor baixa o PDF oficial com o certificado A1 da empresa que emitiu a nota (a VFX, no caso dos serviços
 * da OS faturados por ela) e entrega direto. Se o ADN estiver fora do ar (503 é comum), monta uma representação
 * simplificada a partir do XML autorizado, avisando que não é o PDF oficial.
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

/** PDF da NFS-e: o oficial do ADN (com o certificado da empresa emissora) ou, se ele falhar, o gerado do XML. */
export async function danfseDaNota(id: string, deps: { cert?: Certificado; transporte?: TransporteBinario } = {}): Promise<Danfse> {
  const n = await prisma.notaFiscal.findUnique({ where: { id } });
  if (!n || n.modelo !== "NFSE") throw new Error("NFS-e não encontrada");
  if (!n.chave || !["AUTORIZADA", "CANCELADA"].includes(n.status)) throw new Error("A NFS-e ainda não foi autorizada");
  const nome = `DANFSe-${n.numero}-${n.chave}.pdf`;
  let motivo = "";
  try {
    const e = n.empresaId ? await prisma.empresa.findUnique({ where: { id: n.empresaId } }) : null;
    if (!e) throw new Error("empresa emissora não encontrada");
    const cert = deps.cert ?? certificadoDaEmpresa(e);
    const r = await (deps.transporte ?? transporteBinario)(`${URL_DANFSE[n.ambiente === "PRODUCAO" ? 1 : 2]}/${n.chave}`, cert);
    if (r.status >= 200 && r.status < 300 && ehPdf(r.corpo)) return { pdf: r.corpo, oficial: true, nome };
    motivo = r.status === 503 || r.status === 502 || r.status === 504 ? `portal da NFS-e Nacional indisponível (HTTP ${r.status})` : `portal da NFS-e Nacional respondeu HTTP ${r.status}`;
  } catch (e) {
    motivo = (e as Error).message;
  }
  if (!n.xml) throw new Error(`Não foi possível baixar o DANFSe: ${motivo}`);
  const pdf = await gerarDanfseSimplificado(n.xml, { cancelada: n.status === "CANCELADA", homologacao: n.ambiente === "HOMOLOGACAO" });
  return { pdf, oficial: false, nome, motivo };
}

const doc = (d: string) => d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : d;
const brl = (v: unknown) => (v === undefined || v === null || v === "" ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const quando = (s: unknown) => (s ? new Date(String(s)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));

type No = Record<string, unknown>;
const no = (v: unknown): No => (v && typeof v === "object" ? (v as No) : {});

/** Lê o XML da NFS-e autorizada (NFSe/infNFSe com a DPS dentro). */
export function lerNfse(xml: string) {
  const raiz = no(new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", parseTagValue: false }).parse(xml));
  const inf = no(no(raiz.NFSe).infNFSe);
  const dps = no(no(no(inf.DPS).infDPS));
  const emit = no(inf.emit), end = no(emit.enderNac);
  const toma = no(dps.toma), endT = no(no(toma.end).endNac), endTx = no(toma.end);
  const serv = no(no(dps.serv).cServ);
  const val = no(inf.valores), valDps = no(dps.valores);
  const tribMun = no(no(valDps.trib).tribMun);
  return {
    chave: s(inf["@Id"]).replace(/^NFS/, ""), numero: s(inf.nNFSe), emitidaEm: s(inf.dhProc), local: s(inf.xLocEmi), localPrestacao: s(inf.xLocPrestacao),
    tribNac: s(inf.xTribNac), competencia: s(dps.dCompet), serieDps: s(dps.serie), numeroDps: s(dps.nDPS),
    emitente: { doc: s(emit.CNPJ || emit.CPF), im: s(emit.IM), nome: s(emit.xNome), endereco: [s(end.xLgr), s(end.nro), s(end.xBairro)].filter(Boolean).join(", "), uf: s(end.UF), cep: s(end.CEP), fone: s(emit.fone), email: s(emit.email) },
    tomador: { doc: s(toma.CNPJ || toma.CPF), nome: s(toma.xNome), endereco: [s(endTx.xLgr), s(endTx.nro), s(endTx.xBairro)].filter(Boolean).join(", "), cep: s(endT.CEP), email: s(toma.email) },
    servico: { codigo: s(serv.cTribNac), descricao: s(serv.xDescServ) },
    valores: { servico: s(no(valDps.vServPrest).vServ), base: s(val.vBC), aliquota: s(val.pAliqAplic), iss: s(val.vISSQN), retido: s(tribMun.tpRetISSQN) === "2", liquido: s(val.vLiq) },
  };
}

/** Representação simplificada da NFS-e (quando o DANFSe oficial não vem). */
export async function gerarDanfseSimplificado(xml: string, o: { cancelada?: boolean; homologacao?: boolean } = {}): Promise<Buffer> {
  const d = lerNfse(xml);
  const pdf = new PDFDocument({ size: "A4", margin: 36, info: { Title: `NFS-e ${d.numero}`, Author: d.emitente.nome } });
  const partes: Buffer[] = [];
  pdf.on("data", (c: Buffer) => partes.push(c));
  const fim = new Promise<Buffer>((ok) => pdf.on("end", () => ok(Buffer.concat(partes))));
  const W = pdf.page.width - 72;
  const secao = (t: string) => { pdf.moveDown(0.6).font("Helvetica-Bold").fontSize(9).fillColor("#444").text(t.toUpperCase()); pdf.moveTo(36, pdf.y + 1).lineTo(36 + W, pdf.y + 1).lineWidth(0.5).strokeColor("#999").stroke(); pdf.moveDown(0.3).fillColor("black"); };
  const linha = (r: string, v: string) => { if (v) pdf.font("Helvetica-Bold").fontSize(9).text(`${r}: `, { continued: true }).font("Helvetica").text(v); };

  pdf.font("Helvetica-Bold").fontSize(14).text("NFS-e · Nota Fiscal de Serviço eletrônica", { align: "center" });
  pdf.font("Helvetica").fontSize(9).text(`Nº ${d.numero} · emitida em ${quando(d.emitidaEm)}${d.local ? ` · ${d.local}` : ""}`, { align: "center" });
  pdf.fontSize(8).text(`Chave de acesso: ${d.chave}`, { align: "center" });
  pdf.moveDown(0.4).fontSize(7.5).fillColor("#a15c00")
    .text("Representação simplificada gerada pelo MXERP a partir do XML autorizado. O DANFSe oficial e a consulta da nota ficam em nfse.gov.br (consulta pública pela chave de acesso).", { align: "center" })
    .fillColor("black");
  if (o.cancelada || o.homologacao) pdf.moveDown(0.3).font("Helvetica-Bold").fontSize(11).fillColor("#b91c1c").text(o.cancelada ? "NFS-e CANCELADA" : "HOMOLOGAÇÃO · SEM VALOR FISCAL", { align: "center" }).fillColor("black");

  secao("Prestador");
  linha("Nome", d.emitente.nome); linha("CNPJ/CPF", doc(d.emitente.doc)); linha("Inscrição municipal", d.emitente.im);
  linha("Endereço", [d.emitente.endereco, d.emitente.uf, d.emitente.cep && `CEP ${d.emitente.cep}`].filter(Boolean).join(" · "));
  linha("Contato", [d.emitente.fone, d.emitente.email].filter(Boolean).join(" · "));
  secao("Tomador");
  linha("Nome", d.tomador.nome); linha("CNPJ/CPF", doc(d.tomador.doc));
  linha("Endereço", [d.tomador.endereco, d.tomador.cep && `CEP ${d.tomador.cep}`].filter(Boolean).join(" · ")); linha("E-mail", d.tomador.email);
  secao("Serviço");
  linha("Código de tributação nacional", [d.servico.codigo, d.tribNac].filter(Boolean).join(" - "));
  linha("Local da prestação", d.localPrestacao); linha("Competência", d.competencia ? new Date(`${d.competencia}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "");
  linha("DPS", d.numeroDps ? `série ${d.serieDps} nº ${d.numeroDps}` : "");
  pdf.moveDown(0.3).font("Helvetica").fontSize(9).text(d.servico.descricao, { width: W });
  secao("Valores");
  linha("Valor do serviço", brl(d.valores.servico));
  if (d.valores.base) linha("Base de cálculo do ISS", brl(d.valores.base));
  if (d.valores.aliquota) linha("Alíquota do ISS", `${Number(d.valores.aliquota).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%`);
  if (d.valores.iss) linha("ISS", `${brl(d.valores.iss)}${d.valores.retido ? " (retido pelo tomador)" : ""}`);
  linha("Valor líquido", brl(d.valores.liquido || d.valores.servico));
  pdf.end();
  return fim;
}
