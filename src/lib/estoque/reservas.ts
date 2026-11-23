import { prisma } from "@/lib/db";

/** Uma venda ou OS que está segurando o produto, com o link para abrir. */
export type DocumentoReserva = {
  chave: string;
  tipo: "OS" | "VENDA";
  id: string;
  rotulo: string;
  href: string;
  pessoa?: string;
  situacao: string;
  cor: string;
  data: Date;
  /** total reservado para o documento (inclui o que está em falta) */
  quantidade: number;
  /** parte da reserva sem estoque (aguardando compra) */
  falta: number;
  /** prateleiras de onde sai, com a quantidade */
  locais: { codigo: string; deposito: string; quantidade: number }[];
  separado: boolean;
};

const SIT_OS: Record<string, string> = {
  ABERTA: "Aberta", EM_ANDAMENTO: "Em andamento", AGUARDANDO_PECA: "Aguardando peça", AGUARDANDO_APROVACAO: "Aguardando aprovação",
  CONCLUIDA: "Concluída", FATURADA: "Faturada", CANCELADA: "Cancelada", DEVOLVIDA_SEM_REPARO: "Devolvida sem reparo",
};
const SIT_VENDA: Record<string, string> = { ORCAMENTO: "Orçamento", ABERTA: "Aberta", CONCLUIDA: "Concluída", CANCELADA: "Cancelada" };

/**
 * Onde cada produto está reservado: as reservas ativas agrupadas por venda/OS, só da empresa escolhida.
 * A extensão da loja já filtra as reservas pelo depósito e as vendas/OS pela empresa (lista de ids conta como
 * listagem); reserva em falta (sem local) cujo documento é de outra empresa não volta e fica de fora.
 */
export async function reservasDosProdutos(produtoIds: string[]): Promise<Map<string, DocumentoReserva[]>> {
  const mapa = new Map<string, DocumentoReserva[]>();
  if (!produtoIds.length) return mapa;
  const reservas = await prisma.reserva.findMany({
    where: { produtoId: { in: produtoIds }, status: "ATIVA", origemTipo: { in: ["OS", "VENDA"] } },
    select: { produtoId: true, origemTipo: true, origemId: true, quantidade: true, separado: true, local: { select: { codigo: true, deposito: { select: { nome: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  if (!reservas.length) return mapa;
  const ids = (t: string) => [...new Set(reservas.filter((r) => r.origemTipo === t).map((r) => r.origemId))];
  const pessoa = { select: { nome: true, fantasia: true } } as const;
  const sit = { select: { nome: true, cor: true } } as const;
  const [vendas, oss] = await Promise.all([
    ids("VENDA").length ? prisma.venda.findMany({ where: { id: { in: ids("VENDA") } }, select: { id: true, numero: true, data: true, situacao: true, situacaoCfg: sit, cliente: pessoa } }) : [],
    ids("OS").length ? prisma.ordemServico.findMany({ where: { id: { in: ids("OS") } }, select: { id: true, numero: true, entrada: true, situacao: true, situacaoCfg: sit, cliente: pessoa } }) : [],
  ]);
  const nome = (p?: { nome: string; fantasia: string | null } | null) => (p ? p.fantasia || p.nome : undefined);
  const docs = new Map<string, Omit<DocumentoReserva, "quantidade" | "falta" | "locais" | "separado">>();
  for (const v of vendas) docs.set(`VENDA:${v.id}`, { chave: `VENDA:${v.id}`, tipo: "VENDA", id: v.id, rotulo: `Venda #${v.numero}`, href: `/vendas/${v.id}`, pessoa: nome(v.cliente), situacao: v.situacaoCfg?.nome ?? SIT_VENDA[v.situacao] ?? v.situacao, cor: v.situacaoCfg?.cor ?? "cinza", data: v.data });
  for (const o of oss) docs.set(`OS:${o.id}`, { chave: `OS:${o.id}`, tipo: "OS", id: o.id, rotulo: `OS #${o.numero}`, href: `/os/${o.id}`, pessoa: nome(o.cliente), situacao: o.situacaoCfg?.nome ?? SIT_OS[o.situacao] ?? o.situacao, cor: o.situacaoCfg?.cor ?? "cinza", data: o.entrada });

  const porChave = new Map<string, DocumentoReserva>();
  for (const r of reservas) {
    const doc = docs.get(`${r.origemTipo}:${r.origemId}`);
    if (!doc) continue; // documento de outra empresa (ou excluído)
    const k = `${r.produtoId}|${doc.chave}`;
    let d = porChave.get(k);
    if (!d) {
      d = { ...doc, quantidade: 0, falta: 0, locais: [], separado: true };
      porChave.set(k, d);
      mapa.set(r.produtoId, [...(mapa.get(r.produtoId) ?? []), d]);
    }
    const q = Number(r.quantidade);
    d.quantidade += q;
    d.separado &&= r.separado;
    if (!r.local) d.falta += q;
    else {
      const l = d.locais.find((x) => x.codigo === r.local!.codigo && x.deposito === r.local!.deposito.nome);
      if (l) l.quantidade += q;
      else d.locais.push({ codigo: r.local.codigo, deposito: r.local.deposito.nome, quantidade: q });
    }
  }
  // mais antigos primeiro: quem reservou antes
  for (const lista of mapa.values()) lista.sort((a, b) => a.data.getTime() - b.data.getTime());
  return mapa;
}

/** Reservas de um produto, por documento. */
export async function reservasDoProduto(produtoId: string) {
  return (await reservasDosProdutos([produtoId])).get(produtoId) ?? [];
}
