import { XMLParser } from "fast-xml-parser";
import type { Certificado } from "./certificado";
import { NS_NFE } from "./nfe";
import { transporteHttps, type Transporte } from "./sefaz";
import { g, t } from "./xml";

/**
 * Consulta Cadastro de Contribuintes do ICMS (CadConsultaCadastro4, consCad 2.00) direto na SEFAZ da UF
 * do contribuinte consultado, com o certificado A1 da loja. Devolve a inscrição estadual e a situação.
 *
 * Nem toda UF oferece o serviço: AL, AP, AM, DF, ES, PA, PI, RJ, RO, RR, SE e TO não têm endereço aqui e
 * a consulta cai para a base pública. Se uma SEFAZ mudar o endereço, sobrescreva com SEFAZ_CADASTRO_<UF>.
 * Sempre em produção: em homologação a SEFAZ devolve dados fictícios.
 */
const SVRS = "https://cad.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx";
export const ENDPOINTS_CADASTRO: Record<string, string> = {
  BA: "https://nfe.sefaz.ba.gov.br/webservices/CadConsultaCadastro4/CadConsultaCadastro4.asmx",
  CE: "https://nfe.sefaz.ce.gov.br/nfe4/services/CadConsultaCadastro4",
  GO: "https://nfe.sefaz.go.gov.br/nfe/services/CadConsultaCadastro4",
  MA: "https://sistemas.sefaz.ma.gov.br/wscadastro/CadConsultaCadastro4",
  MG: "https://nfe.fazenda.mg.gov.br/nfe2/services/CadConsultaCadastro4",
  MS: "https://nfe.sefaz.ms.gov.br/ws/CadConsultaCadastro4",
  MT: "https://nfe.sefaz.mt.gov.br/nfews/v2/services/CadConsultaCadastro4",
  PE: "https://nfe.sefaz.pe.gov.br/nfe-service/services/CadConsultaCadastro4",
  PR: "https://nfe.sefa.pr.gov.br/nfe/CadConsultaCadastro4",
  RS: "https://cad.sefazrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx",
  SP: "https://nfe.fazenda.sp.gov.br/ws/cadconsultacadastro4.asmx",
  AC: SVRS, PB: SVRS, RN: SVRS, SC: SVRS,
};

export function endpointCadastro(uf: string): string | null {
  const u = uf.toUpperCase();
  return process.env[`SEFAZ_CADASTRO_${u}`] || ENDPOINTS_CADASTRO[u] || null;
}

const WSDL = "http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4";

export function montarConsCad(uf: string, cnpj: string) {
  return g("ConsCad", g("infCons", [t("xServ", "CONS-CAD"), t("UF", uf.toUpperCase()), t("CNPJ", cnpj.replace(/\D/g, ""))]), { xmlns: NS_NFE, versao: "2.00" });
}

export type CadastroSefaz = {
  ie: string;
  uf: string;
  habilitada: boolean;
  razaoSocial: string;
  nomeFantasia: string;
  regime: string;
  cnae: string;
  endereco: { logradouro: string; numero: string; complemento: string; bairro: string; codigoMunicipio: string; cidade: string; cep: string } | null;
};

export type RetornoCadastro =
  | { ok: true; cStat: string; xMotivo: string; cadastros: CadastroSefaz[] }
  | { ok: false; cStat: string; xMotivo: string; naoContribuinte: boolean };

const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, isArray: (n) => n === "infCad" });

function achar(obj: unknown, nome: string): Record<string, unknown> | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  for (const [k, v] of Object.entries(obj)) {
    if (k === nome) return (Array.isArray(v) ? v[0] : v) as Record<string, unknown>;
    const r = achar(v, nome);
    if (r) return r;
  }
  return undefined;
}

const s = (v: unknown) => (v == null ? "" : String(v).trim());

/** Lê o retConsCad. 111 = uma ocorrência, 112 = várias (ex.: mais de uma IE para o CNPJ). */
export function lerRetornoCadastro(xml: string): RetornoCadastro {
  const ret = achar(parser.parse(xml), "retConsCad");
  const inf = achar(ret, "infCons") as Record<string, unknown> | undefined;
  const cStat = s(inf?.cStat);
  const xMotivo = s(inf?.xMotivo);
  if (cStat !== "111" && cStat !== "112") {
    // 259: CNPJ não cadastrado como contribuinte na UF (não é erro de comunicação: ele não tem IE lá)
    return { ok: false, cStat, xMotivo: xMotivo || "Resposta inesperada da SEFAZ", naoContribuinte: cStat === "259" };
  }
  const lista = (inf?.infCad as Record<string, unknown>[] | undefined) ?? [];
  const cadastros = lista.map((c): CadastroSefaz => {
    const e = c.ender as Record<string, unknown> | undefined;
    return {
      ie: s(c.IE),
      uf: s(c.UF),
      habilitada: s(c.cSit) === "1",
      razaoSocial: s(c.xNome),
      nomeFantasia: s(c.xFant),
      regime: s(c.xRegApur),
      cnae: s(c.CNAE),
      endereco: e ? { logradouro: s(e.xLgr), numero: s(e.nro), complemento: s(e.xCpl), bairro: s(e.xBairro), codigoMunicipio: s(e.cMun), cidade: s(e.xMun), cep: s(e.CEP) } : null,
    };
  });
  return { ok: true, cStat, xMotivo, cadastros };
}

/** Envia o consCad para a SEFAZ da UF. Lança erro se a UF não tem o serviço ou a comunicação falha. */
export async function consultarCadastroSefaz(uf: string, cnpj: string, cert: Certificado, transporte: Transporte = transporteHttps): Promise<RetornoCadastro> {
  const url = endpointCadastro(uf);
  if (!url) throw new Error(`A SEFAZ-${uf.toUpperCase()} não oferece a consulta de cadastro`);
  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body><nfeDadosMsg xmlns="${WSDL}">${montarConsCad(uf, cnpj)}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;
  return lerRetornoCadastro(await transporte(url, `${WSDL}/consultaCadastro`, envelope, cert));
}
