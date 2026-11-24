import { Prisma, type FormaPagamento, type Lancamento } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { LOJA_ATUAL } from "@/lib/empresa/loja";
import { categoria } from "./padroes";
import { calcularTaxa, pct, tipoCartao, temTabela, type CalculoTaxa } from "./taxasCartao";

const D = (v: number) => new Prisma.Decimal(v.toFixed(2));
const TARIFAS = "Tarifas bancárias e taxas de cartão";

/**
 * Plano de contas da taxa: o escolhido na forma; senão "<conta de destino> taxas" (ex.: "PagSeguro taxas"), criado
 * na hora como filho de "Tarifas bancárias e taxas de cartão"; sem conta de destino, a própria Tarifas.
 */
export async function categoriaDaTaxa(tx: Tx, forma: Pick<FormaPagamento, "categoriaTaxaId" | "contaBancariaId">) {
  if (forma.categoriaTaxaId) {
    const c = await tx.categoriaFinanceira.findUnique({ where: { id: forma.categoriaTaxaId } });
    if (c) return c.id;
  }
  const pai = await categoria(tx, TARIFAS, "PAGAR");
  const conta = forma.contaBancariaId ? await tx.contaBancaria.findUnique({ where: { id: forma.contaBancariaId }, select: { nome: true } }) : null;
  if (!conta || conta.nome === "Caixa") return pai.id;
  const nome = `${conta.nome} taxas`;
  const existe = await tx.categoriaFinanceira.findUnique({ where: { empresaId_nome_tipo: { empresaId: LOJA_ATUAL, nome, tipo: "PAGAR" } } });
  if (existe) return existe.id;
  let codigo: string | null = null;
  if (pai.codigo) {
    const irmas = await tx.categoriaFinanceira.findMany({ where: { paiId: pai.id }, select: { codigo: true } });
    const usados = new Set(irmas.map((i) => i.codigo));
    for (let k = 1; k < 100 && !codigo; k++) { const c = `${pai.codigo}.${String(k).padStart(2, "0")}`; if (!usados.has(c)) codigo = c; }
  }
  return (await tx.categoriaFinanceira.create({ data: { nome, tipo: "PAGAR", grupoDre: "DESPESA_FINANCEIRA", paiId: pai.id, codigo } })).id;
}

/** A forma cobra taxa? (cartão com tabela, ou taxa fixa maior que zero) */
export const cobraTaxa = (f: Pick<FormaPagamento, "tPag" | "taxa" | "taxas">) => (tipoCartao(f.tPag) && temTabela(f.taxas)) || Number(f.taxa) > 0;

/** Cartão com tabela: o prazo vem do grupo da bandeira (antecipação), não das parcelas. */
export const usaTabela = (f: Pick<FormaPagamento, "tPag" | "taxas">) => !!tipoCartao(f.tPag) && temTabela(f.taxas);

export function calculoDaForma(f: FormaPagamento, valor: number, bandeira?: string | null, vezes?: number | null): CalculoTaxa {
  return calcularTaxa({ tPag: f.tPag, taxa: Number(f.taxa), diasPrazo: f.diasPrazo, taxas: f.taxas }, valor, bandeira, vezes);
}

/**
 * Lança a taxa de uma conta a receber como despesa ligada a ela (taxaDeId): mesmo vencimento, mesma conta e, se
 * a conta a receber já entrou como recebida, já paga. Assim a conta de destino fica com o líquido e a taxa aparece
 * no plano de contas da taxa ("PagSeguro taxas"). A taxa some junto se a conta a receber for excluída.
 */
export async function lancarTaxa(tx: Tx, receb: Lancamento, forma: FormaPagamento, calc: CalculoTaxa) {
  if (!(calc.taxa > 0) || receb.tipo !== "RECEBER") return null;
  const categoriaId = await categoriaDaTaxa(tx, forma);
  const pago = !!receb.pagoEm;
  return tx.lancamento.create({
    data: {
      tipo: "PAGAR", descricao: `Taxa ${forma.nome} – ${receb.descricao}`, categoriaId, formaPagamentoId: null,
      contaBancariaId: receb.contaBancariaId ?? forma.contaBancariaId ?? null, valor: D(calc.taxa), vencimento: receb.vencimento, competencia: receb.competencia,
      pagoEm: receb.pagoEm, valorPago: pago ? D(calc.taxa) : null, empresaId: receb.empresaId, centroCustoId: receb.centroCustoId, taxaDeId: receb.id,
      observacao: `${calc.rotulo ? `${calc.rotulo}: ` : ""}${pct(calc.percentual)} de ${Number(receb.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
    },
  });
}

/** A conta a receber foi baixada: a taxa ligada a ela é paga no mesmo dia e na mesma conta. */
export async function baixarTaxas(tx: Tx, receb: { id: string; pagoEm: Date | null; contaBancariaId: string | null }) {
  if (!receb.pagoEm) return;
  const taxas = await tx.lancamento.findMany({ where: { taxaDeId: receb.id, pagoEm: null } });
  for (const t of taxas)
    await tx.lancamento.update({ where: { id: t.id }, data: { pagoEm: receb.pagoEm, valorPago: t.valor, contaBancariaId: receb.contaBancariaId ?? t.contaBancariaId } });
}

/** O recebimento foi estornado: a taxa volta a ficar em aberto. */
export async function estornarTaxas(tx: Tx, recebId: string) {
  await tx.lancamento.updateMany({ where: { taxaDeId: recebId, pagoEm: { not: null } }, data: { pagoEm: null, valorPago: null } });
}

/**
 * Conta a receber recém-criada de uma parcela de venda/OS: se a forma cobra taxa, lança a taxa ligada a ela.
 * Cartão com tabela: o dinheiro cai `prazo` dias depois do dia da parcela (Visa/Master na hora = no mesmo dia),
 * então o vencimento anda junto e a observação diz "Crédito 3x Visa".
 */
export async function taxaDaParcela(tx: Tx, receb: Lancamento, p: { bandeira?: string | null; vezes?: number | null }) {
  if (!receb.formaPagamentoId) return;
  const forma = await tx.formaPagamento.findUnique({ where: { id: receb.formaPagamentoId } });
  if (!forma || !cobraTaxa(forma)) return;
  const calc = calculoDaForma(forma, Number(receb.valor), p.bandeira, p.vezes);
  let l = receb;
  if (usaTabela(forma) && calc.prazoDias) {
    const v = new Date(receb.vencimento); v.setUTCDate(v.getUTCDate() + calc.prazoDias);
    l = await tx.lancamento.update({ where: { id: receb.id }, data: { vencimento: v, observacao: [calc.rotulo, receb.observacao].filter(Boolean).join(" · ") || null } });
  } else if (calc.rotulo) l = await tx.lancamento.update({ where: { id: receb.id }, data: { observacao: [calc.rotulo, receb.observacao].filter(Boolean).join(" · ") } });
  await lancarTaxa(tx, l, forma, calc);
}
