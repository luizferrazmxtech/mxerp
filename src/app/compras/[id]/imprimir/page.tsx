import DocumentoCompra from "@/components/compras/DocumentoCompra";
import BotaoImprimir from "@/components/orcamentos/BotaoImprimir";

export const dynamic = "force-dynamic";
export const metadata = { title: "Imprimir compra" };

export default async function Imprimir({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div>
      <div className="no-print mb-3 flex justify-end"><BotaoImprimir /></div>
      <DocumentoCompra id={(await params).id} />
    </div>
  );
}
