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

/**
 * Estado da distribuição de cada CNPJ.
 * - ultNSU: último NSU recebido; nunca volta para trás (a SEFAZ responde 656 a quem pede um NSU antigo).
 * - proximaConsulta: quando a busca por NSU pode rodar de novo (1 hora depois de ficar em dia, 137 ou 656).
 * - bloqueadaAte: a SEFAZ respondeu 656 (consumo indevido) e o CNPJ fica bloqueado por 1 hora para QUALQUER
 *   consulta (por NSU ou por chave); cada tentativa durante o bloqueio recomeça a hora, então nada é enviado.
 * - chaves: horários dos pedidos por chave (consChNFe) na última hora, para não passar do limite.
 */
export type EstadoDfe = {
  ultNSU: string; maxNSU?: string; proximaConsulta?: string; bloqueadaAte?: string; ultimaConsulta?: string; ultimoRetorno?: string; chaves?: string[];
};

/** Estado da distribuição (último NSU) de cada CNPJ. O antigo "dfe" (de antes do multiempresa) vale para a primeira empresa. */
export async function estadoDfe(empresaId?: string): Promise<EstadoDfe> {
  const primeira = await prisma.empresa.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  const id = empresaId ?? primeira?.id;
  let c = id ? await prisma.configuracao.findUnique({ where: { chave: `dfe-${id}` } }) : null;
  if (!c && (!id || id === primeira?.id)) c = await prisma.configuracao.findUnique({ where: { chave: "dfe" } });
  return { ultNSU: "0", ...((c?.valor as EstadoDfe | null) ?? {}) };
}
/** Grava só os campos informados, mantendo o resto do estado (a busca por NSU e os pedidos por chave dividem o mesmo estado). */
async function salvarEstado(empresaId: string, mudar: Partial<EstadoDfe>) {
  const chave = `dfe-${empresaId}`;
  const valor = JSON.parse(JSON.stringify({ ...(await estadoDfe(empresaId)), ...mudar })) as EstadoDfe;
  await prisma.configuracao.upsert({ where: { chave }, create: { chave, valor }, update: { valor } });
}

const HORA = 3600_000;
/** Pedidos por chave (consChNFe) aceitos por hora e por CNPJ. A SEFAZ responde 656 acima de 20; ficamos bem abaixo. */
export const LIMITE_CHAVES_HORA = 10;
/** NSU maior dos dois (ignora vazio/zero vindo da SEFAZ). */
const maiorNsu = (a: string, b?: string) => (b && Number(b) > 0 && nsu15(b) > nsu15(a) ? nsu15(b) : nsu15(a));
const hhmm = (d: string | Date) => new Date(d).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const depois = (d: string | undefined, agora: Date) => !!d && new Date(d) > agora;

/** Erro de espera: a SEFAZ não pode ser consultada agora (bloqueio de 1 hora ou limite de pedidos por chave). */
export class EsperaSefaz extends FiscalError {}

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
 * Busca na SEFAZ os documentos novos desde o último NSU (até 20 lotes por vez), seguindo a NT 2014.002:
 * - sempre manda o ultNSU devolvido na resposta anterior (nunca volta para trás);
 * - quando fica em dia (ultNSU = maxNSU) ou não há nada novo (137), só consulta de novo depois de 1 hora;
 * - no 656 (consumo indevido) não consulta mais nada desse CNPJ por 1 hora, nem por chave.
 * O XML completo das notas com ciência chega por aqui mesmo, como um novo NSU (procNFe).
 */
export async function sincronizarDfe(deps: Deps & { empresaId?: string | null } = {}) {
  const e = await empresa(deps.empresaId);
  const amb: Ambiente = e.ambienteFiscal === "PRODUCAO" ? 1 : 2;
  const agora = deps.agora ?? new Date();
  const est = await estadoDfe(e.id);
  if (depois(est.bloqueadaAte, agora))
    return { novos: 0, aguardar: est.bloqueadaAte, mensagem: `A SEFAZ bloqueou as consultas deste CNPJ por 1 hora. O sistema tenta de novo sozinho depois das ${hhmm(est.bloqueadaAte!)}.` };
  if (depois(est.proximaConsulta, agora))
    return { novos: 0, aguardar: est.proximaConsulta, mensagem: `Já está em dia. A SEFAZ só aceita nova consulta depois das ${hhmm(est.proximaConsulta!)} (o sistema busca sozinho).` };
  const cli = new ClienteDfe(deps.cert ?? certificadoDaEmpresa(e), e.uf!, amb, deps.transporte);
  const umaHora = new Date(agora.getTime() + HORA).toISOString();
  let ult = nsu15(est.ultNSU), novos = 0;
  for (let i = 0; i < 20; i++) {
    const r = await cli.distribuir({ cnpj: e.cnpj, ultNSU: ult });
    const base = { ultimaConsulta: agora.toISOString(), ultimoRetorno: `${r.cStat} - ${r.xMotivo}` };
    if (r.cStat === "656") {
      // consumo indevido: o NSU devolvido nessa resposta não vale (costuma vir zerado); mantém o que já tínhamos
      await salvarEstado(e.id, { ...base, ultNSU: ult, proximaConsulta: umaHora, bloqueadaAte: umaHora });
      return { novos, aguardar: umaHora, mensagem: `${novos ? `${novos} documento(s) novo(s). ` : ""}A SEFAZ pediu para aguardar 1 hora; o sistema tenta de novo sozinho depois das ${hhmm(umaHora)}.` };
    }
    if (r.cStat === "137") {
      ult = maiorNsu(ult, r.ultNSU);
      await salvarEstado(e.id, { ...base, ultNSU: ult, ...(Number(r.maxNSU) > 0 ? { maxNSU: nsu15(r.maxNSU) } : {}), proximaConsulta: umaHora });
      return { novos, mensagem: novos ? `${novos} documento(s) novo(s)` : "Nenhuma nota nova na SEFAZ" };
    }
    if (r.cStat !== "138") {
      await salvarEstado(e.id, base);
      throw new FiscalError(`SEFAZ respondeu ${base.ultimoRetorno}`);
    }
    for (const d of r.docs) if (await guardarDocumento(d, e.id)) novos++;
    ult = maiorNsu(ult, r.ultNSU);
    const max = Number(r.maxNSU) > 0 ? nsu15(r.maxNSU) : ult;
    const emDia = ult >= max;
    await salvarEstado(e.id, { ...base, ultNSU: ult, maxNSU: max, proximaConsulta: emDia ? umaHora : undefined });
    if (emDia) break;
  }
  return { novos, mensagem: `${novos} documento(s) novo(s)` };
}

/** Reserva um pedido por chave (consChNFe): recusa durante o bloqueio do 656 ou acima do limite por hora. */
async function reservarConsultaChave(empresaId: string, agora: Date) {
  const est = await estadoDfe(empresaId);
  if (depois(est.bloqueadaAte, agora))
    throw new EsperaSefaz(`A SEFAZ bloqueou as consultas deste CNPJ por 1 hora (consumo indevido). Tente depois das ${hhmm(est.bloqueadaAte!)}; o sistema também pede sozinho.`);
  const recentes = (est.chaves ?? []).filter((h) => new Date(h).getTime() > agora.getTime() - HORA);
  if (recentes.length >= LIMITE_CHAVES_HORA) {
    const libera = new Date(Math.min(...recentes.map((h) => new Date(h).getTime())) + HORA);
    throw new EsperaSefaz(`Já foram ${LIMITE_CHAVES_HORA} pedidos de XML na última hora, o limite para a SEFAZ não bloquear o CNPJ. Tente depois das ${hhmm(libera)}; o sistema também pede sozinho.`);
  }
  await salvarEstado(empresaId, { chaves: [...recentes, agora.toISOString()] });
}

/** Pede de novo uma nota pela chave (o XML completo só vem depois da ciência da operação). */
export async function baixarXmlCompleto(id: string, deps: Deps = {}) {
  const n = await prisma.notaRecebida.findUniqueOrThrow({ where: { id } });
  if (n.xml) return n;
  const e = await empresa(n.empresaId);
  const amb: Ambiente = e.ambienteFiscal === "PRODUCAO" ? 1 : 2;
  const agora = deps.agora ?? new Date();
  await reservarConsultaChave(e.id, agora);
  const r = await new ClienteDfe(deps.cert ?? certificadoDaEmpresa(e), e.uf!, amb, deps.transporte).distribuir({ cnpj: e.cnpj, chave: n.chave });
  if (r.cStat === "656") {
    const umaHora = new Date(agora.getTime() + HORA).toISOString();
    await salvarEstado(e.id, { bloqueadaAte: umaHora, proximaConsulta: umaHora, ultimoRetorno: `${r.cStat} - ${r.xMotivo}` });
    throw new EsperaSefaz(`A SEFAZ pediu para aguardar 1 hora (${r.xMotivo}). O sistema tenta de novo sozinho depois das ${hhmm(umaHora)}.`);
  }
  if (r.cStat !== "138") throw new FiscalError(`O XML completo ainda não está disponível (${r.cStat} - ${r.xMotivo}). Manifeste a ciência e tente de novo mais tarde.`);
  for (const d of r.docs) await guardarDocumento(d, e.id);
  const atual = await prisma.notaRecebida.findUniqueOrThrow({ where: { id } });
  if (!atual.xml) throw new FiscalError("A SEFAZ devolveu só o resumo da nota. Manifeste a ciência da operação e tente de novo mais tarde.");
  return atual;
}

/** Manifestação do destinatário. A ciência libera o XML completo (chega na próxima busca por NSU); confirmação/desconhecimento/não realizada são conclusivas. */
export async function manifestar(id: string, tipo: TipoManifestacao, justificativa?: string, deps: Deps = {}) {
  const n = await prisma.notaRecebida.findUniqueOrThrow({ where: { id } });
  if (n.manifestacao && n.manifestacao !== "CIENCIA") throw new FiscalError(`Esta nota já tem manifestação conclusiva (${MANIFESTACOES[n.manifestacao as TipoManifestacao]?.rotulo ?? n.manifestacao})`);
  if (n.manifestacao === "CIENCIA" && tipo === "CIENCIA") return n;
  const e = await empresa(n.empresaId);
  const amb: Ambiente = e.ambienteFiscal === "PRODUCAO" ? 1 : 2;
  const idLote = await prisma.$transaction((tx) => proximoNumero(tx, "LOTE-EVENTO"));
  const r = await new ClienteDfe(deps.cert ?? certificadoDaEmpresa(e), e.uf!, amb, deps.transporte).manifestar({ chave: n.chave, tipo, cnpj: e.cnpj, justificativa, idLote, data: deps.agora });
  if (!r.ok) throw new FiscalError(`SEFAZ recusou a manifestação: ${r.cStat} - ${r.xMotivo}`);
  // o XML completo não é pedido aqui: a SEFAZ leva de minutos a horas para liberar e ele chega sozinho na busca por NSU.
  // Pedir por chave logo após a ciência (ainda mais em lote) só gastava o limite e levava ao bloqueio 656.
  return prisma.notaRecebida.update({
    where: { id },
    data: { manifestacao: tipo, manifestadaEm: deps.agora ?? new Date(), protocoloManifesto: r.protocolo, justificativa: justificativa?.trim() || null, xmlTentativas: 0, xmlTentadoEm: null },
  });
}

/** Prazo da manifestação do destinatário: 180 dias da emissão. */
export const PRAZO_MANIFESTACAO_DIAS = 180;
const DIA = 86400_000;
/** Dias que faltam para manifestar (negativo: prazo vencido). */
export const diasParaManifestar = (emissao: Date, agora = new Date()) => Math.floor((emissao.getTime() + PRAZO_MANIFESTACAO_DIAS * DIA - agora.getTime()) / DIA);
/** Nota que ainda precisa de manifestação conclusiva (sem nada ou só com ciência). */
export const semConclusiva = { situacao: "AUTORIZADA", OR: [{ manifestacao: null }, { manifestacao: "CIENCIA" }] } satisfies Prisma.NotaRecebidaWhereInput;
/** Nota com ciência/confirmação cujo XML completo ainda não veio. */
export const aguardandoXml = { xml: null, situacao: "AUTORIZADA", manifestacao: { in: ["CIENCIA", "CONFIRMADA"] } } satisfies Prisma.NotaRecebidaWhereInput;

export const MAX_TENTATIVAS_XML = 24;

/**
 * Plano B para o XML completo: normalmente ele chega pela busca por NSU depois da ciência. Se 1 hora depois da
 * ciência ainda não chegou, pede pela chave, no máximo uma vez por hora por nota, até 24 vezes, e respeitando o
 * limite de pedidos por hora do CNPJ e o bloqueio do 656 (aí para e deixa para a próxima hora).
 */
export async function baixarXmlsPendentes(deps: Deps & { empresaId?: string | null; limite?: number } = {}) {
  const agora = deps.agora ?? new Date();
  const notas = await prisma.notaRecebida.findMany({
    where: {
      ...aguardandoXml, xmlTentativas: { lt: MAX_TENTATIVAS_XML },
      emissao: { gte: new Date(agora.getTime() - PRAZO_MANIFESTACAO_DIAS * DIA) },
      manifestadaEm: { lte: new Date(agora.getTime() - HORA) },
      OR: [{ xmlTentadoEm: null }, { xmlTentadoEm: { lte: new Date(agora.getTime() - HORA + 60_000) } }],
      ...(deps.empresaId !== undefined ? { empresaId: deps.empresaId } : {}),
    },
    orderBy: { manifestadaEm: "desc" }, take: deps.limite ?? 5,
  });
  let baixados = 0, falhas = 0, espera: string | null = null;
  for (const n of notas) {
    try {
      await baixarXmlCompleto(n.id, deps);
      baixados++;
    } catch (e) {
      // bloqueio ou limite: não conta como tentativa da nota e não pede mais nada agora
      if (e instanceof EsperaSefaz) { espera = e.message; break; }
      falhas++;
    }
    await prisma.notaRecebida.update({ where: { id: n.id }, data: { xmlTentativas: { increment: 1 }, xmlTentadoEm: agora } });
  }
  return { baixados, aguardando: falhas, espera };
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

/** Agendador: novo pedido do XML completo das notas com ciência, em cada empresa com certificado. */
export async function baixarXmlsPendentesTodas() {
  const empresas = await prisma.empresa.findMany({ where: { ativa: true }, orderBy: { createdAt: "asc" } });
  const primeira = empresas[0]?.id;
  const out: Record<string, string> = {};
  for (const e of empresas) {
    try { certificadoDaEmpresa(e); } catch { continue; }
    // notas antigas sem loja contam como da primeira empresa
    const r = await baixarXmlsPendentes({ empresaId: e.id });
    const r0 = e.id === primeira && !r.espera ? await baixarXmlsPendentes({ empresaId: null }) : { baixados: 0, aguardando: 0, espera: null };
    const b = r.baixados + r0.baixados, a = r.aguardando + r0.aguardando, espera = r.espera ?? r0.espera;
    if (b || a || espera) out[e.cnpj] = `${b} XML(s) baixado(s), ${a} ainda aguardando a SEFAZ${espera ? ` (${espera})` : ""}`;
  }
  return out;
}
