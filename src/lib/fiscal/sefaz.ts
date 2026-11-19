import https from "node:https";
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";
import type { Certificado } from "./certificado";
import { assinarXml } from "./assinatura";
import { NS_NFE, VERSAO, codigoUf } from "./nfe";
import { dataHoraTz, g, t } from "./xml";

/**
 * Comunicação direta com a SEFAZ-SP (sem intermediário), NF-e e NFC-e 4.00.
 * Os endereços podem ser sobrescritos por variável de ambiente se a SEFAZ mudar.
 */
type Servico = "Autorizacao" | "RetAutorizacao" | "StatusServico" | "RecepcaoEvento" | "Inutilizacao" | "ConsultaProtocolo";
type Ambiente = 1 | 2;

const ENDPOINTS_SP: Record<55 | 65, Record<Ambiente, Record<Servico, string>>> = {
  55: {
    1: {
      Autorizacao: "https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
      RetAutorizacao: "https://nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
      StatusServico: "https://nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx",
      RecepcaoEvento: "https://nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx",
      Inutilizacao: "https://nfe.fazenda.sp.gov.br/ws/nfeinutilizacao4.asmx",
      ConsultaProtocolo: "https://nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx",
    },
    2: {
      Autorizacao: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
      RetAutorizacao: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
      StatusServico: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx",
      RecepcaoEvento: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx",
      Inutilizacao: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeinutilizacao4.asmx",
      ConsultaProtocolo: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx",
    },
  },
  65: {
    1: {
      Autorizacao: "https://nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx",
      RetAutorizacao: "https://nfce.fazenda.sp.gov.br/ws/NFeRetAutorizacao4.asmx",
      StatusServico: "https://nfce.fazenda.sp.gov.br/ws/NFeStatusServico4.asmx",
      RecepcaoEvento: "https://nfce.fazenda.sp.gov.br/ws/NFeRecepcaoEvento4.asmx",
      Inutilizacao: "https://nfce.fazenda.sp.gov.br/ws/NFeInutilizacao4.asmx",
      ConsultaProtocolo: "https://nfce.fazenda.sp.gov.br/ws/NFeConsultaProtocolo4.asmx",
    },
    2: {
      Autorizacao: "https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx",
      RetAutorizacao: "https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeRetAutorizacao4.asmx",
      StatusServico: "https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeStatusServico4.asmx",
      RecepcaoEvento: "https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeRecepcaoEvento4.asmx",
      Inutilizacao: "https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeInutilizacao4.asmx",
      ConsultaProtocolo: "https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeConsultaProtocolo4.asmx",
    },
  },
};

const METODO: Record<Servico, { wsdl: string; acao: string }> = {
  Autorizacao: { wsdl: "NFeAutorizacao4", acao: "nfeAutorizacaoLote" },
  RetAutorizacao: { wsdl: "NFeRetAutorizacao4", acao: "nfeRetAutorizacaoLote" },
  StatusServico: { wsdl: "NFeStatusServico4", acao: "nfeStatusServicoNF" },
  RecepcaoEvento: { wsdl: "NFeRecepcaoEvento4", acao: "nfeRecepcaoEvento" },
  Inutilizacao: { wsdl: "NFeInutilizacao4", acao: "nfeInutilizacaoNF" },
  ConsultaProtocolo: { wsdl: "NFeConsultaProtocolo4", acao: "nfeConsultaNF" },
};

export function endpoint(modelo: 55 | 65, amb: Ambiente, servico: Servico) {
  const env = process.env[`SEFAZ_SP_${modelo}_${amb === 1 ? "PROD" : "HOMOLOG"}_${servico.toUpperCase()}`];
  return env || ENDPOINTS_SP[modelo][amb][servico];
}

export function envelopeSoap(servico: Servico, corpo: string) {
  const ns = `http://www.portalfiscal.inf.br/nfe/wsdl/${METODO[servico].wsdl}`;
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body><nfeDadosMsg xmlns="${ns}">${corpo}</nfeDadosMsg></soap12:Body></soap12:Envelope>`
  );
}

/** Transporte HTTP trocável nos testes. */
export type Transporte = (url: string, soapAction: string, corpo: string, cert: Certificado) => Promise<string>;

export const transporteHttps: Transporte = (url, soapAction, corpo, cert) =>
  new Promise((resolve, reject) => {
    // Cadeia ICP-Brasil: a SEFAZ usa certificados que não estão no repositório padrão do Node.
    // Aponte SEFAZ_CA_FILE para o arquivo .pem com as ACs da ICP-Brasil (iti.gov.br).
    const ca = process.env.SEFAZ_CA_FILE ? fs.readFileSync(process.env.SEFAZ_CA_FILE) : undefined;
    const req = https.request(
      url,
      {
        method: "POST",
        pfx: cert.pfx,
        passphrase: cert.senha,
        ca,
        timeout: 30000,
        headers: {
          "Content-Type": `application/soap+xml; charset=utf-8; action="${soapAction}"`,
          "Content-Length": Buffer.byteLength(corpo),
        },
      },
      (res) => {
        const partes: Buffer[] = [];
        res.on("data", (c) => partes.push(c));
        res.on("end", () => {
          const txt = Buffer.concat(partes).toString("utf8");
          if ((res.statusCode ?? 500) >= 400) reject(new Error(`SEFAZ HTTP ${res.statusCode}: ${txt.slice(0, 500)}`));
          else resolve(txt);
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("Tempo esgotado na comunicação com a SEFAZ")));
    req.on("error", reject);
    req.end(corpo);
  });

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false });

/** Extrai o primeiro elemento com esse nome em qualquer profundidade. */
export function achar(obj: unknown, nome: string): Record<string, unknown> | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  for (const [k, v] of Object.entries(obj)) {
    if (k === nome) return (Array.isArray(v) ? v[0] : v) as Record<string, unknown>;
    const r = achar(v, nome);
    if (r) return r;
  }
  return undefined;
}

/** Recorta um elemento XML bruto da resposta (para guardar o protNFe exatamente como veio). */
export function recortar(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}[\\s>][\\s\\S]*?</(?:\\w+:)?${tag}>`));
  return m ? m[0].replace(/<(\/?)\w+:/g, "<$1") : null;
}

export class ClienteSefaz {
  constructor(
    private cert: Certificado,
    private uf: string,
    private amb: Ambiente,
    private transporte: Transporte = transporteHttps,
  ) {}

  private async chamar(modelo: 55 | 65, servico: Servico, corpo: string) {
    const ns = `http://www.portalfiscal.inf.br/nfe/wsdl/${METODO[servico].wsdl}`;
    const resposta = await this.transporte(endpoint(modelo, this.amb, servico), `${ns}/${METODO[servico].acao}`, envelopeSoap(servico, corpo), this.cert);
    return { bruto: resposta, obj: parser.parse(resposta) as unknown };
  }

  async status(modelo: 55 | 65 = 55) {
    const corpo = g("consStatServ", [t("tpAmb", this.amb), t("cUF", codigoUf(this.uf)), t("xServ", "STATUS")], { xmlns: NS_NFE, versao: VERSAO });
    const { obj } = await this.chamar(modelo, "StatusServico", corpo);
    const r = achar(obj, "retConsStatServ");
    return { cStat: String(r?.cStat ?? ""), xMotivo: String(r?.xMotivo ?? ""), tMed: r?.tMed ? Number(r.tMed) : undefined };
  }

  /** Envia 1 nota em modo síncrono. Devolve o protocolo (autorizada ou rejeitada). */
  async autorizar(nfeAssinada: string, modelo: 55 | 65, idLote: number) {
    const corpo = `<enviNFe xmlns="${NS_NFE}" versao="${VERSAO}"><idLote>${idLote}</idLote><indSinc>1</indSinc>${nfeAssinada.replace(/^<\?xml[^>]*>/, "")}</enviNFe>`;
    const { obj, bruto } = await this.chamar(modelo, "Autorizacao", corpo);
    const ret = achar(obj, "retEnviNFe");
    const lote = { cStat: String(ret?.cStat ?? ""), xMotivo: String(ret?.xMotivo ?? "") };
    const inf = achar(ret, "infProt");
    if (!inf) return { lote, autorizada: false, cStat: lote.cStat, xMotivo: lote.xMotivo, recibo: (achar(ret, "infRec")?.nRec as string) ?? null, protocolo: null, protXml: null };
    const cStat = String(inf.cStat);
    return {
      lote,
      // 100 autorizado, 150 autorizado fora de prazo
      autorizada: cStat === "100" || cStat === "150",
      cStat,
      xMotivo: String(inf.xMotivo),
      recibo: null,
      protocolo: (inf.nProt as string) ?? null,
      protXml: recortar(bruto, "protNFe"),
    };
  }

  /**
   * Consulta a situação de uma nota pela chave (consSitNFe). Usada quando o envio ficou sem resposta
   * (tempo esgotado, lote em processamento): diz se a SEFAZ autorizou, rejeitou ou nem recebeu a nota.
   */
  async consultar(chave: string, modelo: 55 | 65) {
    const corpo = g("consSitNFe", [t("tpAmb", this.amb), t("xServ", "CONSULTAR"), t("chNFe", chave)], { xmlns: NS_NFE, versao: VERSAO });
    const { obj, bruto } = await this.chamar(modelo, "ConsultaProtocolo", corpo);
    const ret = achar(obj, "retConsSitNFe");
    const inf = achar(achar(ret, "protNFe"), "infProt");
    const cStat = String(inf?.cStat ?? ret?.cStat ?? "");
    return {
      // 100 autorizado, 150 autorizado fora de prazo; 101/151/155 cancelada (a nota existiu)
      autorizada: !!inf && (String(inf.cStat) === "100" || String(inf.cStat) === "150"),
      cancelada: ["101", "151", "155"].includes(String(ret?.cStat ?? "")),
      // 217: a nota não consta na base da SEFAZ (o envio não chegou)
      naoConsta: String(ret?.cStat ?? "") === "217",
      cStat,
      xMotivo: String(inf?.xMotivo ?? ret?.xMotivo ?? ""),
      protocolo: (inf?.nProt as string) ?? null,
      protXml: recortar(bruto, "protNFe"),
    };
  }

  /** Cancelamento (evento 110111). Prazo: 24h para NF-e; 30 min para NFC-e. */
  async cancelar(p: { modelo: 55 | 65; chave: string; protocolo: string; justificativa: string; cnpj: string; idLote: number; data?: Date }) {
    if (p.justificativa.trim().length < 15) throw new Error("Justificativa precisa de pelo menos 15 caracteres");
    const xml = montarEventoCancelamento({ ...p, tpAmb: this.amb });
    const assinado = assinarXml(xml, this.cert, { tag: "infEvento", pai: "evento" });
    const corpo = `<envEvento xmlns="${NS_NFE}" versao="1.00"><idLote>${p.idLote}</idLote>${assinado}</envEvento>`;
    const { obj, bruto } = await this.chamar(p.modelo, "RecepcaoEvento", corpo);
    const inf = achar(achar(obj, "retEvento"), "infEvento");
    const cStat = String(inf?.cStat ?? achar(obj, "retEnvEvento")?.cStat ?? "");
    return {
      // 135 evento registrado, 155 cancelamento fora de prazo homologado
      ok: cStat === "135" || cStat === "155",
      cStat,
      xMotivo: String(inf?.xMotivo ?? achar(obj, "retEnvEvento")?.xMotivo ?? ""),
      protocolo: (inf?.nProt as string) ?? null,
      eventoXml: assinado,
      retornoXml: recortar(bruto, "retEvento"),
    };
  }
}

export function montarEventoCancelamento(p: { chave: string; protocolo: string; justificativa: string; cnpj: string; tpAmb: Ambiente; data?: Date }) {
  const tpEvento = "110111";
  const id = `ID${tpEvento}${p.chave}01`;
  const infEvento = g("infEvento", [
    t("cOrgao", p.chave.slice(0, 2)), t("tpAmb", p.tpAmb), t("CNPJ", p.cnpj.replace(/\D/g, "")), t("chNFe", p.chave),
    t("dhEvento", dataHoraTz(p.data)), t("tpEvento", tpEvento), t("nSeqEvento", 1), t("verEvento", "1.00"),
    g("detEvento", [t("descEvento", "Cancelamento"), t("nProt", p.protocolo), t("xJust", p.justificativa.slice(0, 255))], { versao: "1.00" }),
  ], { Id: id });
  return `<evento xmlns="${NS_NFE}" versao="1.00">${infEvento}</evento>`;
}

/** Junta NF-e assinada + protocolo no XML de distribuição (nfeProc), o arquivo que vai para o cliente/contador. */
export function montarProc(nfeAssinada: string, protXml: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="${NS_NFE}" versao="${VERSAO}">${nfeAssinada.replace(/^<\?xml[^>]*>/, "")}${protXml.replace(/ xmlns="[^"]*"/, "")}</nfeProc>`;
}
