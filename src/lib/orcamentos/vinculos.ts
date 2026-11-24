import { prisma, type Tx } from "@/lib/db";

/**
 * Venda ou OS cancelada: desfaz o vínculo com o orçamento que a gerou, para ele poder gerar venda ou OS de novo.
 * Se o orçamento estava numa situação de concretizado (gera venda) e não tem outro documento ligado,
 * volta para a primeira situação que não gera venda (ex.: "Em aberto").
 */
export async function liberarOrcamentos(tx: Tx, doc: { vendaId: string } | { osId: string }, motivo: string, usuarioNome?: string | null) {
  const orcs = await tx.orcamento.findMany({ where: doc, include: { situacao: true } });
  const liberados: { numero: number; situacao: string | null }[] = [];
  for (const o of orcs) {
    const outro = "vendaId" in doc ? o.osId : o.vendaId;
    const volta = o.situacao.geraVenda && !outro
      ? await tx.situacaoOrcamento.findFirst({ where: { geraVenda: false, empresaId: o.situacao.empresaId }, orderBy: { ordem: "asc" } })
      : null;
    await tx.orcamento.update({ where: { id: o.id }, data: { ...("vendaId" in doc ? { vendaId: null } : { osId: null }), ...(volta ? { situacaoId: volta.id } : {}) } });
    await tx.orcamentoHistorico.create({
      data: {
        orcamentoId: o.id, usuarioNome: usuarioNome ?? null, situacao: (volta ?? o.situacao).nome,
        descricao: `${motivo}: vínculo desfeito${volta ? ` e orçamento voltou para "${volta.nome}"` : ""}. Pode gerar venda ou OS de novo.`,
      },
    });
    liberados.push({ numero: o.numero, situacao: volta?.nome ?? null });
  }
  return liberados;
}

/** O que acontece com cada orçamento ligado, para a confirmação antes de cancelar. */
export async function previaOrcamentos(doc: { vendaId: string } | { osId: string }) {
  const orcs = await prisma.orcamento.findMany({ where: doc, include: { situacao: true } });
  const linhas: string[] = [];
  for (const o of orcs) {
    const outro = "vendaId" in doc ? o.osId : o.vendaId;
    const volta = o.situacao.geraVenda && !outro
      ? await prisma.situacaoOrcamento.findFirst({ where: { geraVenda: false, empresaId: o.situacao.empresaId }, orderBy: { ordem: "asc" } })
      : null;
    linhas.push(`Orçamento nº ${o.numero}: desfaz o vínculo${volta ? ` e volta para "${volta.nome}"` : ""}, podendo gerar venda ou OS de novo`);
  }
  return linhas;
}
