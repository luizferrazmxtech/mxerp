import DocumentoVenda from "@/components/vendas/DocumentoVenda";
import BotaoImprimir from "@/components/orcamentos/BotaoImprimir";
import { tituloVenda } from "@/lib/documentos/nomeArquivo";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) { return tituloVenda({ id: (await params).id }); }

export default async function Imprimir({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div>
      <div className="no-print mb-3 flex justify-end"><BotaoImprimir /></div>
      <DocumentoVenda id={(await params).id} />
    </div>
  );
}
