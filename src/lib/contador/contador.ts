import JSZip from "jszip";
import { prisma } from "@/lib/db";
import { enviarEmail, type Transporte } from "@/lib/email/email";
import { baseLinks } from "@/lib/financeiro/boletos";
import { manifestar, type TipoManifestacao } from "@/lib/fiscal/dfe";
import type { Transporte as TransporteSefaz } from "@/lib/fiscal/sefaz";
import type { Certificado } from "@/lib/fiscal/certificado";

/**
 * Contador: todo mês o MXERP junta os XMLs do mês anterior de cada CNPJ (NF-e, NFC-e e NFS-e emitidas, com
 * cancelamentos, cartas de correção e inutilizações; NF-e recebidas dos fornecedores) num .zip com um resumo em
 * planilha (CSV) e manda por e-mail ao escritório, com um link de download que vale 60 dias.
 * Também cuida da manifestação das notas de entrada: ciência automática (libera o XML completo) e confirmação da
 * operação quando a compra da nota é lançada.
 */
export type ConfigContador = {
  ativo: boolean; // envio automático
  escritorio: string;
  emails: string; // separados por vírgula
  diaEnvio: number; // 1 a 28
  incluirRecebidas: boolean;
  mensagem: string;
  cienciaAutomatica: boolean;
  confirmarCompra: boolean;
};

export class ContadorError extends Error {}

const PADRAO: ConfigContador = {
  ativo: false, escritorio: "", emails: "", diaEnvio: 5, incluirRecebidas: true, cienciaAutomatica: false, confirmarCompra: false,
  mensagem: "Olá,\n\nSeguem os arquivos fiscais de [empresa] (CNPJ [cnpj]) referentes a [competencia]: [resumo].\n\nSe o anexo não abrir, baixe por este link (vale 60 dias): [link]\n\nAtenciosamente,\n[empresa]",
};

export async function configContador(): Promise<ConfigContador> {
  const c = await prisma.configuracao.findUnique({ where: { chave: "contador" } });
  return { ...PADRAO, ...((c?.valor ?? {}) as Partial<ConfigContador>) };
}

export const listaEmails = (s: string) => s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

export async function salvarConfigContador(d: ConfigContador) {
  const emails = listaEmails(d.emails);
  for (const e of emails) if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new ContadorError(`E-mail inválido: ${e}`);
  if (d.ativo && !emails.length) throw new ContadorError("Informe o e-mail do contador para ligar o envio automático");
  const valor: ConfigContador = { ...d, emails: emails.join(", "), escritorio: d.escritorio.trim(), diaEnvio: Math.min(Math.max(Math.trunc(d.diaEnvio) || 5, 1), 28), mensagem: d.mensagem.trim() || PADRAO.mensagem };
  await prisma.configuracao.upsert({ where: { chave: "contador" }, create: { chave: "contador", valor }, update: { valor } });
}

// ---------- competência

export const competenciaAnterior = (hoje = new Date()) => {
  const s = hoje.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [a, m] = s.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
};
/** Início e fim (exclusivo) do mês no fuso de São Paulo. */
export function limitesMes(comp: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(comp)) throw new ContadorError("Competência inválida (use AAAA-MM)");
  const [a, m] = comp.split("-").map(Number);
  return { de: new Date(Date.UTC(a, m - 1, 1, 3)), ate: new Date(Date.UTC(m === 12 ? a + 1 : a, m === 12 ? 0 : m, 1, 3)) };
}
export const nomeCompetencia = (comp: string) => new Date(`${comp}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

// ---------- pacote

const PASTA: Record<string, string> = { NFE: "NF-e", NFCE: "NFC-e", NFSE: "NFS-e" };
const EVENTO: Record<string, string> = { "110111": "cancelamento", "110110": "carta-correcao" };
const csv = (v: unknown) => { const s = v == null ? "" : String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const valorBr = (v: unknown) => Number(v ?? 0).toFixed(2).replace(".", ",");
const dataBr = (d: Date | null | undefined) => (d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");

export type Pacote = { nome: string; zip: Buffer; arquivos: number; resumo: string; contagem: Record<string, number>; total: number };

/** Monta o .zip do mês de uma empresa (só notas de produção). */
export async function montarPacote(empresaId: string, comp: string, opts: { incluirRecebidas?: boolean } = {}): Promise<Pacote> {
  const e = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId }, omit: { logo: true, certificadoPfx: true, certificadoSenha: true } });
  const { de, ate } = limitesMes(comp);
  const primeira = (await prisma.empresa.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;
  // notas de antes do multiempresa (sem loja) são da primeira empresa
  const daLoja = primeira === empresaId ? { OR: [{ empresaId }, { empresaId: null }] } : { empresaId };
  const notas = await prisma.notaFiscal.findMany({
    where: { AND: [daLoja, { OR: [{ emitidaEm: { gte: de, lt: ate } }, { emitidaEm: null, createdAt: { gte: de, lt: ate } }] }], ambiente: "PRODUCAO", status: { in: ["AUTORIZADA", "CANCELADA", "DENEGADA"] } },
    include: { eventos: true }, orderBy: [{ modelo: "asc" }, { serie: "asc" }, { numero: "asc" }],
  });
  const inut = await prisma.inutilizacaoNumeracao.findMany({ where: { ...daLoja, ambiente: "PRODUCAO", status: "HOMOLOGADA", createdAt: { gte: de, lt: ate } } });
  const recebidas = opts.incluirRecebidas === false ? [] : await prisma.notaRecebida.findMany({ where: { ...daLoja, emissao: { gte: de, lt: ate }, xml: { not: null } }, orderBy: { emissao: "asc" } });
  const semXml = opts.incluirRecebidas === false ? 0 : await prisma.notaRecebida.count({ where: { ...daLoja, emissao: { gte: de, lt: ate }, xml: null, situacao: "AUTORIZADA" } });

  const z = new JSZip();
  const raiz = `${e.cnpj}_${comp}`;
  let arquivos = 0;
  const por: Record<string, number> = {};
  const linhas = [["Tipo", "Série", "Número", "Chave", "Emissão", "Situação", "Valor", "Arquivo"].join(";")];
  let total = 0;
  const soma = (k: string) => { por[k] = (por[k] ?? 0) + 1; };
  for (const n of notas) {
    const sit = n.status === "AUTORIZADA" ? "autorizadas" : n.status === "CANCELADA" ? "canceladas" : "denegadas";
    const pasta = `${raiz}/${PASTA[n.modelo] ?? n.modelo}/${sit}`;
    const base = n.chave ?? `${n.modelo}-${n.serie}-${n.numero}`;
    let arq = "";
    if (n.xml) { arq = `${pasta}/${base}.xml`; z.file(arq, n.xml); arquivos++; }
    for (const ev of n.eventos) {
      if (!ev.xml) continue;
      z.file(`${pasta}/${base}-${EVENTO[ev.tipo] ?? ev.tipo}-${ev.sequencia}.xml`, ev.xml); arquivos++;
    }
    soma(`${PASTA[n.modelo] ?? n.modelo} ${sit}`);
    if (n.status === "AUTORIZADA") total += Number(n.valorTotal);
    linhas.push([PASTA[n.modelo] ?? n.modelo, n.serie, n.numero, n.chave ?? "", dataBr(n.emitidaEm ?? n.createdAt), n.status, valorBr(n.valorTotal), arq.replace(`${raiz}/`, "")].map(csv).join(";"));
  }
  for (const i of inut) {
    if (i.xml) { z.file(`${raiz}/Inutilizacoes/${PASTA[i.modelo] ?? i.modelo}-serie${i.serie}-${i.numeroInicial}-${i.numeroFinal}.xml`, i.xml); arquivos++; }
    soma("Inutilizações");
    linhas.push([`Inutilização ${PASTA[i.modelo] ?? i.modelo}`, i.serie, `${i.numeroInicial} a ${i.numeroFinal}`, "", dataBr(i.createdAt), "HOMOLOGADA", "", ""].map(csv).join(";"));
  }
  for (const r of recebidas) {
    const arq = `${raiz}/Entradas (notas recebidas)/${r.chave}.xml`;
    z.file(arq, r.xml!); arquivos++;
    soma("NF-e recebidas");
    linhas.push(["NF-e recebida", r.chave.slice(22, 25), Number(r.chave.slice(25, 34)), r.chave, dataBr(r.emissao), r.situacao, valorBr(r.valor), arq.replace(`${raiz}/`, "")].map(csv).join(";"));
  }
  z.file(`${raiz}/resumo.csv`, "﻿" + linhas.join("\r\n"));
  const partes = Object.entries(por).map(([k, v]) => `${v} ${k}`);
  const resumo = partes.length ? partes.join(", ") : "nenhuma nota no mês";
  z.file(`${raiz}/LEIA-ME.txt`, [
    `${e.razaoSocial} - CNPJ ${e.cnpj}`, `Competência: ${nomeCompetencia(comp)}`, "", `Conteúdo: ${resumo}.`,
    `Total das notas autorizadas emitidas: R$ ${valorBr(total)}.`,
    semXml ? `Atenção: ${semXml} nota(s) recebida(s) no mês ainda sem XML completo (falta a ciência da operação).` : "",
    "", "Gerado pelo MXERP. Notas de homologação (teste) não entram.",
  ].join("\r\n"));
  const zip = await z.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { nome: `${raiz}.zip`, zip, arquivos, resumo, contagem: por, total };
}

// ---------- envio

const MAX_ANEXO = 15 * 1024 * 1024;

export async function enviarPacote(empresaId: string, comp: string, opts: { automatico?: boolean; usuarioNome?: string | null; baseUrl?: string; transporte?: Transporte; para?: string } = {}) {
  const c = await configContador();
  const para = listaEmails(opts.para ?? c.emails);
  if (!para.length) throw new ContadorError("Informe o e-mail do contador em Configurações → Integrações → Contador");
  const e = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId }, select: { razaoSocial: true, nomeFantasia: true, cnpj: true } });
  const envio = await prisma.envioContador.create({ data: { empresaId, competencia: comp, situacao: "ERRO", destinatarios: para.join(", "), automatico: !!opts.automatico, usuarioNome: opts.usuarioNome ?? null } });
  try {
    const p = await montarPacote(empresaId, comp, { incluirRecebidas: c.incluirRecebidas });
    const base = (opts.baseUrl ?? (await baseLinks()) ?? "").replace(/\/+$/, "");
    const link = base ? `${base}/api/contador/arquivo/${envio.token}` : "(link indisponível: informe o endereço público do sistema na configuração do Banco Inter)";
    const nomeEmp = e.nomeFantasia || e.razaoSocial;
    const texto = c.mensagem.replace(/\[empresa\]/g, nomeEmp).replace(/\[cnpj\]/g, e.cnpj).replace(/\[competencia\]/g, nomeCompetencia(comp)).replace(/\[resumo\]/g, p.resumo).replace(/\[link\]/g, link);
    await enviarEmail({
      para: para.join(", "), assunto: `Arquivos fiscais ${nomeCompetencia(comp)} - ${nomeEmp}`, texto,
      anexos: p.zip.length <= MAX_ANEXO ? [{ nome: p.nome, conteudo: p.zip, tipo: "application/zip" }] : [],
    }, { transporte: opts.transporte });
    return await prisma.envioContador.update({ where: { id: envio.id }, data: { situacao: "ENVIADO", arquivos: p.arquivos, tamanho: p.zip.length, erro: null } });
  } catch (err) {
    await prisma.envioContador.update({ where: { id: envio.id }, data: { erro: (err instanceof Error ? err.message : String(err)).slice(0, 500) } });
    throw err;
  }
}

/** Pacote do link de download (vale 60 dias). */
export async function pacoteDoLink(token: string) {
  const e = await prisma.envioContador.findUnique({ where: { token } });
  if (!e || e.situacao !== "ENVIADO" || e.createdAt < new Date(Date.now() - 60 * 86400000)) return null;
  return montarPacote(e.empresaId, e.competencia, { incluirRecebidas: (await configContador()).incluirRecebidas });
}

/**
 * Agendador: a partir do dia configurado, manda o mês anterior de cada empresa que ainda não foi enviado.
 * Depois de um erro espera 6 horas para tentar de novo (para não encher a caixa do contador).
 */
export async function processarContador(opts: { agora?: Date; transporte?: Transporte; baseUrl?: string } = {}) {
  const c = await configContador();
  if (!c.ativo) return { ignorado: "envio ao contador desligado" };
  const agora = opts.agora ?? new Date();
  const dia = Number(agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(8, 10));
  if (dia < c.diaEnvio) return { aguardando: `envio no dia ${c.diaEnvio}` };
  const comp = competenciaAnterior(agora);
  const out: Record<string, string> = {};
  for (const e of await prisma.empresa.findMany({ where: { ativa: true }, orderBy: { createdAt: "asc" } })) {
    const ja = await prisma.envioContador.findFirst({ where: { empresaId: e.id, competencia: comp, OR: [{ situacao: "ENVIADO" }, { createdAt: { gt: new Date(agora.getTime() - 6 * 3600000) } }] } });
    if (ja) { out[e.cnpj] = ja.situacao === "ENVIADO" ? "já enviado" : "aguardando nova tentativa"; continue; }
    try { await enviarPacote(e.id, comp, { automatico: true, transporte: opts.transporte, baseUrl: opts.baseUrl }); out[e.cnpj] = "enviado"; }
    catch (err) { out[e.cnpj] = `erro: ${err instanceof Error ? err.message : String(err)}`; }
  }
  return { competencia: comp, empresas: out };
}

// ---------- manifestação automática das notas de entrada

type DepsSefaz = { cert?: Certificado; transporte?: TransporteSefaz; agora?: Date };

/**
 * Depois da busca na SEFAZ: dá ciência às notas novas (o XML completo vem em seguida) e confirma a operação das
 * notas cuja compra já foi lançada. No máximo 20 de cada por vez.
 */
export async function manifestacaoAutomatica(deps: DepsSefaz = {}) {
  const c = await configContador();
  const r = { ciencias: 0, confirmacoes: 0, erros: [] as string[] };
  const fazer = async (id: string, tipo: TipoManifestacao, chave: string) => {
    try { await manifestar(id, tipo, undefined, deps); return true; }
    catch (e) { r.erros.push(`${chave.slice(25, 34)}: ${e instanceof Error ? e.message : String(e)}`); return false; }
  };
  if (c.confirmarCompra) {
    const compras = await prisma.compra.findMany({ where: { chaveNfe: { not: null } }, select: { chaveNfe: true } });
    const notas = await prisma.notaRecebida.findMany({ where: { chave: { in: compras.map((x) => x.chaveNfe!) }, situacao: "AUTORIZADA", OR: [{ manifestacao: null }, { manifestacao: "CIENCIA" }] }, take: 20 });
    for (const n of notas) if (await fazer(n.id, "CONFIRMADA", n.chave)) r.confirmacoes++;
  }
  if (c.cienciaAutomatica) {
    const notas = await prisma.notaRecebida.findMany({ where: { manifestacao: null, situacao: "AUTORIZADA", emissao: { gt: new Date(Date.now() - 170 * 86400000) } }, orderBy: { emissao: "asc" }, take: 20 });
    for (const n of notas) if (await fazer(n.id, "CIENCIA", n.chave)) r.ciencias++;
  }
  return r;
}
