import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { numeroDaNota } from "@/lib/fiscal/numeroNota";

/**
 * Nome dos documentos ao imprimir/salvar em PDF (o navegador sugere o <title> da página e,
 * no PDF do boleto, o filename do Content-Disposition). Padrão pedido pelo Luiz (25/11/2026):
 *   "OS 7097 - NOME DO CLIENTE", "Venda 123 - NOME DO CLIENTE",
 *   "Boleto 45 - NOME DO CLIENTE - NOTA FISCAL 900 - Parcela 2/4" (nota e parcela só quando houver).
 */

/** Tira caracteres que o Windows não aceita em nome de arquivo e espaços repetidos. */
export function limparNome(s: string) {
  return s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
}

const compor = (tipo: string, numero: number | string, nome?: string | null) =>
  limparNome([`${tipo} ${numero}`, nome?.trim()].filter(Boolean).join(" - "));

/** Metadata com título absoluto (sem o " · MXTECH" do layout), que vira o nome do PDF. */
const titulo = (t: string | null, padrao: string): Metadata => ({ title: { absolute: t ?? padrao } });

type Chave = { id?: string; token?: string };
const onde = (k: Chave) => (k.id ? { id: k.id } : { token: k.token! });

export async function nomeOs(k: Chave) {
  const o = await prisma.ordemServico.findUnique({ where: onde(k), select: { numero: true, cliente: { select: { nome: true } } } }).catch(() => null);
  return o ? compor("OS", o.numero, o.cliente?.nome) : null;
}
export async function nomeVenda(k: Chave) {
  const v = await prisma.venda.findUnique({ where: onde(k), select: { numero: true, cliente: { select: { nome: true } } } }).catch(() => null);
  return v ? compor("Venda", v.numero, v.cliente?.nome) : null;
}
export async function nomeOrcamento(k: Chave) {
  const o = await prisma.orcamento.findUnique({ where: onde(k), select: { numero: true, cliente: { select: { nome: true } } } }).catch(() => null);
  return o ? compor("Orçamento", o.numero, o.cliente?.nome) : null;
}
export async function nomeCompra(id: string) {
  const c = await prisma.compra.findUnique({ where: { id }, select: { numero: true, fornecedor: { select: { nome: true } } } }).catch(() => null);
  return c ? compor("Compra", c.numero, c.fornecedor?.nome) : null;
}

export const tituloOs = async (k: Chave, padrao = "Imprimir OS") => titulo(await nomeOs(k), padrao);
export const tituloVenda = async (k: Chave, padrao = "Imprimir venda") => titulo(await nomeVenda(k), padrao);
export const tituloOrcamento = async (k: Chave, padrao = "Imprimir orçamento") => titulo(await nomeOrcamento(k), padrao);
export const tituloCompra = async (id: string) => titulo(await nomeCompra(id), "Imprimir compra");

/** Nome do PDF do boleto (sem a extensão). */
export async function nomeBoleto(boletoId: string) {
  const b = await prisma.boleto.findUnique({
    where: { id: boletoId },
    select: { seuNumero: true, lancamento: { select: { empresaId: true, parcela: true, totalParcelas: true, origemTipo: true, origemId: true, pessoa: { select: { nome: true } } } } },
  });
  if (!b) return null;
  const l = b.lancamento;
  const partes = [`Boleto ${b.seuNumero}`];
  if (l?.pessoa?.nome) partes.push(l.pessoa.nome.trim());
  if (l?.origemTipo && l.origemId) {
    const notas = await prisma.notaFiscal.findMany({
      where: { origemTipo: l.origemTipo, origemId: l.origemId, status: { in: ["AUTORIZADA", "ENVIADA"] }, ambiente: "PRODUCAO" },
      select: { numero: true, numeroNfse: true, modelo: true, empresaId: true }, orderBy: { numero: "asc" },
    });
    // OS com serviços faturados por outra empresa: a conta de cada empresa cita a nota dela
    const daEmpresa = notas.filter((n) => n.empresaId === l.empresaId);
    const usar = daEmpresa.length ? daEmpresa : notas;
    if (usar.length) partes.push(`NOTA FISCAL ${[...new Set(usar.map(numeroDaNota))].join(", ")}`);
  }
  if (l && l.totalParcelas > 1) partes.push(`Parcela ${l.parcela}/${l.totalParcelas}`);
  return limparNome(partes.join(" - "));
}

/** Content-Disposition com o nome acentuado (filename*) e um reserva só ASCII (filename). */
export function disposicao(nome: string, modo: "inline" | "attachment" = "inline") {
  const arquivo = `${nome}.pdf`;
  const ascii = arquivo.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return `${modo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(arquivo)}`;
}
