import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { proximoNumero } from "@/lib/sequencia";
import type { Certificado } from "./certificado";
import { certificadoDaEmpresa } from "./certificado";
import { assinarXml } from "./assinatura";
import { NS_NFE, codigoUf } from "./nfe";
import { achar, envelopeSoap, recortar, textoSefaz, transporteHttps, type Transporte } from "./sefaz";
import { dataHoraTz, g, t } from "./xml";
import { empresa, FiscalError } from "./emissao";

/**
 * Notas de compra emitidas contra o nosso CNPJ: distribuição DF-e do Ambiente Nacional (NFeDistribuicaoDFe)
 * e manifestação do destinatário (eventos 2102xx, também no Ambiente Nacional, cOrgao 91).
 * A SEFAZ entrega primeiro o resumo (resNFe); o XML completo (procNFe) vem depois da "ciência da operação".
 */
type Ambiente = 1 | 2;

const URL_DIST: Record<Ambiente, string> = {
  1: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
  2: "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
};
const URL_EVENTO_AN: Record<Ambiente, string> = {
  1: "https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
  2: "https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
};
const NS_DIST = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe";
const NS_EVENTO = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4";

export const MANIFESTACOES = {
  CIENCIA: { tpEvento: "210210", desc: "Ciencia da Operacao", rotulo: "Ciência da operação" },
  CONFIRMADA: { tpEvento: "210200", desc: "Confirmacao da Operacao", rotulo: "Confirmação da operação" },
  DESCONHECIDA: { tpEvento: "210220", desc: "Desconhecimento da Operacao", rotulo: "Desconhecimento da operação" },
  NAO_REALIZADA: { tpEvento: "210240", desc: "Operacao nao Realizada", rotulo: "Operação não realizada" },
} as const;
export type TipoManifestacao = keyof typeof MANIFESTACOES;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", removeNSPrefix: true, parseTagValue: false });
const nsu15 = (n: string | number) => String(n).replace(/\D/g, "").padStart(15, "0");

export function montarDistribuicao(p: { tpAmb: Ambiente; uf: string; cnpj: string; ultNSU?: string; chave?: string }) {
  const filhos = [t("tpAmb", p.tpAmb), t("cUFAutor", codigoUf(p.uf)), t("CNPJ", p.cnpj.replace(/\D/g, ""))];
  filhos.push(p.chave ? g("consChNFe", [t("chNFe", p.chave)]) : g("distNSU", [t("ultNSU", nsu15(p.ultNSU ?? "0"))]));
  return g("distDFeInt", filhos, { xmlns: NS_NFE, versao: "1.01" });
}

export function montarManifestacao(p: { chave: string; tipo: TipoManifestacao; cnpj: string; tpAmb: Ambiente; justificativa?: string; data?: Date }) {
  const m = MANIFESTACOES[p.tipo];
  const just = p.justificativa ? textoSefaz(p.justificativa) : "";
  if (p.tipo === "NAO_REALIZADA" && just.length < 15) throw new FiscalError("Explique em pelo menos 15 caracteres por que a operação não foi realizada");
  const infEvento = g("infEvento", [
    t("cOrgao", 91), t("tpAmb", p.tpAmb), t("CNPJ", p.cnpj.replace(/\D/g, "")), t("chNFe", p.chave), t("dhEvento", dataHoraTz(p.data)),
    t("tpEvento", m.tpEvento), t("nSeqEvento", 1), t("verEvento", "1.00"),
    g("detEvento", [t("descEvento", m.desc), p.tipo === "NAO_REALIZADA" ? t("xJust", just.slice(0, 255)) : null], { versao: "1.00" }),
  ], { Id: `ID${m.tpEvento}${p.chave}01` });
  return `<evento xmlns="${NS_NFE}" versao="1.00">${infEvento}</evento>`;
}

export type DocDfe = { nsu: string; schema: string; xml: string };

export class ClienteDfe {
  constructor(private cert: Certificado, private uf: string, private amb: Ambiente, private transporte: Transporte = transporteHttps) {}

  /** Uma chamada da distribuição: por último NSU (lote de até 50 documentos) ou por chave. */
  async distribuir(p: { cnpj: string; ultNSU?: string; chave?: string }) {
    const dados = montarDistribuicao({ ...p, tpAmb: this.amb, uf: this.uf });
    const env =
      `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
      `<soap12:Body><nfeDistDFeInteresse xmlns="${NS_DIST}"><nfeDadosMsg>${dados}</nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>`;
    const bruto = await this.transporte(URL_DIST[this.amb], `${NS_DIST}/nfeDistDFeInteresse`, env, this.cert);
    const ret = achar(parser.parse(bruto), "retDistDFeInt");
    const lote = achar(ret, "loteDistDFeInt");
    const zips = lote ? [lote.docZip].flat().filter(Boolean) as Record<string, string>[] : [];
    const docs: DocDfe[] = zips.map((z) => ({
      nsu: String(z["@NSU"] ?? ""),
      schema: String(z["@schema"] ?? ""),
      xml: gunzipSync(Buffer.from(String(z["#text"] ?? z), "base64")).toString("utf8"),
    }));
    return { cStat: String(ret?.cStat ?? ""), xMotivo: String(ret?.xMotivo ?? ""), ultNSU: String(ret?.ultNSU ?? ""), maxNSU: String(ret?.maxNSU ?? ""), docs };
  }

  async manifestar(p: { chave: string; tipo: TipoManifestacao; cnpj: string; justificativa?: string; idLote: number; data?: Date }) {
    const xml = montarManifestacao({ ...p, tpAmb: this.amb });
    const assinado = assinarXml(xml, this.cert, { tag: "infEvento", pai: "evento" });
    const corpo = `<envEvento xmlns="${NS_NFE}" versao="1.00"><idLote>${p.idLote}</idLote>${assinado}</envEvento>`;
    const bruto = await this.transporte(URL_EVENTO_AN[this.amb], `${NS_EVENTO}/nfeRecepcaoEvento`, envelopeSoap("RecepcaoEvento", corpo), this.cert);
    const obj = parser.parse(bruto);
    const inf = achar(achar(obj, "retEvento"), "infEvento");
    const cStat = String(inf?.cStat ?? achar(obj, "retEnvEvento")?.cStat ?? "");
    return {
      // 135 registrado; 136 registrado sem vínculo; 573 duplicidade (já manifestada antes) também vale
      ok: ["135", "136", "573"].includes(cStat),
      cStat,
      xMotivo: String(inf?.xMotivo ?? achar(obj, "retEnvEvento")?.xMotivo ?? ""),
      protocolo: (inf?.nProt as string) ?? null,
      xml: assinado + (recortar(bruto, "retEvento") ?? ""),
    };
  }
}

export type EstadoDfe = { ultNSU: string; maxNSU?: string; proximaConsulta?: string; ultimaConsulta?: string; ultimoRetorno?: string };

/** Estado da distribuição (último NSU) de cada CNPJ. O antigo "dfe" (de antes do multiempresa) vale para a primeira empresa. */
export async function estadoDfe(empresaId?: string): Promise<EstadoDfe> {
  const primeira = await prisma.empresa.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  const id = empresaId ?? primeira?.id;
  let c = id ? await prisma.configuracao.findUnique({ where: { chave: `dfe-${id}` } }) : null;
  if (!c && (!id || id === primeira?.id)) c = await prisma.configuracao.findUnique({ where: { chave: "dfe" } });
  return { ultNSU: "0", ...((c?.valor as EstadoDfe | null) ?? {}) };
}
async function salvarEstado(empresaId: string, e: EstadoDfe) {
  const chave = `dfe-${empresaId}`;
  await prisma.configuracao.upsert({ where: { chave }, create: { chave, valor: e }, update: { valor: e } });
}

const num = (v: unknown) => Number(String(v ?? "0")) || 0;
const situacaoDe = (cSit: unknown) => (String(cSit) === "2" ? "DENEGADA" : String(cSit) === "3" ? "CANCELADA" : "AUTORIZADA");

/** Grava um documento da distribuição (resumo, nota completa ou evento) na tabela de notas recebidas. */
export async function guardarDocumento(d: DocDfe, empresaId?: string | null) {
  const obj = parser.parse(d.xml);
  if (d.schema.startsWith("resNFe")) {
    const r = achar(obj, "resNFe")!;
    const chave = String(r.chNFe);
    const dados = {
      nsu: d.nsu, emitenteDocumento: String(r.CNPJ ?? r.CPF ?? ""), emitenteNome: String(r.xNome ?? ""), emitenteIe: r.IE ? String(r.IE) : null,
      emissao: new Date(String(r.dhEmi)), valor: new Prisma.Decimal(num(r.vNF).toFixed(2)), tipoNf: num(r.tpNF), situacao: situacaoDe(r.cSitNFe),
      protocolo: r.nProt ? String(r.nProt) : null,
    };
    await prisma.notaRecebida.upsert({ where: { chave }, create: { chave, ...dados, ...(empresaId ? { empresaId } : {}) }, update: { situacao: dados.situacao } });
    return chave;
  }
  if (d.schema.startsWith("procNFe")) {
    const inf = achar(obj, "infNFe")!;
    const prot = achar(obj, "infProt");
    const chave = String(inf["@Id"] ?? "").replace(/^NFe/, "") || String(prot?.chNFe ?? "");
    const emit = achar(inf, "emit") ?? {};
    const tot = achar(inf, "ICMSTot") ?? {};
    const ide = achar(inf, "ide") ?? {};
    const dados = {
      nsu: d.nsu, emitenteDocumento: String(emit.CNPJ ?? emit.CPF ?? ""), emitenteNome: String(emit.xNome ?? ""), emitenteIe: emit.IE ? String(emit.IE) : null,
      emissao: new Date(String(ide.dhEmi)), valor: new Prisma.Decimal(num(tot.vNF).toFixed(2)), tipoNf: num(ide.tpNF),
      protocolo: prot?.nProt ? String(prot.nProt) : null, xml: d.xml,
    };
    await prisma.notaRecebida.upsert({ where: { chave }, create: { chave, ...dados, ...(empresaId ? { empresaId } : {}) }, update: { xml: d.xml, protocolo: dados.protocolo } });
    return chave;
  }
  if (d.schema.startsWith("resEvento") || d.schema.startsWith("procEventoNFe")) {
    const ev = achar(obj, "resEvento") ?? achar(obj, "infEvento") ?? {};
    // cancelamento da nota pelo fornecedor: marca a nota recebida como cancelada
    if (String(ev.tpEvento) === "110111" && ev.chNFe) await prisma.notaRecebida.updateMany({ where: { chave: String(ev.chNFe) }, data: { situacao: "CANCELADA" } });
    return ev.chNFe ? String(ev.chNFe) : null;
  }
  return null;
}

type Deps = { cert?: Certificado; transporte?: Transporte; agora?: Date };

/**
 * Busca na SEFAZ os documentos novos desde o último NSU (até 20 lotes por vez). A SEFAZ bloqueia quem consulta
 * de novo antes de 1 hora quando não há nada novo (cStat 137/656): o próximo horário fica guardado e respeitado.
 */
export async function sincronizarDfe(deps: Deps & { forcar?: boolean; empresaId?: string | null } = {}) {
  const e = await empresa(deps.empresaId);
  const amb: Ambiente = e.ambienteFiscal === "PRODUCAO" ? 1 : 2;
  const agora = deps.agora ?? new Date();
  const est = await estadoDfe(e.id);
  if (!deps.forcar && est.proximaConsulta && new Date(est.proximaConsulta) > agora)
    return { novos: 0, aguardar: est.proximaConsulta, mensagem: `A SEFAZ só aceita nova consulta depois de ${new Date(est.proximaConsulta).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}` };
  const cli = new ClienteDfe(deps.cert ?? certificadoDaEmpresa(e), e.uf!, amb, deps.transporte);
  let ult = est.ultNSU, novos = 0, ultimo = "";
  for (let i = 0; i < 20; i++) {
    const r = await cli.distribuir({ cnpj: e.cnpj, ultNSU: ult });
    ultimo = `${r.cStat} - ${r.xMotivo}`;
    if (r.cStat === "656" || r.cStat === "137") {
      // 137 nenhum documento novo, 656 consumo indevido: esperar 1 hora
      if (r.ultNSU) ult = r.ultNSU;
      await salvarEstado(e.id, { ultNSU: ult, maxNSU: r.maxNSU || est.maxNSU, ultimaConsulta: agora.toISOString(), proximaConsulta: new Date(agora.getTime() + 3600_000).toISOString(), ultimoRetorno: ultimo });
      return { novos, mensagem: novos ? `${novos} documento(s) novo(s)` : r.cStat === "656" ? `SEFAZ pediu para aguardar 1 hora (${r.xMotivo})` : "Nenhuma nota nova na SEFAZ" };
    }
    if (r.cStat !== "138") throw new FiscalError(`SEFAZ respondeu ${ultimo}`);
    for (const d of r.docs) if (await guardarDocumento(d, e.id)) novos++;
    ult = r.ultNSU;
    await salvarEstado(e.id, { ultNSU: ult, maxNSU: r.maxNSU, ultimaConsulta: agora.toISOString(), ultimoRetorno: ultimo });
    if (!r.maxNSU || nsu15(r.ultNSU) >= nsu15(r.maxNSU)) break;
  }
  return { novos, mensagem: `${novos} documento(s) novo(s)` };
}

/** Pede de novo uma nota pela chave (o XML completo só vem depois da ciência da operação). */
export async function baixarXmlCompleto(id: string, deps: Deps = {}) {
  const n = await prisma.notaRecebida.findUniqueOrThrow({ where: { id } });
  if (n.xml) return n;
  const e = await empresa(n.empresaId);
  const amb: Ambiente = e.ambienteFiscal === "PRODUCAO" ? 1 : 2;
  const r = await new ClienteDfe(deps.cert ?? certificadoDaEmpresa(e), e.uf!, amb, deps.transporte).distribuir({ cnpj: e.cnpj, chave: n.chave });
  if (r.cStat !== "138") throw new FiscalError(`O XML completo ainda não está disponível (${r.cStat} - ${r.xMotivo}). Manifeste a ciência e tente de novo em alguns minutos.`);
  for (const d of r.docs) await guardarDocumento(d, e.id);
  const atual = await prisma.notaRecebida.findUniqueOrThrow({ where: { id } });
  if (!atual.xml) throw new FiscalError("A SEFAZ devolveu só o resumo da nota. Manifeste a ciência da operação e tente de novo em alguns minutos.");
  return atual;
}

/** Manifestação do destinatário. A ciência libera o XML completo; confirmação/desconhecimento/não realizada são conclusivas. */
export async function manifestar(id: string, tipo: TipoManifestacao, justificativa?: string, deps: Deps = {}) {
  const n = await prisma.notaRecebida.findUniqueOrThrow({ where: { id } });
  if (n.manifestacao && n.manifestacao !== "CIENCIA") throw new FiscalError(`Esta nota já tem manifestação conclusiva (${MANIFESTACOES[n.manifestacao as TipoManifestacao]?.rotulo ?? n.manifestacao})`);
  if (n.manifestacao === "CIENCIA" && tipo === "CIENCIA") return n;
  const e = await empresa(n.empresaId);
  const amb: Ambiente = e.ambienteFiscal === "PRODUCAO" ? 1 : 2;
  const idLote = await prisma.$transaction((tx) => proximoNumero(tx, "LOTE-EVENTO"));
  const r = await new ClienteDfe(deps.cert ?? certificadoDaEmpresa(e), e.uf!, amb, deps.transporte).manifestar({ chave: n.chave, tipo, cnpj: e.cnpj, justificativa, idLote, data: deps.agora });
  if (!r.ok) throw new FiscalError(`SEFAZ recusou a manifestação: ${r.cStat} - ${r.xMotivo}`);
  const atual = await prisma.notaRecebida.update({
    where: { id },
    data: { manifestacao: tipo, manifestadaEm: deps.agora ?? new Date(), protocoloManifesto: r.protocolo, justificativa: justificativa?.trim() || null },
  });
  if (tipo === "CIENCIA" || tipo === "CONFIRMADA") {
    try { return await baixarXmlCompleto(id, deps); } catch { return atual; }
  }
  return atual;
}

/** Agendador: busca as notas recebidas de cada empresa que tem certificado (a SEFAZ responde por CNPJ). */
export async function sincronizarDfeTodas() {
  const empresas = await prisma.empresa.findMany({ where: { ativa: true }, orderBy: { createdAt: "asc" } });
  const out: Record<string, string> = {};
  for (const e of empresas) {
    try {
      certificadoDaEmpresa(e);
    } catch (err) {
      out[e.cnpj] = `ignorada: ${(err as Error).message}`;
      continue;
    }
    try {
      out[e.cnpj] = (await sincronizarDfe({ empresaId: e.id })).mensagem;
    } catch (err) {
      out[e.cnpj] = `erro: ${(err as Error).message}`;
    }
  }
  return out;
}
