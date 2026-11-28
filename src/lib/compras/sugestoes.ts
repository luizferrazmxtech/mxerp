import { prisma } from "@/lib/db";
import type { ProdutoSugerido } from "./tipos";

/**
 * Produtos do cadastro parecidos com um item da nota do fornecedor, para o item que não se ligou sozinho
 * (código do fornecedor, código de barras, código ou nome exato). Compara as palavras da descrição
 * (sem acento, sem palavras curtas) e dá um empurrão quando o NCM é o mesmo.
 */

const PARADAS = new Set(["COM", "PARA", "DE", "DA", "DO", "DAS", "DOS", "EM", "SEM", "UND", "UNID", "PCT", "PCS", "CX", "CAIXA", "TIPO", "COR", "MOD"]);

/** Palavras que identificam o item: maiúsculas, sem acento, sem pontuação, 2+ letras ou com número. */
export function palavras(s: string) {
  return [...new Set(s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    // RJ-45, CAT.6 e 2/0 viram RJ45, CAT6 e 20, como costuma estar no cadastro
    .replace(/([A-Z0-9])[-./]+(?=[A-Z0-9])/g, "$1").replace(/[^A-Z0-9]+/g, " ").split(" ")
    .filter((p) => p && !PARADAS.has(p) && (p.length >= 3 || /\d/.test(p))))];
}

/** Quanto as duas descrições se parecem (0 a 1): palavras em comum sobre as palavras do item da nota, com peso para números (CAT6, 305, 2,5). */
export function semelhanca(nota: string, produto: string) {
  const a = palavras(nota), b = new Set(palavras(produto));
  if (!a.length || !b.size) return 0;
  const peso = (p: string) => (/\d/.test(p) ? 1.5 : 1);
  const total = a.reduce((s, p) => s + peso(p), 0);
  const comum = a.filter((p) => b.has(p) || [...b].some((q) => q.length >= 4 && p.length >= 4 && (q.startsWith(p) || p.startsWith(q)))).reduce((s, p) => s + peso(p), 0);
  // produto com muitas palavras a mais também é menos parecido
  return (comum / total) * Math.min(1, (a.length + 2) / Math.max(a.length, b.size));
}

export async function produtosParecidos(nome: string, ncm: string, limite = 4): Promise<ProdutoSugerido[]> {
  const ps = palavras(nome).sort((x, y) => y.length - x.length).slice(0, 5);
  if (!ps.length) return [];
  const candidatos = await prisma.produto.findMany({
    where: { ativo: true, OR: [...ps.map((p) => ({ nome: { contains: p, mode: "insensitive" as const } })), ...(ncm ? [{ ncm }] : [])] },
    select: { id: true, codigo: true, nome: true, unidade: true, unidadeCompra: true, fatorConversao: true, custo: true, ncm: true },
    take: 300,
  });
  return candidatos
    .map((p) => {
      const s = semelhanca(nome, p.nome) + (ncm && p.ncm === ncm ? 0.15 : 0);
      return { p, s };
    })
    .filter((x) => x.s >= 0.35)
    .sort((x, y) => y.s - x.s)
    .slice(0, limite)
    .map(({ p, s }) => ({
      id: p.id, codigo: p.codigo, nome: p.nome, unidade: p.unidade, unidadeCompra: p.unidadeCompra, fatorConversao: Number(p.fatorConversao), custo: Number(p.custo), ncm: p.ncm,
      motivo: `${Math.min(99, Math.round(s * 100))}% parecido${ncm && p.ncm === ncm ? ", mesmo NCM" : ""}`,
    }));
}
