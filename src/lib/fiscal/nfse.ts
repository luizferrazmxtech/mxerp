import https from "node:https";
import { gzipSync, gunzipSync } from "node:zlib";
import { autoridadesSefaz, NaoEnviadoError, opcoesTls, type Certificado } from "./certificado";
import { assinarXml } from "./assinatura";
import { dataHoraTz, dec, g, so, t } from "./xml";

/**
 * NFS-e padrão nacional (Sefin Nacional / ADN), DPS versão 1.00.
 * A DPS é assinada, compactada (gzip) e enviada em base64 numa API REST com mTLS.
 */

export const NS_NFSE = "http://www.sped.fazenda.gov.br/nfse";
export const VERSAO_DPS = "1.00";
export const VER_APLIC = "MXERP1.0";

export const URL_SEFIN = {
  1: "https://sefin.nfse.gov.br/SefinNacional",
  2: "https://sefin.producaorestrita.nfse.gov.br/SefinNacional", // produção restrita = homologação
} as const;

export const URL_DANFSE = {
  1: "https://adn.nfse.gov.br/danfse",
  2: "https://adn.producaorestrita.nfse.gov.br/danfse",
} as const;

export type DadosDps = {
  tpAmb: 1 | 2;
  emissao: Date;
  competencia: Date; // dia da prestação
  serie: string; // até 5 dígitos
  numero: number;
  prestador: {
    cnpj: string;
    im?: string | null;
    codigoMunicipio: string; // cLocEmi
    fone?: string | null;
    email?: string | null;
    /** 1 não optante, 2 MEI, 3 ME/EPP do Simples */
    opSimpNac: 1 | 2 | 3;
    /** só para ME/EPP: 1 = todos os tributos pelo Simples */
    regApTribSN?: 1 | 2 | 3;
    regEspTrib?: number; // 0 nenhum
  };
  tomador?: {
    documento: string;
    nome: string;
    im?: string | null;
    email?: string | null;
    fone?: string | null;
    endereco?: { codigoMunicipio: string; cep: string; logradouro: string; numero: string; complemento?: string | null; bairro: string } | null;
  } | null;
  servico: {
    codigoMunicipioPrestacao: string;
    cTribNac: string; // 6 dígitos (item da LC 116 + subitem + desdobro)
    cNBS?: string | null;
    descricao: string;
    valor: number;
    aliquotaIss?: number | null;
    issRetido?: boolean;
  };
};

/** Id de 45 posições: DPS + cMun(7) + tpInsc(1) + inscrição(14) + série(5) + nDPS(15). */
export function idDps(d: Pick<DadosDps, "prestador" | "serie" | "numero">) {
  const doc = so(d.prestador.cnpj);
  const tpInsc = doc.length === 14 ? "2" : "1";
  return `DPS${d.prestador.codigoMunicipio}${tpInsc}${doc.padStart(14, "0")}${so(d.serie).padStart(5, "0")}${String(d.numero).padStart(15, "0")}`;
}

const dia = (d: Date) => new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10);

export function montarDps(d: DadosDps): { id: string; xml: string } {
  if (!/^\d{6}$/.test(d.servico.cTribNac)) throw new Error("Código de tributação nacional do serviço deve ter 6 dígitos");
  if (!(d.servico.valor > 0)) throw new Error("Valor do serviço deve ser maior que zero");
  const id = idDps(d);
  const p = d.prestador;
  const tom = d.tomador;
  const docTag = (doc: string) => (so(doc).length === 11 ? t("CPF", so(doc)) : t("CNPJ", so(doc)));
  const infDPS = g("infDPS", [
    t("tpAmb", d.tpAmb),
    t("dhEmi", dataHoraTz(d.emissao)),
    t("verAplic", VER_APLIC),
    t("serie", so(d.serie)),
    t("nDPS", d.numero),
    t("dCompet", dia(d.competencia)),
    t("tpEmit", 1),
    t("cLocEmi", p.codigoMunicipio),
    g("prest", [
      t("CNPJ", so(p.cnpj)),
      t("IM", p.im),
      t("fone", so(p.fone) || undefined),
      t("email", p.email),
      g("regTrib", [
        t("opSimpNac", p.opSimpNac),
        p.opSimpNac === 3 && t("regApTribSN", p.regApTribSN ?? 1),
        t("regEspTrib", p.regEspTrib ?? 0),
      ]),
    ]),
    tom && g("toma", [
      docTag(tom.documento),
      t("IM", tom.im),
      t("xNome", tom.nome.slice(0, 300)),
      tom.endereco && g("end", [
        g("endNac", [t("cMun", tom.endereco.codigoMunicipio), t("CEP", so(tom.endereco.cep))]),
        t("xLgr", tom.endereco.logradouro), t("nro", tom.endereco.numero || "SN"), t("xCpl", tom.endereco.complemento), t("xBairro", tom.endereco.bairro),
      ]),
      t("fone", so(tom.fone) || undefined),
      t("email", tom.email),
    ]),
    g("serv", [
      g("locPrest", t("cLocPrestacao", d.servico.codigoMunicipioPrestacao)),
      g("cServ", [t("cTribNac", d.servico.cTribNac), t("xDescServ", d.servico.descricao.slice(0, 2000)), t("cNBS", so(d.servico.cNBS) || undefined)]),
    ]),
    g("valores", [
      g("vServPrest", t("vServ", dec(d.servico.valor))),
      g("trib", [
        g("tribMun", [
          t("tribISSQN", 1), // operação tributável
          // ME/EPP do Simples que recolhe ISS no DAS não informa alíquota, salvo retenção
          (p.opSimpNac !== 3 || d.servico.issRetido) && d.servico.aliquotaIss != null && t("pAliq", dec(d.servico.aliquotaIss)),
          t("tpRetISSQN", d.servico.issRetido ? 2 : 1),
        ]),
        g("totTrib", t("indTotTrib", 0)),
      ]),
    ]),
  ], { Id: id });
  return { id, xml: `<DPS xmlns="${NS_NFSE}" versao="${VERSAO_DPS}">${infDPS}</DPS>` };
}

export function assinarDps(xml: string, cert: Certificado) {
  return assinarXml(xml, cert, { tag: "infDPS", pai: "DPS", sha256: process.env.NFSE_ASSINATURA_SHA256 === "1" });
}

export const gzipB64 = (xml: string) => gzipSync(Buffer.from(xml, "utf8")).toString("base64");
export const gunzipB64 = (b64: string) => gunzipSync(Buffer.from(b64, "base64")).toString("utf8");

/** Pedido de cancelamento (evento 101101). cMotivo: 1 erro na emissão, 2 serviço não prestado, 9 outros. */
export function montarPedidoCancelamento(p: { tpAmb: 1 | 2; cnpj: string; chave: string; cMotivo: 1 | 2 | 9; motivo: string; data?: Date }) {
  const tp = "101101";
  const n = "001";
  const inf = g("infPedReg", [
    t("tpAmb", p.tpAmb), t("verAplic", VER_APLIC), t("dhEvento", dataHoraTz(p.data)), t("CNPJAutor", so(p.cnpj)),
    t("chNFSe", p.chave), t("nPedRegEvento", n),
    g("e101101", [t("xDesc", "Cancelamento de NFS-e"), t("cMotivo", p.cMotivo), t("xMotivo", p.motivo.slice(0, 255))]),
  ], { Id: `PRE${p.chave}${tp}${n}` });
  return `<pedRegEvento xmlns="${NS_NFSE}" versao="1.00">${inf}</pedRegEvento>`;
}

export type RespostaHttp = { status: number; corpo: string };
export type TransporteRest = (metodo: "POST" | "GET", url: string, corpo: string | null, cert: Certificado) => Promise<RespostaHttp>;

export const transporteRest: TransporteRest = (metodo, url, corpo, cert) =>
  new Promise((resolve, reject) => {
    let conectou = false;
    const falhou = (e: Error) => reject(conectou ? e : new NaoEnviadoError(`Não foi possível conectar à NFS-e Nacional: ${e.message}`));
    try {
    const ca = autoridadesSefaz();
    const req = https.request(url, {
      method: metodo, ...opcoesTls(cert), ca, timeout: 30000,
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(corpo ? { "Content-Length": Buffer.byteLength(corpo) } : {}) },
    }, (res) => {
      const partes: Buffer[] = [];
      res.on("data", (c) => partes.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, corpo: Buffer.concat(partes).toString("utf8") }));
    });
    req.on("socket", (s) => s.once("secureConnect", () => { conectou = true; }));
    req.on("timeout", () => req.destroy(new Error("Tempo esgotado na comunicação com a NFS-e Nacional")));
    req.on("error", falhou);
    req.end(corpo ?? undefined);
    } catch (e) {
      falhou(e as Error);
    }
  });

type Erro = { Codigo?: string; codigo?: string; Descricao?: string; descricao?: string; Complemento?: string; complemento?: string };
const errosTexto = (j: { erros?: Erro[]; erro?: Erro[] }) =>
  (j.erros ?? j.erro ?? []).map((e) => `${e.Codigo ?? e.codigo ?? ""} ${e.Descricao ?? e.descricao ?? ""} ${e.Complemento ?? e.complemento ?? ""}`.trim()).join("; ");

export class ClienteNfse {
  constructor(private cert: Certificado, private amb: 1 | 2, private transporte: TransporteRest = transporteRest) {}

  /** Envia a DPS assinada. Sucesso devolve a chave de 50 dígitos e o XML da NFS-e gerada. */
  async emitir(dpsAssinada: string) {
    const r = await this.transporte("POST", `${URL_SEFIN[this.amb]}/nfse`, JSON.stringify({ dpsXmlGZipB64: gzipB64(dpsAssinada) }), this.cert);
    let j: Record<string, unknown> = {};
    try { j = JSON.parse(r.corpo || "{}"); } catch { /* resposta não-JSON */ }
    if (r.status >= 200 && r.status < 300 && j.chaveAcesso) {
      return { ok: true as const, chave: String(j.chaveAcesso), xmlNfse: j.nfseXmlGZipB64 ? gunzipB64(String(j.nfseXmlGZipB64)) : null, mensagem: "NFS-e gerada" };
    }
    return { ok: false as const, chave: null, xmlNfse: null, mensagem: errosTexto(j as never) || `HTTP ${r.status}: ${r.corpo.slice(0, 300)}` };
  }

  async cancelar(p: { cnpj: string; chave: string; cMotivo: 1 | 2 | 9; motivo: string; data?: Date }) {
    if (p.motivo.trim().length < 15) throw new Error("Motivo precisa de pelo menos 15 caracteres");
    const xml = montarPedidoCancelamento({ ...p, tpAmb: this.amb });
    const assinado = assinarXml(xml, this.cert, { tag: "infPedReg", pai: "pedRegEvento", sha256: process.env.NFSE_ASSINATURA_SHA256 === "1" });
    const r = await this.transporte("POST", `${URL_SEFIN[this.amb]}/nfse/${p.chave}/eventos`, JSON.stringify({ pedidoRegistroEventoXmlGZipB64: gzipB64(assinado) }), this.cert);
    let j: Record<string, unknown> = {};
    try { j = JSON.parse(r.corpo || "{}"); } catch { /* */ }
    const ok = r.status >= 200 && r.status < 300;
    return { ok, pedidoXml: assinado, eventoXml: j.eventoXmlGZipB64 ? gunzipB64(String(j.eventoXmlGZipB64)) : null, mensagem: ok ? "Cancelamento registrado" : errosTexto(j as never) || `HTTP ${r.status}` };
  }
}
