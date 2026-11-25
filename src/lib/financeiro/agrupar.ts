import { Prisma, type OrigemDocumento } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { ATIVOS as BOLETOS_ATIVOS } from "@/lib/financeiro/boletos";

/**
 * Agrupar contas a receber do mesmo cliente num único título (como o "Agrupar" do Gestão Click).
 * As contas originais saem do financeiro e ficam guardadas em LancamentoAgrupado, com o documento (venda/OS)
 * que gerou cada uma: o título mostra essas referências (na tela e no boleto) e "Desagrupar" devolve as contas como eram.
 * Enquanto a conta estiver agrupada, a venda/OS não deixa cancelar nem refazer o financeiro (cancelarRecebimentos recusa).
 */

export class AgruparError extends Error {}

type Usuario = { id: string; nome: string };
const D = (v: number) => new Prisma.Decimal(v.toFixed(2));
const brl = (x: number) => x.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const diaBr = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });

/** Rótulo curto do documento que gerou a conta: "Venda nº 9226", "OS nº 8690" (ou a descrição da conta). */
export async function rotulosDocumentos(contas: { origemTipo: OrigemDocumento | null; origemId: string | null; descricao: string; parcela: number; totalParcelas: number }[], tx: Tx | typeof prisma = prisma) {
  const ids = (t: string) => contas.filter((c) => c.origemTipo === t && c.origemId).map((c) => c.origemId!);
  const [vendas, ordens] = await Promise.all([
    ids("VENDA").length ? tx.venda.findMany({ where: { id: { in: ids("VENDA") } }, select: { id: true, numero: true } }) : [],
    ids("OS").length ? tx.ordemServico.findMany({ where: { id: { in: ids("OS") } }, select: { id: true, numero: true } }) : [],
  ]);
  const num = new Map<string, string>([...vendas.map((v) => [`VENDA:${v.id}`, `Venda nº ${v.numero}`] as const), ...ordens.map((o) => [`OS:${o.id}`, `OS nº ${o.numero}`] as const)]);
  return contas.map((c) => {
    const base = num.get(`${c.origemTipo}:${c.origemId}`);
    if (!base) return c.descricao;
    return c.totalParcelas > 1 ? `${base} (${c.parcela}/${c.totalParcelas})` : base;
  });
}

/** Se a conta do documento está agrupada, a frase para avisar (prévia do cancelamento). */
export async function tituloAgrupado(origemTipo: OrigemDocumento, origemId: string) {
  const a = await prisma.lancamentoAgrupado.findFirst({ where: { origemTipo, origemId }, select: { lancamento: { select: { descricao: true, pagoEm: true } } } });
  if (!a) return null;
  return `A conta a receber foi agrupada no título "${a.lancamento.descricao}"${a.lancamento.pagoEm ? " (já recebido)" : ""}: desagrupe no financeiro antes`;
}

/** Linhas de referência para o boleto do título agrupado (o Inter aceita até 5 linhas de 78 caracteres). */
export async function referenciasBoleto(lancamentoId: string) {
  const ags = await prisma.lancamentoAgrupado.findMany({ where: { lancamentoId }, orderBy: [{ vencimento: "asc" }, { createdAt: "asc" }] });
  if (!ags.length) return [];
  const rotulos = await rotulosDocumentos(ags);
  const linhas: string[] = [];
  let atual = "Ref.:";
  for (const r of rotulos) {
    const pedaco = `${atual === "Ref.:" ? " " : ", "}${r}`;
    if ((atual + pedaco).length > 78) { linhas.push(atual); atual = `  ${r}`; } else atual += pedaco;
  }
  linhas.push(atual);
  return linhas;
}

/** Soma o rateio de cada conta por categoria e devolve a categoria principal e as frações. */
function juntarRateio(contas: { valor: Prisma.Decimal; categoriaId: string; rateio: { categoriaId: string; fracao: Prisma.Decimal | number }[] }[]) {
  const porCat = new Map<string, number>();
  for (const c of contas) {
    const v = Number(c.valor);
    if (c.rateio.length) for (const r of c.rateio) porCat.set(r.categoriaId, (porCat.get(r.categoriaId) ?? 0) + v * Number(r.fracao));
    else porCat.set(c.categoriaId, (porCat.get(c.categoriaId) ?? 0) + v);
  }
  const total = [...porCat.values()].reduce((s, x) => s + x, 0);
  const ordem = [...porCat.entries()].sort((a, b) => b[1] - a[1]);
  const categoriaId = ordem[0][0];
  if (ordem.length < 2 || !(total > 0)) return { categoriaId, rateio: [] as { categoriaId: string; fracao: number }[] };
  const rateio = ordem.map(([categoriaId, v]) => ({ categoriaId, fracao: Math.round((v / total) * 1e8) / 1e8 }));
  rateio[0].fracao = Math.round((1 - rateio.slice(1).reduce((s, r) => s + r.fracao, 0)) * 1e8) / 1e8;
  return { categoriaId, rateio };
}

/** O que impede agrupar (ou desagrupar) uma conta. */
async function bloqueiosConta(tx: Tx, l: { id: string; descricao: string; pagoEm: Date | null; transacaoId: string | null; transferenciaId: string | null; boletos: { situacao: string }[] }) {
  const b: string[] = [];
  if (l.pagoEm) b.push(`"${l.descricao}" já foi recebida`);
  if (l.transacaoId || (await tx.transacaoPagSeguro.count({ where: { lancamentoId: l.id } }))) b.push(`"${l.descricao}" está conciliada com o extrato`);
  if (l.transferenciaId) b.push(`"${l.descricao}" é uma transferência entre contas`);
  if (l.boletos.some((x) => BOLETOS_ATIVOS.includes(x.situacao))) b.push(`"${l.descricao}" tem boleto registrado no Inter: cancele o boleto antes (abra a conta › Enviar ou cancelar boleto)`);
  return b;
}

/**
 * Junta contas a receber em aberto do mesmo cliente (e da mesma empresa) num único título.
 * Vencimento: o informado ou o maior das contas; forma de pagamento: a informada, a comum a todas ou a da primeira.
 */
export async function agruparContas(ids: string[], u: Usuario, opts: { vencimento?: Date | null; formaPagamentoId?: string | null } = {}) {
  ids = [...new Set(ids)];
  if (ids.length < 2) throw new AgruparError("Marque ao menos duas contas a receber do mesmo cliente");
  return prisma.$transaction(async (tx) => {
    // trava as contas (na mesma ordem, para duas pessoas agrupando ao mesmo tempo não se travarem)
    for (const id of [...ids].sort()) await tx.$queryRaw`SELECT id FROM "Lancamento" WHERE id = ${id} FOR NO KEY UPDATE`;
    const contas = await tx.lancamento.findMany({
      where: { id: { in: ids } }, orderBy: [{ vencimento: "asc" }, { createdAt: "asc" }],
      include: { rateio: true, boletos: { select: { situacao: true } }, agrupados: true, pessoa: { select: { nome: true } } },
    });
    if (contas.length !== ids.length) throw new AgruparError("Alguma conta marcada não existe mais: atualize a lista");
    const bloqueios: string[] = [];
    if (contas.some((c) => c.tipo !== "RECEBER")) bloqueios.push("Só contas a receber podem ser agrupadas");
    if (contas.some((c) => !c.pessoaId)) bloqueios.push("Toda conta precisa ter o cliente informado");
    if (new Set(contas.map((c) => c.pessoaId)).size > 1) bloqueios.push(`As contas são de clientes diferentes (${[...new Set(contas.map((c) => c.pessoa?.nome ?? "sem cliente"))].join(", ")})`);
    if (new Set(contas.map((c) => c.empresaId ?? "")).size > 1) bloqueios.push("As contas são de empresas (CNPJ) diferentes");
    for (const c of contas) bloqueios.push(...(await bloqueiosConta(tx, c)));
    // venda de marketplace e cobrança de contrato baixam/conferem a conta pelo documento: agrupadas, se perderiam
    const vendaIds = contas.filter((c) => c.origemTipo === "VENDA" && c.origemId).map((c) => c.origemId!);
    if (vendaIds.length) {
      const mkt = await tx.pedidoMarketplace.findMany({ where: { vendaId: { in: vendaIds } }, select: { externoId: true } });
      if (mkt.length) bloqueios.push(`Conta de pedido do marketplace (${mkt.map((m) => m.externoId).join(", ")}) não pode ser agrupada: ela é baixada pela liberação do pagamento`);
      const contr = await tx.contratoCobranca.findMany({ where: { vendaId: { in: vendaIds } }, select: { referencia: true } });
      if (contr.length) bloqueios.push(`Conta de cobrança de contrato (${contr.map((c) => c.referencia).join(", ")}) não pode ser agrupada`);
    }
    if (bloqueios.length) throw new AgruparError(bloqueios.join(". "));

    // o que vai para o título: as contas como eram (as que já eram agrupamento levam os seus agrupados)
    const simples = contas.filter((c) => c.origemTipo !== "AGRUPAMENTO");
    const filhos = contas.filter((c) => c.origemTipo === "AGRUPAMENTO").flatMap((c) => c.agrupados);
    const refs = [
      ...simples.map((c) => ({ origemTipo: c.origemTipo, origemId: c.origemId, descricao: c.descricao, parcela: c.parcela, totalParcelas: c.totalParcelas })),
      ...filhos.map((a) => ({ origemTipo: a.origemTipo, origemId: a.origemId, descricao: a.descricao, parcela: a.parcela, totalParcelas: a.totalParcelas })),
    ];
    const rotulos = await rotulosDocumentos(refs, tx);
    const total = contas.reduce((s, c) => s + Number(c.valor), 0);
    const { categoriaId, rateio } = juntarRateio(contas.map((c) => ({ valor: c.valor, categoriaId: c.categoriaId, rateio: c.rateio })));
    const comum = <T,>(f: (c: (typeof contas)[number]) => T) => (new Set(contas.map(f)).size === 1 ? f(contas[0]) : null);
    const vencimento = opts.vencimento ?? new Date(Math.max(...contas.map((c) => c.vencimento.getTime())));
    const competencia = new Date(Math.min(...contas.map((c) => c.competencia.getTime())));
    const formaPagamentoId = opts.formaPagamentoId || comum((c) => c.formaPagamentoId) || contas.find((c) => c.formaPagamentoId)?.formaPagamentoId || null;
    let descricao = rotulos.join(" + ");
    if (descricao.length > 180) descricao = `${rotulos.slice(0, 4).join(" + ")} e mais ${rotulos.length - 4}`;
    const detalhe = contas.map((c) => `${c.descricao} (venc. ${diaBr(c.vencimento)}, ${brl(Number(c.valor))})`).join("; ");

    const titulo = await tx.lancamento.create({
      data: {
        tipo: "RECEBER", descricao, pessoaId: contas[0].pessoaId, empresaId: contas[0].empresaId, categoriaId, valor: D(total), vencimento, competencia,
        formaPagamentoId, contaBancariaId: comum((c) => c.contaBancariaId), centroCustoId: comum((c) => c.centroCustoId) ?? contas.find((c) => c.centroCustoId)?.centroCustoId ?? null,
        origemTipo: "AGRUPAMENTO", parcela: 1, totalParcelas: 1,
        observacao: `Agrupamento de ${contas.length} contas feito por ${u.nome}: ${detalhe}`.slice(0, 2000),
        rateio: { create: rateio },
      },
    });
    for (const c of simples)
      await tx.lancamentoAgrupado.create({
        data: {
          lancamentoId: titulo.id, origemTipo: c.origemTipo, origemId: c.origemId, descricao: c.descricao, valor: c.valor, vencimento: c.vencimento, competencia: c.competencia,
          parcela: c.parcela, totalParcelas: c.totalParcelas, categoriaId: c.categoriaId, centroCustoId: c.centroCustoId, formaPagamentoId: c.formaPagamentoId, observacao: c.observacao,
          idLegado: c.idLegado, rateio: c.rateio.map((r) => ({ categoriaId: r.categoriaId, fracao: Number(r.fracao) })),
        },
      });
    if (filhos.length) await tx.lancamentoAgrupado.updateMany({ where: { id: { in: filhos.map((a) => a.id) } }, data: { lancamentoId: titulo.id } });
    await tx.lancamento.deleteMany({ where: { id: { in: ids } } });
    return { titulo, quantidade: refs.length, total };
  }, { timeout: 30000 });
}

/** Desfaz o agrupamento: as contas voltam como eram (com o documento de origem) e o título sai. */
export async function desagruparConta(id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Lancamento" WHERE id = ${id} FOR NO KEY UPDATE`;
    const l = await tx.lancamento.findUnique({ where: { id }, include: { agrupados: { orderBy: [{ vencimento: "asc" }, { createdAt: "asc" }] }, boletos: { select: { situacao: true } } } });
    if (!l) throw new AgruparError("Conta não encontrada");
    if (l.origemTipo !== "AGRUPAMENTO" || !l.agrupados.length) throw new AgruparError("Esta conta não é um agrupamento");
    const b = await bloqueiosConta(tx, l);
    if (b.length) throw new AgruparError(`Não dá para desagrupar: ${b.join(". ")}${l.pagoEm ? ". Estorne o recebimento antes" : ""}`);
    for (const a of l.agrupados) {
      const rateio = (Array.isArray(a.rateio) ? a.rateio : []) as { categoriaId: string; fracao: number }[];
      await tx.lancamento.create({
        data: {
          tipo: "RECEBER", descricao: a.descricao, pessoaId: l.pessoaId, empresaId: l.empresaId, categoriaId: a.categoriaId, valor: a.valor, vencimento: a.vencimento, competencia: a.competencia,
          parcela: a.parcela, totalParcelas: a.totalParcelas, origemTipo: a.origemTipo, origemId: a.origemId, centroCustoId: a.centroCustoId, formaPagamentoId: a.formaPagamentoId,
          observacao: a.observacao, idLegado: a.idLegado, rateio: { create: rateio.map((r) => ({ categoriaId: r.categoriaId, fracao: r.fracao })) },
        },
      });
    }
    await tx.lancamento.delete({ where: { id } });
    return { quantidade: l.agrupados.length };
  }, { timeout: 30000 });
}
