import { Prisma, type OrigemDocumento } from "@prisma/client";
import { prisma } from "@/lib/db";
import { lojaAtualId } from "@/lib/empresa/loja";
import { documentoDe, documentosDosMovimentos, type DocumentoOrigem } from "./origens";

/**
 * De onde veio o que está no carro: os movimentos do kardex nos locais do carro, com o documento de cada um
 * (compra, transferência/abastecer, OS, venda, ajuste), e o saldo de cada produto separado por tipo de documento.
 */

/** Carro (depósito de uma equipe) da loja atual; null se não existe ou é de outra empresa. */
export async function carroDaLoja(depositoId: string) {
  const d = await prisma.deposito.findFirst({
    where: { id: depositoId, equipeId: { not: null } },
    select: { id: true, nome: true, empresaId: true, equipeId: true, equipe: { select: { nome: true } } },
  });
  if (!d) return null;
  const loja = await lojaAtualId();
  if (loja && d.empresaId && d.empresaId !== loja) return null; // nunca mostrar o carro de outra empresa
  return d;
}

/** Grupos mostrados nas colunas "de onde veio". */
export const GRUPOS_ORIGEM = [
  { chave: "COMPRA", rotulo: "Compras" },
  { chave: "TRANSFERENCIA", rotulo: "Transferências" },
  { chave: "OS", rotulo: "OS e vendas" },
  { chave: "AJUSTE", rotulo: "Ajustes" },
  { chave: "OUTROS", rotulo: "Outros" },
] as const;
export type GrupoOrigem = (typeof GRUPOS_ORIGEM)[number]["chave"];

export function grupoDaOrigem(t: OrigemDocumento): GrupoOrigem {
  if (t === "COMPRA" || t === "TRANSFERENCIA" || t === "AJUSTE") return t;
  if (t === "OS" || t === "VENDA" || t === "DEVOLUCAO") return "OS";
  return "OUTROS"; // implantação (saldo inicial da migração)
}

/** Saldo líquido (entradas − saídas) de cada produto no carro, por grupo de documento: produtoId → grupo → quantidade. */
export async function origemDoSaldo(depositoId: string) {
  const rows = await prisma.$queryRaw<{ produtoId: string; origemTipo: OrigemDocumento; liquido: Prisma.Decimal; ultima: Date }[]>`
    SELECT m."produtoId", m."origemTipo",
           SUM(CASE WHEN m.tipo = 'ENTRADA' THEN m.quantidade ELSE -m.quantidade END) liquido, MAX(m."createdAt") ultima
      FROM "MovimentoEstoque" m JOIN "Local" l ON l.id = m."localId"
     WHERE l."depositoId" = ${depositoId}
     GROUP BY m."produtoId", m."origemTipo"`;
  const mapa = new Map<string, { grupos: Partial<Record<GrupoOrigem, number>>; ultima: Date }>();
  for (const r of rows) {
    const g = grupoDaOrigem(r.origemTipo);
    const atual = mapa.get(r.produtoId) ?? { grupos: {}, ultima: r.ultima };
    atual.grupos[g] = Math.round(((atual.grupos[g] ?? 0) + Number(r.liquido)) * 10000) / 10000;
    if (r.ultima > atual.ultima) atual.ultima = r.ultima;
    mapa.set(r.produtoId, atual);
  }
  return mapa;
}

export type MovimentoCarro = {
  id: string; data: Date; entrada: boolean; quantidade: number; origemTipo: OrigemDocumento; doc?: DocumentoOrigem;
  produtoId: string; codigo: string; produto: string; unidade: string; local: string; usuario: string; observacao: string;
  /** saldo do produto no carro logo depois do movimento (só quando a lista é de um produto) */
  saldoDepois?: number;
};

/** Movimentos nos locais do carro, do mais novo para o mais antigo, com o documento de cada um. */
export async function movimentosDoCarro(depositoId: string, f: { produtoId?: string; de?: Date; ate?: Date; take?: number } = {}) {
  const where: Prisma.MovimentoEstoqueWhereInput = {
    local: { depositoId }, ...(f.produtoId ? { produtoId: f.produtoId } : {}),
    ...(f.de || f.ate ? { createdAt: { ...(f.de ? { gte: f.de } : {}), ...(f.ate ? { lt: f.ate } : {}) } } : {}),
  };
  const [lista, total] = await Promise.all([
    prisma.movimentoEstoque.findMany({
      where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: f.take ?? 300,
      include: { local: { select: { codigo: true } }, usuario: { select: { nome: true } }, produto: { select: { codigo: true, nome: true, unidade: true } } },
    }),
    prisma.movimentoEstoque.count({ where }),
  ]);
  const docs = await documentosDosMovimentos(lista);
  const linhas: MovimentoCarro[] = lista.map((m) => ({
    id: m.id, data: m.createdAt, entrada: m.tipo === "ENTRADA", quantidade: Number(m.quantidade), origemTipo: m.origemTipo, doc: documentoDe(docs, m),
    produtoId: m.produtoId, codigo: m.produto.codigo, produto: m.produto.nome, unidade: m.produto.unidade, local: m.local.codigo,
    usuario: m.usuario?.nome ?? "", observacao: m.observacao ?? "",
  }));
  // saldo corrido de um produto: parte do saldo de hoje e desfaz os movimentos mais novos
  if (f.produtoId && !f.ate) {
    const s = await prisma.saldo.aggregate({ where: { produtoId: f.produtoId, local: { depositoId } }, _sum: { quantidade: true } });
    let saldo = Number(s._sum.quantidade ?? 0);
    for (const l of linhas) {
      l.saldoDepois = Math.round(saldo * 10000) / 10000;
      saldo += l.entrada ? -l.quantidade : l.quantidade;
    }
  }
  return { linhas, total };
}
