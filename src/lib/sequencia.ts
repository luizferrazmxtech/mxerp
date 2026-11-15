import type { Tx } from "@/lib/db";

/** Próximo número de um contador (OS, VENDA, COMPRA, NFE-1...). Atômico. */
export async function proximoNumero(tx: Tx, chave: string): Promise<number> {
  const [r] = await tx.$queryRaw<{ valor: number }[]>`
    INSERT INTO "Sequencia" (chave, valor) VALUES (${chave}, 1)
    ON CONFLICT (chave) DO UPDATE SET valor = "Sequencia".valor + 1
    RETURNING valor`;
  return r.valor;
}
