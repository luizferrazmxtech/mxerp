import DocumentoVenda from "@/components/vendas/DocumentoVenda";
import BotaoImprimir from "@/components/orcamentos/BotaoImprimir";

export const dynamic = "force-dynamic";
export const metadata = { title: "Imprimir venda" };

export default async function Imprimir({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div>
      <div className="no-print mb-3 flex justify-end"><BotaoImprimir /></div>
      <DocumentoVenda id={(await params).id} />
    </div>
  );
}
