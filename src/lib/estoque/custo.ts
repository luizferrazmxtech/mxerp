import { Prisma } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { configEstoque } from "./config";

/**
 * Atualiza o custo do produto por uma entrada (compra ou entrada manual), pela regra das configurações de estoque:
 * MEDIA = média ponderada com o saldo atual, ULTIMA = custo desta entrada, NAO = não mexe.
 * Quantidade e custo já na unidade do produto (depois da conversão). Chamar ANTES de dar a entrada no saldo.
 */
export async function atualizarCustoPorEntrada(tx: Tx, produtoId: string, quantidade: number, custo: number, regra?: "MEDIA" | "ULTIMA" | "NAO") {
  regra ??= (await configEstoque()).custoCompra;
  if (regra === "NAO" || !(custo > 0) || !(quantidade > 0)) return null;
  let novo = custo;
  if (regra === "MEDIA") {
    const p = await tx.produto.findUniqueOrThrow({ where: { id: produtoId }, select: { custo: true } });
    const [s] = await tx.$queryRaw<{ q: number | null }[]>`SELECT COALESCE(SUM(quantidade), 0)::float AS q FROM "Saldo" WHERE "produtoId" = ${produtoId}`;
    const atual = Math.max(0, Number(s?.q ?? 0));
    // custo zerado (ex.: produto migrado sem custo) não puxa a média para baixo
    novo = atual > 0 && Number(p.custo) > 0 ? (atual * Number(p.custo) + quantidade * custo) / (atual + quantidade) : custo;
  }
  await tx.produto.update({ where: { id: produtoId }, data: { custo: new Prisma.Decimal(novo.toFixed(4)) } });
  return novo;
}
