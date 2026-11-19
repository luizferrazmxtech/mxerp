import type { AmbienteFiscal, ModeloNota } from "@prisma/client";
import { prisma } from "@/lib/db";
import { proximoNumero } from "@/lib/sequencia";
import { certificadoDoAmbiente } from "./certificado";
import { ClienteSefaz } from "./sefaz";
import { chaveSeq, empresa, FiscalError, type Dependencias } from "./emissao";

/** Situações em que o número foi de fato usado na SEFAZ (não pode ser inutilizado). */
const USADO = ["AUTORIZADA", "CANCELADA", "DENEGADA", "ENVIADA"] as const;

export type Faixa = { inicio: number; fim: number; notas: { id: string; numero: number; status: string; motivo: string | null }[] };

/**
 * Números já reservados pelo sistema (até o contador da série) que não viraram nota válida e ainda não foram
 * inutilizados: notas rejeitadas, assinadas e não enviadas, ou números pulados. A SEFAZ exige inutilizar esses
 * números (até o dia 10 do mês seguinte) para a sequência não ficar com buracos.
 */
export async function numerosPendentes(modelo: "NFE" | "NFCE", serie: number, ambiente: AmbienteFiscal): Promise<Faixa[]> {
  const amb = ambiente === "PRODUCAO" ? 1 : 2;
  const seq = await prisma.sequencia.findUnique({ where: { chave: chaveSeq(modelo === "NFCE" ? 65 : 55, serie, amb) } });
  if (!seq) return [];
  const notas = await prisma.notaFiscal.findMany({ where: { modelo, serie, ambiente }, select: { id: true, numero: true, status: true, motivo: true } });
  if (!notas.length) return [];
  const inicio = Math.min(...notas.map((n) => n.numero));
  const usados = new Set(notas.filter((n) => (USADO as readonly string[]).includes(n.status) || n.status === "INUTILIZADA").map((n) => n.numero));
  const inut = await prisma.inutilizacaoNumeracao.findMany({ where: { modelo, serie, ambiente, status: "HOMOLOGADA" } });
  const ja = (n: number) => inut.some((i) => n >= i.numeroInicial && n <= i.numeroFinal);
  const porNumero = new Map(notas.map((n) => [n.numero, n]));
  const faixas: Faixa[] = [];
  for (let n = inicio; n <= seq.valor; n++) {
    if (usados.has(n) || ja(n)) continue;
    const ult = faixas.at(-1);
    const nota = porNumero.get(n);
    if (ult && ult.fim === n - 1) { ult.fim = n; if (nota) ult.notas.push(nota); }
    else faixas.push({ inicio: n, fim: n, notas: nota ? [nota] : [] });
  }
  return faixas;
}

export async function inutilizarNumeracao(
  p: { modelo: "NFE" | "NFCE"; serie: number; inicio: number; fim: number; justificativa: string; usuarioId?: string },
  deps: Dependencias = {},
) {
  if (!(Number.isInteger(p.inicio) && Number.isInteger(p.fim) && p.inicio >= 1 && p.fim >= p.inicio)) throw new FiscalError("Informe a faixa: número inicial e final");
  if (p.justificativa.trim().length < 15) throw new FiscalError("Justificativa precisa de pelo menos 15 caracteres");
  const e = await empresa();
  const amb: 1 | 2 = e.ambienteFiscal === "PRODUCAO" ? 1 : 2;
  const ambiente: AmbienteFiscal = amb === 1 ? "PRODUCAO" : "HOMOLOGACAO";
  const mod = p.modelo === "NFCE" ? 65 : 55;
  const seq = await prisma.sequencia.findUnique({ where: { chave: chaveSeq(mod, p.serie, amb) } });
  // número ainda não reservado seria usado depois pelo sistema e a nota seria rejeitada (número inutilizado)
  if (!seq || p.fim > seq.valor) throw new FiscalError(`O último número usado na série ${p.serie} é ${seq?.valor ?? 0}: não dá para inutilizar números que o sistema ainda vai usar`);
  const usadas = await prisma.notaFiscal.findMany({ where: { modelo: p.modelo, serie: p.serie, ambiente, numero: { gte: p.inicio, lte: p.fim }, status: { in: [...USADO] } } });
  if (usadas.length) throw new FiscalError(`A faixa tem nota ${usadas.map((n) => `nº ${n.numero} (${n.status.toLowerCase()})`).join(", ")}: só números sem nota válida podem ser inutilizados`);
  const sobrepoe = await prisma.inutilizacaoNumeracao.findFirst({ where: { modelo: p.modelo, serie: p.serie, ambiente, status: "HOMOLOGADA", numeroInicial: { lte: p.fim }, numeroFinal: { gte: p.inicio } } });
  if (sobrepoe) throw new FiscalError(`Os números ${sobrepoe.numeroInicial} a ${sobrepoe.numeroFinal} já foram inutilizados`);

  const agora = deps.agora ?? new Date();
  const r = await new ClienteSefaz(deps.cert ?? certificadoDoAmbiente(), e.uf!, amb, deps.transporte).inutilizar({
    modelo: mod, serie: p.serie, inicio: p.inicio, fim: p.fim, justificativa: p.justificativa, cnpj: e.cnpj,
    ano: Number(agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 4)),
  });
  return prisma.$transaction(async (tx) => {
    const reg = await tx.inutilizacaoNumeracao.create({
      data: {
        modelo: p.modelo, serie: p.serie, ambiente, numeroInicial: p.inicio, numeroFinal: p.fim, justificativa: p.justificativa.trim(),
        status: r.ok ? "HOMOLOGADA" : "REJEITADA", protocolo: r.protocolo, motivo: `${r.cStat} - ${r.xMotivo}`, xml: r.xml, usuarioId: p.usuarioId ?? null,
      },
    });
    if (r.ok)
      await tx.notaFiscal.updateMany({
        where: { modelo: p.modelo, serie: p.serie, ambiente, numero: { gte: p.inicio, lte: p.fim }, status: { in: ["REJEITADA", "RASCUNHO", "ASSINADA"] } },
        data: { status: "INUTILIZADA", motivo: `Número inutilizado (protocolo ${r.protocolo ?? "—"})` },
      });
    return reg;
  });
}

/** Carta de correção (CC-e) de uma NF-e autorizada. Cada nova carta substitui a anterior e precisa trazer todas as correções. */
export async function cartaCorrecao(notaId: string, correcao: string, deps: Dependencias = {}) {
  const n = await prisma.notaFiscal.findUniqueOrThrow({ where: { id: notaId }, include: { eventos: { where: { tipo: "110110" } } } });
  if ((n.modelo as ModeloNota) !== "NFE") throw new FiscalError("Carta de correção só existe para NF-e (modelo 55)");
  if (n.status !== "AUTORIZADA" || !n.chave) throw new FiscalError("Só é possível corrigir NF-e autorizada");
  const sequencia = n.eventos.reduce((m, ev) => Math.max(m, ev.sequencia), 0) + 1;
  if (sequencia > 20) throw new FiscalError("Esta nota já tem 20 cartas de correção (o limite da SEFAZ)");
  const e = await empresa();
  const amb: 1 | 2 = n.ambiente === "PRODUCAO" ? 1 : 2;
  const idLote = await prisma.$transaction((tx) => proximoNumero(tx, "LOTE-EVENTO"));
  const r = await new ClienteSefaz(deps.cert ?? certificadoDoAmbiente(), e.uf!, amb, deps.transporte).cartaCorrecao({
    chave: n.chave, correcao, sequencia, cnpj: e.cnpj, idLote, data: deps.agora,
  });
  if (!r.ok) throw new FiscalError(`SEFAZ recusou a carta de correção: ${r.cStat} - ${r.xMotivo}`);
  return prisma.notaEvento.create({ data: { notaId, tipo: "110110", sequencia, texto: correcao.trim(), xml: r.eventoXml + (r.retornoXml ?? ""), protocolo: r.protocolo } });
}
