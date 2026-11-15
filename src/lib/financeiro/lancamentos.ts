import { Prisma, type OrigemDocumento } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { garantirPadroes } from "./padroes";

export type Pagamento = { formaPagamentoId: string; valor: number; parcelas?: number };

const D = (v: number) => new Prisma.Decimal(v.toFixed(2));
const somarDias = (d: Date, dias: number) => new Date(d.getTime() + dias * 86400000);

/** Divide em parcelas com centavos na primeira, para fechar o total exato. */
export function dividirParcelas(valor: number, n: number): number[] {
  const centavos = Math.round(valor * 100);
  const base = Math.floor(centavos / n);
  const resto = centavos - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i === 0 ? resto : 0)) / 100);
}

/**
 * Gera contas a receber de um documento. Formas à vista (prazo 0) já entram
 * como recebidas no Caixa; as demais vencem a cada `diasPrazo`.
 */
export async function gerarRecebimentos(
  tx: Tx,
  args: {
    origemTipo: OrigemDocumento;
    origemId: string;
    pessoaId?: string | null;
    descricao: string;
    categoriaId: string;
    pagamentos: Pagamento[];
    data?: Date;
  },
) {
  await garantirPadroes(tx);
  const data = args.data ?? new Date();
  const caixa = await tx.contaBancaria.findUniqueOrThrow({ where: { nome: "Caixa" } });
  for (const p of args.pagamentos) {
    const forma = await tx.formaPagamento.findUniqueOrThrow({ where: { id: p.formaPagamentoId } });
    const n = Math.max(1, p.parcelas ?? 1);
    const valores = dividirParcelas(p.valor, n);
    for (let i = 0; i < n; i++) {
      const vencimento = somarDias(data, forma.diasPrazo * (i + 1));
      const aVista = forma.diasPrazo === 0;
      await tx.lancamento.create({
        data: {
          tipo: "RECEBER",
          descricao: n > 1 ? `${args.descricao} (${i + 1}/${n})` : args.descricao,
          pessoaId: args.pessoaId ?? null,
          categoriaId: args.categoriaId,
          formaPagamentoId: forma.id,
          contaBancariaId: aVista ? caixa.id : null,
          valor: D(valores[i]),
          vencimento,
          competencia: data,
          pagoEm: aVista ? data : null,
          valorPago: aVista ? D(valores[i]) : null,
          parcela: i + 1,
          totalParcelas: n,
          origemTipo: args.origemTipo,
          origemId: args.origemId,
        },
      });
    }
  }
}

/** Remove os lançamentos em aberto de um documento (cancelamento). Recusa se já houver recebido. */
export async function cancelarRecebimentos(tx: Tx, origemTipo: OrigemDocumento, origemId: string, forcar = false) {
  const pagos = await tx.lancamento.count({ where: { origemTipo, origemId, pagoEm: { not: null } } });
  if (pagos && !forcar) throw new Error("Há parcelas já recebidas. Estorne o recebimento antes de cancelar.");
  await tx.lancamento.deleteMany({ where: { origemTipo, origemId } });
}
