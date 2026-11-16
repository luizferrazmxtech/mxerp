import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import DocumentoEstoque from "@/components/estoque/DocumentoEstoque";
import BotaoImprimir from "@/components/orcamentos/BotaoImprimir";

export const dynamic = "force-dynamic";
export const metadata = { title: "Imprimir ajuste de estoque" };

export default async function ImprimirAjuste({ params }: { params: Promise<{ id: string }> }) {
  const a = await prisma.ajusteEstoque.findUnique({ where: { id: (await params).id }, include: { itens: { orderBy: { ordem: "asc" }, include: { produto: { select: { codigo: true, nome: true, unidade: true } } } } } });
  if (!a) notFound();
  return (
    <div>
      <div className="no-print mb-3 flex justify-end"><BotaoImprimir /></div>
      <DocumentoEstoque titulo={`Ajuste de estoque nº ${a.numero}`} data={a.createdAt} por={a.criadoPorNome} info={[["Movimentação", a.tipo === "SAIDA" ? "Saída" : "Entrada"], ["Itens", String(a.itens.length)]]}
        linhas={a.itens.map((i) => ({ codigo: i.produto.codigo, nome: i.produto.nome, unidade: i.produto.unidade, quantidade: i.quantidade, custo: i.custoUnit, total: i.total }))} frete={a.frete} total={a.total} observacoes={a.observacoes} />
    </div>
  );
}
