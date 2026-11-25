"use server";

import { exigirAcao } from "@/lib/auth/atual";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { agruparContas, desagruparConta } from "@/lib/financeiro/agrupar";
import { prisma } from "@/lib/db";
import { baixarLancamento, criarLancamentos, estornarLancamento } from "@/lib/financeiro/lancamentos";
import { parseDia } from "@/lib/datas";
import { lerNumero } from "@/lib/itens/tipos";
import { boletosDoDocumento, cancelarBoletosDoLancamento } from "@/lib/financeiro/boletos";
import type { Resultado } from "@/components/financeiro/FormAcao";

// aceita "1.234,56", "49,90" e "49.90" (antes "49.90" virava 4.990)
const num = (x: FormDataEntryValue | null) => lerNumero(String(x ?? "")) ?? 0;
const str = (x: FormDataEntryValue | null) => String(x ?? "").trim();
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const AVULSA = { OR: [{ origemTipo: null }, { origemTipo: "IMPLANTACAO" as const }] };
const lista = (tipo: string) => `/financeiro?tipo=${tipo === "PAGAR" ? "PAGAR" : "RECEBER"}`;

function atualizar() {
  revalidatePath("/financeiro", "layout");
  revalidatePath("/");
}

async function tentar(fn: () => Promise<string | void>, ok: string, ir?: string): Promise<Resultado> {
  let destino = ir;
  try {
    const r = await fn();
    if (r) destino = r;
  } catch (e) {
    return { ok: false, mensagem: msg(e) };
  }
  atualizar();
  return { ok: true, mensagem: ok, ir: destino };
}

function dadosForm(form: FormData) {
  return {
    descricao: str(form.get("descricao")),
    categoriaId: str(form.get("categoriaId")),
    pessoaId: str(form.get("pessoaId")) || null,
    formaPagamentoId: str(form.get("formaPagamentoId")) || null,
    contaBancariaId: str(form.get("contaBancariaId")) || null,
    centroCustoId: str(form.get("centroCustoId")) || null,
    observacao: str(form.get("observacao")) || null,
  };
}

/** Adicionar conta a pagar/receber (com parcelas mensais). Pode já entrar como paga. */
export async function adicionarContaAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const tipo = str(form.get("tipo")) === "PAGAR" ? "PAGAR" : "RECEBER";
  return tentar(async () => {
    await exigirAcao("financeiro.lancar");
    const d = dadosForm(form);
    if (!d.descricao) throw new Error("Informe a descrição");
    if (!d.categoriaId) throw new Error("Escolha o plano de contas");
    const pago = form.get("pago") === "1";
    if (pago && !d.contaBancariaId) throw new Error("Para lançar como pago, escolha a conta bancária");
    if (pago) await exigirAcao("financeiro.baixar");
    const criados = await prisma.$transaction((tx) =>
      criarLancamentos(tx, {
        tipo, ...d,
        valorTotal: num(form.get("valor")),
        parcelas: Math.min(120, Math.max(1, Number(form.get("parcelas") || 1))),
        primeiroVencimento: parseDia(str(form.get("vencimento"))),
        competencia: str(form.get("competencia")) ? parseDia(str(form.get("competencia"))) : undefined,
        pago,
      }),
    );
    await boletosDoDocumento({ lancamentoIds: criados.map((l) => l.id) });
    return criados.length === 1 ? `/financeiro/lancamentos/${criados[0].id}` : lista(tipo);
  }, tipo === "PAGAR" ? "Conta a pagar lançada" : "Conta a receber lançada", lista(tipo));
}

/** Editar uma conta em aberto lançada à mão (as de venda/OS/compra mudam no documento). */
export async function editarContaAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const id = str(form.get("id"));
  return tentar(async () => {
    await exigirAcao("financeiro.lancar");
    const l = await prisma.lancamento.findUniqueOrThrow({ where: { id } });
    if (l.pagoEm) throw new Error("Esta conta já foi baixada: estorne antes de editar");
    const d = dadosForm(form);
    const valor = num(form.get("valor"));
    if (!(valor > 0)) throw new Error("Informe um valor maior que zero");
    const vencimento = parseDia(str(form.get("vencimento")));
    const doc = !!l.origemTipo && l.origemTipo !== "IMPLANTACAO";
    await prisma.lancamento.update({
      where: { id },
      // conta de documento: só muda vencimento, forma, conta, centro e observação (valor e descrição vêm da venda/OS)
      data: doc
        ? { vencimento, formaPagamentoId: d.formaPagamentoId, contaBancariaId: d.contaBancariaId, centroCustoId: d.centroCustoId, observacao: d.observacao }
        : {
            ...d, valor: valor.toFixed(2), vencimento,
            competencia: str(form.get("competencia")) ? parseDia(str(form.get("competencia"))) : vencimento,
            ...(d.categoriaId ? {} : { categoriaId: l.categoriaId }),
          },
    });
    // boleto já emitido com outro valor/vencimento: o sistema cancela e emite de novo se a forma for boleto
    await boletosDoDocumento({ lancamentoIds: [id] });
  }, "Conta salva", `/financeiro/lancamentos/${id}`);
}

/** Receber/pagar uma conta (tela da conta). */
export async function baixarContaAcao(_: Resultado, form: FormData): Promise<Resultado> {
  const id = str(form.get("id"));
  return tentar(async () => {
    await exigirAcao("financeiro.baixar");
    const conta = str(form.get("contaBancariaId"));
    if (!conta) throw new Error("Escolha a conta bancária");
    const valorPago = str(form.get("valorPago")) ? num(form.get("valorPago")) : undefined;
    await prisma.$transaction((tx) =>
      baixarLancamento(tx, id, { data: parseDia(str(form.get("data"))), contaBancariaId: conta, juros: num(form.get("juros")), desconto: num(form.get("desconto")), valorPago }),
    );
    // recebido à mão: o boleto em aberto é cancelado no Inter para o cliente não pagar duas vezes
    await cancelarBoletosDoLancamento(id);
  }, "Baixa registrada", `/financeiro/lancamentos/${id}`);
}

/** Baixa em lote: as contas marcadas na lista, na mesma data e conta, pelo valor de cada uma. */
export async function baixarVariasAcao(_: Resultado | null, form: FormData): Promise<Resultado> {
  const ids = form.getAll("ids").map(String);
  if (!ids.length) return { ok: false, mensagem: "Marque ao menos uma conta" };
  return tentar(async () => {
    await exigirAcao("financeiro.baixar");
    const conta = str(form.get("contaBancariaId"));
    if (!conta) throw new Error("Escolha a conta bancária");
    const data = parseDia(str(form.get("data")));
    const abertas = await prisma.lancamento.findMany({ where: { id: { in: ids }, pagoEm: null }, select: { id: true } });
    await prisma.$transaction(async (tx) => { for (const l of abertas) await baixarLancamento(tx, l.id, { data, contaBancariaId: conta }); });
    for (const l of abertas) await cancelarBoletosDoLancamento(l.id);
  }, `${ids.length} conta(s) baixada(s)`);
}

export async function estornarContaAcao(id: string): Promise<{ ok: boolean; mensagem: string }> {
  const r = await tentar(async () => {
    await exigirAcao("financeiro.estornar");
    await prisma.$transaction((tx) => estornarLancamento(tx, id));
  }, "Baixa estornada");
  return r!;
}

export async function excluirContaAcao(id: string): Promise<{ ok: boolean; mensagem: string }> {
  const r = await tentar(async () => {
    await exigirAcao("financeiro.excluir");
    const n = await prisma.lancamento.deleteMany({ where: { id, pagoEm: null, ...AVULSA } });
    if (!n.count) throw new Error("Só dá para excluir conta em aberto lançada no financeiro (as de venda, OS e compra saem pelo documento)");
    await boletosDoDocumento({ lancamentoIds: [] }); // cancela no Inter o boleto da conta apagada
  }, "Conta excluída");
  return r!;
}

export async function excluirVariasAcao(_: Resultado | null, form: FormData): Promise<Resultado> {
  const ids = form.getAll("ids").map(String);
  if (!ids.length) return { ok: false, mensagem: "Marque ao menos uma conta" };
  let n = 0;
  const r = await tentar(async () => {
    await exigirAcao("financeiro.excluir");
    n = (await prisma.lancamento.deleteMany({ where: { id: { in: ids }, pagoEm: null, ...AVULSA } })).count;
    await boletosDoDocumento({ lancamentoIds: [] });
  }, "");
  if (r?.ok) r.mensagem = n === ids.length ? `${n} conta(s) excluída(s)` : `${n} de ${ids.length} excluída(s). As baixadas ou de venda/OS/compra ficaram.`;
  return r;
}

/** Mais ações › Agrupar contas: as contas a receber marcadas (mesmo cliente) viram um título só; abre o título. */
export async function agruparContasAcao(_: Resultado | null, form: FormData): Promise<Resultado> {
  const ids = form.getAll("ids").map(String);
  if (ids.length < 2) return { ok: false, mensagem: "Marque ao menos duas contas a receber do mesmo cliente" };
  let destino: string;
  try {
    const u = await exigirAcao("financeiro.agrupar");
    const venc = str(form.get("vencimento"));
    const r = await agruparContas(ids, u, { vencimento: venc ? parseDia(venc) : null, formaPagamentoId: str(form.get("formaPagamentoId")) || null });
    await boletosDoDocumento({ lancamentoIds: [r.titulo.id] }); // forma boleto: registra o boleto do título no Inter
    atualizar();
    destino = `/financeiro/lancamentos/${r.titulo.id}`;
  } catch (e) { return { ok: false, mensagem: msg(e) }; }
  redirect(destino);
}

/** Tela do título agrupado › Desagrupar: as contas voltam como eram, cada uma ligada à sua venda/OS. */
export async function desagruparContaAcao(id: string): Promise<{ ok: boolean; mensagem: string }> {
  try {
    await exigirAcao("financeiro.agrupar");
    await desagruparConta(id);
  } catch (e) { return { ok: false, mensagem: msg(e) }; }
  atualizar();
  redirect("/financeiro?tipo=RECEBER");
}
