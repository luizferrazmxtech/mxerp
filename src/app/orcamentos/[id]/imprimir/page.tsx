import DocumentoOrcamento from "@/components/orcamentos/DocumentoOrcamento";
import BotaoImprimir from "@/components/orcamentos/BotaoImprimir";

export const dynamic = "force-dynamic";
export const metadata = { title: "Imprimir orçamento" };

export default async function Imprimir({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div>
      <div className="no-print mb-3 flex justify-end"><BotaoImprimir /></div>
      <DocumentoOrcamento id={(await params).id} />
    </div>
  );
}
