import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import DocumentoEstoque from "@/components/estoque/DocumentoEstoque";
import BotaoImprimir from "@/components/orcamentos/BotaoImprimir";

export const dynamic = "force-dynamic";
export const metadata = { title: "Imprimir transferência" };

export default async function ImprimirTransferencia({ params }: { params: Promise<{ id: string }> }) {
  const t = await prisma.transferenciaEstoque.findUnique({ where: { id: (await params).id }, include: { itens: { orderBy: { ordem: "asc" }, include: { produto: { select: { codigo: true, nome: true, unidade: true } } } } } });
  if (!t) notFound();
  const dep = new Map((await prisma.deposito.findMany({ where: { id: { in: [t.origemDepositoId, t.destinoDepositoId] } } })).map((d) => [d.id, d.nome]));
  return (
    <div>
      <div className="no-print mb-3 flex justify-end"><BotaoImprimir /></div>
      <DocumentoEstoque empresaId={t.empresaId} titulo={`Transferência nº ${t.numero}`} data={t.createdAt} por={t.criadoPorNome} info={[["Origem", dep.get(t.origemDepositoId) ?? ""], ["Destino", dep.get(t.destinoDepositoId) ?? ""]]}
        linhas={t.itens.map((i) => ({ codigo: i.produto.codigo, nome: i.produto.nome, unidade: i.produto.unidade, quantidade: i.quantidade, custo: i.custoUnit, total: Number(i.custoUnit) * Number(i.quantidade) }))} total={t.total} observacoes={t.observacoes} />
    </div>
  );
}
