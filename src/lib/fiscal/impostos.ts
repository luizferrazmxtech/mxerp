import { prisma } from "@/lib/db";
import { todasAsLojas } from "@/lib/empresa/loja";

/**
 * Imposto aproximado do Simples Nacional das notas emitidas: soma das notas autorizadas (produção) do mês,
 * separada pelo CNAE da atividade, × a alíquota efetiva que o contador informa para aquele CNAE no mês.
 * CNAE sem alíquota própria usa a linha "*" (demais atividades). É uma estimativa: o valor do DAS é o do PGDAS-D.
 */

export const mesAtual = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
export const mesAnterior = (comp: string) => {
  const [a, m] = comp.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
};
const limitesDoMes = (comp: string) => {
  const [a, m] = comp.split("-").map(Number);
  // meia-noite de São Paulo (UTC-3)
  return { de: new Date(Date.UTC(a, m - 1, 1, 3)), ate: new Date(Date.UTC(m === 12 ? a + 1 : a, m === 12 ? 0 : m, 1, 3)) };
};
export const soDigitos = (c: string | null | undefined) => (c ?? "").replace(/\D/g, "");

export async function aliquotasDoMes(empresaId: string, competencia: string) {
  return prisma.aliquotaSimples.findMany({ where: { empresaId, competencia }, orderBy: { cnae: "asc" } });
}

export type LinhaImposto = { cnae: string; descricao: string | null; notas: number; valor: number; aliquota: number | null; imposto: number };

export async function estimativaDoMes(empresaId: string, competencia: string) {
  const { de, ate } = limitesDoMes(competencia);
  const [empresa, aliquotas, notas, canceladas] = await Promise.all([
    prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } }),
    aliquotasDoMes(empresaId, competencia),
    todasAsLojas(() => prisma.notaFiscal.findMany({
      where: { empresaId, ambiente: "PRODUCAO", status: "AUTORIZADA", emitidaEm: { gte: de, lt: ate } },
      select: { cnae: true, valorTotal: true, modelo: true },
    })),
    todasAsLojas(() => prisma.notaFiscal.count({ where: { empresaId, ambiente: "PRODUCAO", status: "CANCELADA", emitidaEm: { gte: de, lt: ate } } })),
  ]);
  const porCnae = new Map<string, { notas: number; valor: number }>();
  for (const n of notas) {
    const c = soDigitos(n.cnae) || soDigitos(empresa.cnae) || "*";
    const g = porCnae.get(c) ?? { notas: 0, valor: 0 };
    g.notas++;
    g.valor += Number(n.valorTotal);
    porCnae.set(c, g);
  }
  const taxa = new Map(aliquotas.map((a) => [soDigitos(a.cnae) || "*", a]));
  const linhas: LinhaImposto[] = [...porCnae.entries()].map(([cnae, g]) => {
    const a = taxa.get(cnae) ?? taxa.get("*");
    const aliquota = a ? Number(a.aliquota) : null;
    return { cnae, descricao: taxa.get(cnae)?.descricao ?? null, notas: g.notas, valor: Math.round(g.valor * 100) / 100, aliquota, imposto: aliquota == null ? 0 : Math.round(g.valor * aliquota) / 100 };
  }).sort((a, b) => b.valor - a.valor);
  const porModelo = (m: string) => notas.filter((n) => n.modelo === m).reduce((s, n) => s + Number(n.valorTotal), 0);
  return {
    linhas,
    total: linhas.reduce((s, l) => s + l.valor, 0),
    imposto: Math.round(linhas.reduce((s, l) => s + l.imposto, 0) * 100) / 100,
    semAliquota: linhas.filter((l) => l.aliquota == null).map((l) => l.cnae),
    quantidade: notas.length, canceladas,
    porModelo: { NFE: porModelo("NFE"), NFCE: porModelo("NFCE"), NFSE: porModelo("NFSE") },
  };
}
