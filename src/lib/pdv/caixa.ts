import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { EstoqueError } from "@/lib/estoque/estoque";
import { categoria, garantirPadroes } from "@/lib/financeiro/padroes";
import { criarLancamentos } from "@/lib/financeiro/lancamentos";
import { diaSP } from "@/lib/datas";
import { transferirEntreContas } from "@/lib/financeiro/transferencias";
import { LOJA_ATUAL } from "@/lib/empresa/loja";
import { proximoNumero } from "@/lib/sequencia";

const D = (v: number) => new Prisma.Decimal(v.toFixed(2));

export const DINHEIRO = "Dinheiro";
export type Conferencia = { forma: string; esperado: number; contado: number };

/** Caixa do PDV aberto por este usuário (cada operador tem o seu). */
export function caixaAberto(usuarioId: string) {
  return prisma.caixaPdv.findFirst({ where: { usuarioId, fechadoEm: null }, orderBy: { abertoEm: "desc" } });
}

/** Abre o caixa com o dinheiro inicial; opcionalmente lança a abertura como recebimento no financeiro (conta Caixa). */
export async function abrirCaixa(usuarioId: string, valor: number, gerarRecebimento = false) {
  if (!(valor >= 0)) throw new EstoqueError("Valor de abertura inválido");
  return prisma.$transaction(async (tx) => {
    const ja = await tx.caixaPdv.findFirst({ where: { usuarioId, fechadoEm: null } });
    if (ja) return ja;
    const caixa = await tx.caixaPdv.create({ data: { usuarioId, valorAbertura: D(valor), numero: await proximoNumero(tx, "CAIXA") } });
    if (gerarRecebimento && valor > 0) {
      await garantirPadroes(tx);
      const conta = await tx.contaBancaria.findUniqueOrThrow({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: "Caixa" } } });
      await criarLancamentos(tx, {
        tipo: "RECEBER", descricao: `Abertura de caixa do PDV nº ${caixa.numero}`, valorTotal: valor, primeiroVencimento: diaSP(),
        categoriaId: (await categoria(tx, "Transferência entre contas", "RECEBER")).id, contaBancariaId: conta.id, pago: true,
      });
    }
    return caixa;
  });
}

/** Resumo do caixa: vendas concretizadas por forma de pagamento, sangrias/suprimentos e dinheiro esperado na gaveta. */
export async function resumoCaixa(caixaId: string) {
  const caixa = await prisma.caixaPdv.findUniqueOrThrow({ where: { id: caixaId } });
  const pags = await prisma.vendaPagamento.findMany({
    where: { venda: { caixaId, situacao: "CONCLUIDA" } },
    include: { formaPagamento: { select: { nome: true } } },
  });
  const porForma = new Map<string, number>();
  for (const p of pags) porForma.set(p.formaPagamento.nome, (porForma.get(p.formaPagamento.nome) ?? 0) + Number(p.valor));
  const vendas = await prisma.venda.count({ where: { caixaId, situacao: "CONCLUIDA" } });
  const movimentos = await prisma.movimentoCaixa.findMany({ where: { caixaId }, orderBy: { createdAt: "asc" }, include: { usuario: { select: { nome: true } } } });
  const soma = (t: "SANGRIA" | "SUPRIMENTO") => movimentos.filter((m) => m.tipo === t).reduce((s, m) => s + Number(m.valor), 0);
  const sangrias = soma("SANGRIA"), suprimentos = soma("SUPRIMENTO");
  const total = [...porForma.values()].reduce((s, v) => s + v, 0);
  const dinheiro = Number(caixa.valorAbertura) + (porForma.get(DINHEIRO) ?? 0) + suprimentos - sangrias;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const dinheiroEsperado = r2(dinheiro);
  // conferência do fechamento: dinheiro (gaveta) primeiro, depois as outras formas recebidas
  const esperadoPorForma: Conferencia[] = [{ forma: DINHEIRO, esperado: dinheiroEsperado, contado: dinheiroEsperado }];
  for (const [f, v] of [...porForma].sort((a, b) => b[1] - a[1])) if (f !== DINHEIRO) esperadoPorForma.push({ forma: f, esperado: r2(v), contado: r2(v) });
  return {
    caixa, vendas, total: r2(total), porForma: [...porForma].sort((a, b) => b[1] - a[1]), movimentos,
    sangrias: r2(sangrias), suprimentos: r2(suprimentos), dinheiroEsperado, esperadoPorForma,
  };
}


/** Conferência gravada no fechamento (ou a esperada, para caixa aberto / fechado antes da conferência por forma). */
export function lerConferencia(json: unknown): Conferencia[] | null {
  if (!Array.isArray(json)) return null;
  return json.filter((x) => x && typeof x.forma === "string").map((x) => ({ forma: String(x.forma), esperado: Number(x.esperado) || 0, contado: Number(x.contado) || 0 }));
}
export const diferencaTotal = (c: Conferencia[]) => Math.round(c.reduce((s, x) => s + x.contado - x.esperado, 0) * 100) / 100;

/**
 * Sangria (retira dinheiro da gaveta) ou suprimento (coloca troco). Com `contaId`, o valor também vira uma
 * transferência no financeiro: sangria = Caixa → conta (cofre, banco); suprimento = conta → Caixa.
 */
export async function movimentarCaixa(
  caixaId: string, usuarioId: string,
  d: { tipo: "SANGRIA" | "SUPRIMENTO"; valor: number; motivo?: string | null; contaId?: string | null },
) {
  const c = await prisma.caixaPdv.findFirst({ where: { id: caixaId, usuarioId, fechadoEm: null } });
  if (!c) throw new EstoqueError("Caixa não está aberto");
  if (!(d.valor > 0)) throw new EstoqueError("Informe um valor maior que zero");
  const valor = Math.round(d.valor * 100) / 100;
  if (d.tipo === "SANGRIA") {
    const { dinheiroEsperado } = await resumoCaixa(caixaId);
    if (valor > dinheiroEsperado + 0.001) throw new EstoqueError(`A gaveta tem só ${dinheiroEsperado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em dinheiro`);
  }
  return prisma.$transaction(async (tx) => {
    let transferenciaId: string | null = null;
    if (d.contaId) {
      await garantirPadroes(tx);
      const caixaConta = await tx.contaBancaria.findUniqueOrThrow({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: "Caixa" } } });
      const t = await transferirEntreContas(tx, {
        origemId: d.tipo === "SANGRIA" ? caixaConta.id : d.contaId,
        destinoId: d.tipo === "SANGRIA" ? d.contaId : caixaConta.id,
        valor, data: diaSP(),
        descricao: `${d.tipo === "SANGRIA" ? "Sangria" : "Suprimento"} do caixa do PDV`, observacao: d.motivo || null,
      });
      transferenciaId = t.id;
    }
    return tx.movimentoCaixa.create({ data: { caixaId, usuarioId, tipo: d.tipo, valor: D(valor), motivo: d.motivo?.trim() || null, transferenciaId } });
  });
}

/**
 * Fecha o caixa com a conferência: para cada forma de pagamento, o esperado (sistema) e o contado (operador).
 * `contado` pode ser só o dinheiro da gaveta (número) ou um mapa forma → valor; a forma não informada fica igual ao
 * esperado. Com `lancarDiferenca`, a sobra/falta de dinheiro vira um lançamento pago na conta Caixa do financeiro.
 * `qualquerOperador`: gerente fechando o caixa esquecido de outro operador.
 */
export async function fecharCaixa(
  caixaId: string, usuarioId: string, contado: number | Record<string, number>, observacao?: string,
  opts: { qualquerOperador?: boolean; lancarDiferenca?: boolean } = {},
) {
  const c = await prisma.caixaPdv.findFirst({ where: { id: caixaId, fechadoEm: null, ...(opts.qualquerOperador ? {} : { usuarioId }) } });
  if (!c) throw new EstoqueError("Caixa não está aberto");
  const r = await resumoCaixa(caixaId);
  const mapa = typeof contado === "number" ? { [DINHEIRO]: contado } : contado;
  const conferencia: Conferencia[] = r.esperadoPorForma.map((x) => {
    const v = mapa[x.forma];
    if (v !== undefined && !(v >= 0)) throw new EstoqueError(`Valor contado inválido em ${x.forma}`);
    return { forma: x.forma, esperado: x.esperado, contado: v === undefined ? x.esperado : Math.round(v * 100) / 100 };
  });
  const dinheiro = conferencia[0];
  const dif = Math.round((dinheiro.contado - dinheiro.esperado) * 100) / 100;
  return prisma.$transaction(async (tx) => {
    // trava contra fechamento duplo (dois cliques, duas abas)
    const ok = await tx.caixaPdv.updateMany({ where: { id: caixaId, fechadoEm: null }, data: { fechadoEm: new Date() } });
    if (!ok.count) throw new EstoqueError("Caixa não está aberto");
    let lancamentoDiferencaId: string | null = null;
    if (opts.lancarDiferenca && Math.abs(dif) >= 0.01) {
      await garantirPadroes(tx);
      const conta = await tx.contaBancaria.findUniqueOrThrow({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: "Caixa" } } });
      const sobra = dif > 0;
      const [l] = await criarLancamentos(tx, {
        tipo: sobra ? "RECEBER" : "PAGAR", descricao: `${sobra ? "Sobra" : "Quebra"} de caixa do PDV nº ${c.numero ?? ""}`.trim(),
        valorTotal: Math.abs(dif), primeiroVencimento: diaSP(), pago: true, contaBancariaId: conta.id,
        categoriaId: (await categoria(tx, sobra ? "Outras receitas" : "Outras despesas", sobra ? "RECEBER" : "PAGAR")).id,
        observacao: observacao || null,
      });
      lancamentoDiferencaId = l?.id ?? null;
    }
    return tx.caixaPdv.update({
      where: { id: caixaId },
      data: {
        valorFechamento: D(dinheiro.contado), valorEsperado: D(dinheiro.esperado), conferencia, fechadoPorId: usuarioId,
        observacao: observacao?.trim() || null, lancamentoDiferencaId,
      },
    });
  });
}
