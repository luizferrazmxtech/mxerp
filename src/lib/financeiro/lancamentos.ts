import { Prisma, type OrigemDocumento } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { garantirPadroes } from "./padroes";
import { diaSP, somarDias } from "@/lib/datas";
import { LOJA_ATUAL, sqlDaEstrutura } from "@/lib/empresa/loja";

export type Pagamento = { formaPagamentoId: string; valor: number; parcelas?: number };

const D = (v: number) => new Prisma.Decimal(v.toFixed(2));

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
  const data = diaSP(args.data ?? new Date());
  const caixa = await tx.contaBancaria.findUniqueOrThrow({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: "Caixa" } } });
  for (const p of args.pagamentos) {
    const forma = await tx.formaPagamento.findUniqueOrThrow({ where: { id: p.formaPagamentoId } });
    const n = Math.max(1, p.parcelas ?? 1);
    const valores = dividirParcelas(p.valor, n);
    for (let i = 0; i < n; i++) {
      const vencimento = somarDias(data, forma.diasPrazo * (i + 1));
      const aVista = forma.diasPrazo === 0;
      // à vista cai na conta da forma (ex.: PIX do PagSeguro cai na conta PagSeguro); sem conta, no Caixa
      const conta = aVista && forma.contaBancariaId ? forma.contaBancariaId : caixa.id;
      await tx.lancamento.create({
        data: {
          tipo: "RECEBER",
          descricao: n > 1 ? `${args.descricao} (${i + 1}/${n})` : args.descricao,
          pessoaId: args.pessoaId ?? null,
          categoriaId: args.categoriaId,
          formaPagamentoId: forma.id,
          contaBancariaId: aVista ? conta : null,
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

/** O documento tem contas no financeiro (próprias ou agrupadas num título de agrupamento). */
export async function temContas(tx: Tx, origemTipo: OrigemDocumento, origemId: string) {
  return (await tx.lancamento.count({ where: { origemTipo, origemId } })) + (await tx.lancamentoAgrupado.count({ where: { origemTipo, origemId } })) > 0;
}

/** Remove os lançamentos em aberto de um documento (cancelamento). Recusa se já houver recebido. */
export async function cancelarRecebimentos(tx: Tx, origemTipo: OrigemDocumento, origemId: string, forcar = false) {
  // a conta foi agrupada com outras num título: só dá para mexer depois de desagrupar (senão o título fica errado)
  const agrupada = await tx.lancamentoAgrupado.findFirst({ where: { origemTipo, origemId }, select: { lancamento: { select: { descricao: true } } } });
  if (agrupada) throw new Error(`A conta a receber deste documento foi agrupada no título "${agrupada.lancamento.descricao}" do financeiro: desagrupe o título antes (Financeiro › abra o título › Desagrupar)`);
  const pagos = await tx.lancamento.count({ where: { origemTipo, origemId, pagoEm: { not: null } } });
  if (pagos && !forcar) throw new Error("Há parcelas já recebidas. Estorne o recebimento antes de cancelar.");
  await tx.lancamento.deleteMany({ where: { origemTipo, origemId } });
}

/** Mesmo dia N meses depois; se o mês não tem o dia (31/01 → fevereiro), cai no último dia do mês. */
export function somarMeses(d: Date, meses: number) {
  const ano = d.getUTCFullYear(), mes = d.getUTCMonth() + meses;
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(d.getUTCDate(), ultimo), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
}

/** Lançamento manual (conta a pagar/receber), com parcelas mensais. */
export async function criarLancamentos(
  tx: Tx,
  args: {
    tipo: "PAGAR" | "RECEBER";
    descricao: string;
    categoriaId: string;
    pessoaId?: string | null;
    valorTotal: number;
    parcelas?: number;
    primeiroVencimento: Date;
    competencia?: Date;
    formaPagamentoId?: string | null;
    contaBancariaId?: string | null;
    centroCustoId?: string | null;
    observacao?: string | null;
    pago?: boolean;
  },
) {
  if (!(args.valorTotal > 0)) throw new Error("Informe um valor maior que zero");
  const n = Math.max(1, args.parcelas ?? 1);
  const valores = dividirParcelas(args.valorTotal, n);
  const criados = [];
  for (let i = 0; i < n; i++) {
    const venc = somarMeses(args.primeiroVencimento, i);
    criados.push(
      await tx.lancamento.create({
        data: {
          tipo: args.tipo,
          descricao: n > 1 ? `${args.descricao} (${i + 1}/${n})` : args.descricao,
          categoriaId: args.categoriaId,
          pessoaId: args.pessoaId ?? null,
          formaPagamentoId: args.formaPagamentoId ?? null,
          contaBancariaId: args.contaBancariaId ?? null,
          centroCustoId: args.centroCustoId || null,
          observacao: args.observacao || null,
          valor: D(valores[i]),
          vencimento: venc,
          competencia: args.competencia ?? venc,
          parcela: i + 1,
          totalParcelas: n,
          pagoEm: args.pago && i === 0 ? venc : null,
          valorPago: args.pago && i === 0 ? D(valores[i]) : null,
        },
      }),
    );
  }
  return criados;
}

/** Registra o pagamento/recebimento de um lançamento. */
export async function baixarLancamento(
  tx: Tx,
  id: string,
  args: { data: Date; contaBancariaId: string; juros?: number; desconto?: number; valorPago?: number },
) {
  const l = await tx.lancamento.findUniqueOrThrow({ where: { id } });
  if (l.pagoEm) throw new Error("Lançamento já baixado");
  const juros = args.juros ?? 0;
  const desconto = args.desconto ?? 0;
  const valorPago = args.valorPago ?? Number(l.valor) + juros - desconto;
  return tx.lancamento.update({
    where: { id },
    data: { pagoEm: args.data, contaBancariaId: args.contaBancariaId, juros: D(juros), desconto: D(desconto), valorPago: D(valorPago) },
  });
}

export async function estornarLancamento(tx: Tx, id: string) {
  const l = await tx.lancamento.findUniqueOrThrow({ where: { id }, select: { transferenciaId: true } });
  if (l.transferenciaId) throw new Error("Isto é uma transferência entre contas: exclua a transferência em vez de estornar");
  return tx.lancamento.update({ where: { id }, data: { pagoEm: null, valorPago: null, juros: D(0), desconto: D(0) } });
}

/** Saldo atual de cada conta: saldo inicial + recebido - pago. */
export async function saldosContas(tx: Tx) {
  const daEmpresa = await sqlDaEstrutura(`c."empresaId"`);
  return tx.$queryRaw<{ id: string; nome: string; saldo: number }[]>`
    SELECT c.id, c.nome,
           (c."saldoInicial" + COALESCE(SUM(CASE WHEN l.tipo = 'RECEBER' THEN l."valorPago" ELSE -l."valorPago" END), 0))::float AS saldo
      FROM "ContaBancaria" c
      LEFT JOIN "Lancamento" l ON l."contaBancariaId" = c.id AND l."pagoEm" IS NOT NULL
     WHERE c.ativa ${daEmpresa}
     GROUP BY c.id ORDER BY c.nome`;
}
