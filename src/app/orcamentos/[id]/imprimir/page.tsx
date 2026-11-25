import DocumentoOrcamento from "@/components/orcamentos/DocumentoOrcamento";
import BotaoImprimir from "@/components/orcamentos/BotaoImprimir";
import { tituloOrcamento } from "@/lib/documentos/nomeArquivo";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) { return tituloOrcamento({ id: (await params).id }); }

export default async function Imprimir({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div>
      <div className="no-print mb-3 flex justify-end"><BotaoImprimir /></div>
      <DocumentoOrcamento id={(await params).id} />
    </div>
  );
}
