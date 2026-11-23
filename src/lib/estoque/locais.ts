import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Local não tem empresa própria: é da empresa do seu depósito. A extensão do Prisma filtra Deposito pela loja atual,
 * então os locais da loja são os dos depósitos que ela enxerga. Use em toda tela que lista locais.
 */
export async function whereLocaisDaLoja(): Promise<Prisma.LocalWhereInput> {
  const ds = await prisma.deposito.findMany({ select: { id: true } });
  return { depositoId: { in: ds.map((d) => d.id) } };
}
