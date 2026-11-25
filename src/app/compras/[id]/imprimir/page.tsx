import DocumentoCompra from "@/components/compras/DocumentoCompra";
import BotaoImprimir from "@/components/orcamentos/BotaoImprimir";
import { tituloCompra } from "@/lib/documentos/nomeArquivo";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) { return tituloCompra((await params).id); }

export default async function Imprimir({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div>
      <div className="no-print mb-3 flex justify-end"><BotaoImprimir /></div>
      <DocumentoCompra id={(await params).id} />
    </div>
  );
}
