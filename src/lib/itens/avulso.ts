import type { Tx } from "@/lib/db";

/**
 * Item avulso: linha de orçamento/venda digitada na hora, sem cadastro de produto.
 * A linha aponta para este produto de sistema (não movimenta estoque, inativo, fora das listas
 * e buscas) e guarda a descrição digitada em `descricao`.
 */
export const CODIGO_AVULSO = "ITEM-AVULSO";

export async function produtoAvulsoId(tx: Tx) {
  const p = await tx.produto.upsert({
    where: { codigo: CODIGO_AVULSO },
    update: {},
    create: { codigo: CODIGO_AVULSO, nome: "Item avulso", unidade: "UN", controlaEstoque: false, vendePdv: false, ativo: false },
    select: { id: true },
  });
  return p.id;
}

/** Nome que aparece na tela, impressão e nota: a descrição digitada do item avulso ou o nome do produto. */
export const nomeItem = (l: { descricao?: string | null; produto: { nome: string } }) => l.descricao?.trim() || l.produto.nome;

/**
 * OS com item avulso serve como orçamento de conclusão, mas não pode ser concluída/faturada (nem gerar nota ou conta):
 * devolve a mensagem de bloqueio quando a OS ainda tem item avulso, ou null.
 */
export async function bloqueioAvulsoOs(tx: Tx, osId: string, acao = "concluir ou faturar a OS") {
  const avulsos = await tx.osItemProduto.findMany({
    where: { osId, OR: [{ descricao: { not: null } }, { produto: { codigo: CODIGO_AVULSO } }] },
    select: { descricao: true }, orderBy: [{ ordem: "asc" }, { createdAt: "asc" }],
  });
  if (!avulsos.length) return null;
  const nomes = avulsos.map((a) => a.descricao?.trim() || "Item avulso").join(", ");
  return `A OS tem ${avulsos.length === 1 ? "item avulso" : `${avulsos.length} itens avulsos`} (${nomes}): troque pelo produto cadastrado antes de ${acao}`;
}
