import type { Prisma } from "@prisma/client";
import { diaSP, periodoDia } from "@/lib/datas";
import { cadaPalavra, contem } from "@/lib/busca/palavras";

/** Situação de uma conta como nas listas do Gestão Click (Confirmado, Atrasado, Vence hoje, Em aberto). */
export function situacaoConta(l: { pagoEm: Date | null; vencimento: Date }, hoje = diaSP()) {
  if (l.pagoEm) return { chave: "pagos", rotulo: "Confirmado", pilula: "border-emerald-300 bg-emerald-50 text-emerald-700" };
  if (l.vencimento < hoje) return { chave: "vencidos", rotulo: "Atrasado", pilula: "border-red-300 bg-red-50 text-red-700" };
  if (l.vencimento.getTime() === hoje.getTime()) return { chave: "hoje", rotulo: "Vence hoje", pilula: "border-amber-300 bg-amber-50 text-amber-800" };
  return { chave: "avencer", rotulo: "Em aberto", pilula: "border-slate-300 bg-slate-50 text-slate-700" };
}

/** Ícone da forma de pagamento pelo código da NF-e (tPag). */
export function iconeForma(f: { tPag: string; boletoInter?: boolean } | null) {
  if (!f) return null;
  if (f.boletoInter || f.tPag === "15") return { nome: "boleto", cor: "text-emerald-600" };
  if (f.tPag === "17") return { nome: "pix", cor: "text-teal-500" };
  if (f.tPag === "03" || f.tPag === "04") return { nome: "cartao", cor: "text-sky-600" };
  if (f.tPag === "01") return { nome: "dinheiro", cor: "text-emerald-700" };
  if (f.tPag === "16" || f.tPag === "18") return { nome: "transferir", cor: "text-slate-500" };
  return null;
}

/** Link e ícone do documento que gerou a conta (venda, OS, compra). */
/** Link do documento que gerou a conta. Com o id da conta, a venda/OS/compra mostra "Voltar para a conta". */
export function origemConta(l: { id?: string; origemTipo: string | null; origemId: string | null }) {
  if (!l.origemId) return null;
  const q = l.id ? `?conta=${l.id}` : "";
  if (l.origemTipo === "VENDA") return { href: `/vendas/${l.origemId}${q}`, icone: "carrinho", rotulo: "Ver venda" };
  if (l.origemTipo === "OS") return { href: `/os/${l.origemId}${q}`, icone: "os", rotulo: "Ver OS" };
  if (l.origemTipo === "COMPRA") return { href: `/compras/${l.origemId}${q}`, icone: "carrinho", rotulo: "Ver compra" };
  return null;
}

/** Boleto que dá para abrir em PDF (registrado no Inter e ainda valendo). */
export const boletoAbrivel = (b?: { id: string; situacao: string } | null) =>
  b && ["EM_PROCESSAMENTO", "A_RECEBER", "ATRASADO", "PROTESTO"].includes(b.situacao) ? `/api/boletos/${b.id}/pdf` : null;

/** Contas lançadas à mão (ou trazidas na implantação) podem ser editadas e excluídas na tela do financeiro. */
export const contaAvulsa = (l: { origemTipo: string | null }) => !l.origemTipo || l.origemTipo === "IMPLANTACAO";

export type ParamsContas = {
  tipo?: string; f?: string; q?: string; doc?: string; cat?: string; centro?: string; conta?: string; forma?: string; cli?: string;
  periodo?: string; pde?: string; pate?: string; de?: string; ate?: string;
  p?: string; pp?: string; o?: string; busca?: string; acao?: string;
};

export const FILTROS_SITUACAO = ["vencidos", "hoje", "avencer", "abertos", "pagos"] as const;

/**
 * Filtros da lista de contas, sem a situação (os cartões de resumo usam isto para somar cada situação).
 * O período é sobre o vencimento.
 */
export function whereContas(tipo: "PAGAR" | "RECEBER", sp: ParamsContas): Prisma.LancamentoWhereInput {
  const and: Prisma.LancamentoWhereInput[] = [{ tipo }];
  const p = periodoDia(sp.periodo, sp.pde, sp.pate);
  if (p) and.push({ vencimento: { gte: p.de, lte: p.ate } });
  if (sp.cat) and.push({ OR: [{ categoriaId: sp.cat }, { categoria: { paiId: sp.cat } }, { rateio: { some: { categoriaId: sp.cat } } }] });
  if (sp.centro) and.push({ centroCustoId: sp.centro });
  if (sp.conta) and.push({ contaBancariaId: sp.conta });
  if (sp.forma) and.push({ formaPagamentoId: sp.forma });
  if (sp.cli) and.push({ pessoaId: sp.cli });
  // "Ver no financeiro" da venda, OS ou compra: as contas daquele documento
  if (sp.doc) and.push({ origemId: sp.doc });
  const q = sp.q?.trim();
  // cada palavra em qualquer ordem: descrição ("Venda de nº 8698"), cliente/fornecedor ou o valor
  and.push(...cadaPalavra(q, (p): Prisma.LancamentoWhereInput[] => {
    const valor = Number(p.replace(/\./g, "").replace(",", "."));
    const d = p.replace(/\D/g, "");
    return [{ descricao: contem(p) }, { pessoa: { nome: contem(p) } }, { pessoa: { fantasia: contem(p) } },
      ...(d.length >= 3 ? [{ pessoa: { documento: { contains: d } } }] : []),
      ...(/^[\d.,]+$/.test(p) && valor > 0 ? [{ valor }] : [])];
  }));
  return { AND: and };
}

/** Filtro de uma situação (cartão clicado ou ?f=). */
export function whereSituacao(f: string | undefined, hoje = diaSP()): Prisma.LancamentoWhereInput {
  if (f === "vencidos") return { pagoEm: null, vencimento: { lt: hoje } };
  if (f === "hoje") return { pagoEm: null, vencimento: hoje };
  if (f === "avencer") return { pagoEm: null, vencimento: { gt: hoje } };
  if (f === "abertos") return { pagoEm: null };
  if (f === "pagos") return { pagoEm: { not: null } };
  return {};
}

export function ordemContas(o?: string): Prisma.LancamentoOrderByWithRelationInput[] {
  const desc = o?.startsWith("-");
  const dir = desc ? "desc" : "asc";
  switch (o?.replace(/^-/, "")) {
    case "descricao": return [{ descricao: dir }];
    case "entidade": return [{ pessoa: { nome: dir } }, { vencimento: "asc" }];
    case "valor": return [{ valor: dir }];
    case "vencimento": return [{ vencimento: dir }, { descricao: "asc" }];
    default: return [{ vencimento: "asc" }, { descricao: "asc" }];
  }
}
