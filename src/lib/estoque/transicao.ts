import type { OrigemDocumento } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { baixarDocumento, cobrirFaltas, estornarBaixa, liberarDocumento, reservarItem } from "./estoque";

export type EstadoEstoque = "RESERVADO" | "BAIXADO" | "LIVRE";

/** localId: item que sai de um local fixo (o carro do técnico). */
export type ItemDoc = { id: string; produtoId: string; quantidade: number; localId?: string | null };

/**
 * Aplica a mudança de "estado de estoque" de um documento (OS, venda):
 *  reservado → baixado : baixa (sai das prateleiras reservadas)
 *  reservado → livre   : libera as reservas
 *  baixado   → reservado: estorna e reserva de novo
 *  baixado   → livre   : estorna
 *  livre     → reservado: reserva todos os itens
 *  livre     → baixado : reserva e baixa
 */
export async function transicionarEstoque(
  tx: Tx,
  origemTipo: OrigemDocumento,
  origemId: string,
  de: EstadoEstoque,
  para: EstadoEstoque,
  itens: () => Promise<ItemDoc[]>,
  opts: { permitirNegativo?: boolean; usuarioId?: string } = {},
) {
  if (de === para) return;
  const reservarTodos = async () => {
    for (const i of await itens())
      await reservarItem(tx, { produtoId: i.produtoId, quantidade: i.quantidade, localId: i.localId, origemTipo, origemId, origemItemId: i.id });
  };

  if (de === "RESERVADO" && para === "BAIXADO") {
    await baixarDocumento(tx, origemTipo, origemId, opts);
  } else if (de === "RESERVADO" && para === "LIVRE") {
    await liberarDocumento(tx, origemTipo, origemId);
  } else if (de === "BAIXADO" && para === "RESERVADO") {
    const afetados = await estornarBaixa(tx, origemTipo, origemId, { usuarioId: opts.usuarioId, cobrirFaltas: false });
    await reservarTodos();
    for (const p of afetados) await cobrirFaltas(tx, p);
  } else if (de === "BAIXADO" && para === "LIVRE") {
    await estornarBaixa(tx, origemTipo, origemId, { usuarioId: opts.usuarioId });
  } else if (de === "LIVRE" && para === "RESERVADO") {
    await reservarTodos();
  } else if (de === "LIVRE" && para === "BAIXADO") {
    await reservarTodos();
    await baixarDocumento(tx, origemTipo, origemId, opts);
  }
}
