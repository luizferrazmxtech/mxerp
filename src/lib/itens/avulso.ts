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
