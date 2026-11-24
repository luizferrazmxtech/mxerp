import { Prisma } from "@prisma/client";
import { dividirDesconto } from "@/lib/fiscal/desconto";

/**
 * Serviços da OS faturados por outra empresa do grupo (pedido do Luiz, 24/11/2026): a OS é da MXTECH (peças e
 * serviços), mas a mão de obra pode sair pela VFX INFO SERVICE (só serviços, alíquota menor). Nesse caso:
 *  - a NFS-e dos serviços sai pelo CNPJ/certificado da VFX e a NF-e das peças continua pela MXTECH;
 *  - cada parcela da OS vira duas contas a receber: a parte das peças (com frete e outros) na MXTECH e a dos
 *    serviços na VFX (plano de contas, forma de pagamento, centro de custo e Inter/boleto da VFX);
 *  - a OS continua só nas listas da MXTECH; na VFX aparece só a conta a receber, com o link para a OS.
 */

const r2 = (v: number) => Math.round(v * 100) / 100;

type Totais = { totalProdutos: Prisma.Decimal | number; totalServicos: Prisma.Decimal | number; desconto: Prisma.Decimal | number; total: Prisma.Decimal | number };

/** Empresa que fatura os serviços, quando é outra que não a da OS (null = tudo pela empresa da OS). */
export const empresaDosServicos = (o: { empresaId: string | null; empresaServicosId: string | null }) =>
  o.empresaServicosId && o.empresaServicosId !== o.empresaId ? o.empresaServicosId : null;

/** Valor dos serviços já com a parte deles no desconto geral (o mesmo da NFS-e). */
export function valorServicos(o: Omit<Totais, "total">) {
  const p = Number(o.totalProdutos), s = Number(o.totalServicos);
  return r2(Math.max(0, s) - dividirDesconto(p, s, Number(o.desconto)).servicos);
}

/** Divide a OS: serviços (com a parte do desconto) e o resto (peças, frete e outros). */
export function divisaoOs(o: Totais) {
  const total = Number(o.total);
  const servicos = Math.min(total, Math.max(0, valorServicos(o)));
  return { servicos, pecas: r2(total - servicos), total };
}

/**
 * Parte dos serviços em cada parcela, na proporção do valor da parcela; a última fecha a conta (os centavos do
 * arredondamento) para a soma bater com o valor dos serviços.
 */
export function servicosPorParcela(parcelas: { valor: Prisma.Decimal | number }[], servicos: number, total: number) {
  if (!parcelas.length || !(total > 0) || !(servicos > 0)) return parcelas.map(() => 0);
  const partes = parcelas.map((p) => r2((Number(p.valor) * servicos) / total));
  partes[partes.length - 1] = r2(servicos - partes.slice(0, -1).reduce((s, x) => s + x, 0));
  return partes.map((x, i) => Math.min(Math.max(0, x), Number(parcelas[i].valor)));
}

/**
 * SQL do valor dos serviços faturados por outra empresa (0 quando a OS fatura tudo). `o` = apelido da OrdemServico.
 * Para os relatórios separarem o faturamento: a empresa da OS fica com total − isto; a dos serviços, com isto.
 */
export const sqlServicosFora = (o = "o") => Prisma.raw(
  `(CASE WHEN ${o}."empresaServicosId" IS NOT NULL AND ${o}."empresaServicosId" IS DISTINCT FROM ${o}."empresaId" THEN ` +
  `ROUND((GREATEST(${o}."totalServicos", 0) - COALESCE(${o}."desconto", 0) * GREATEST(${o}."totalServicos", 0) / NULLIF(GREATEST(${o}."totalProdutos", 0) + GREATEST(${o}."totalServicos", 0), 0))::numeric, 2) ELSE 0 END)`,
);
