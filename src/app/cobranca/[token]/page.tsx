import DocumentoVenda from "@/components/vendas/DocumentoVenda";
import BotaoImprimir from "@/components/orcamentos/BotaoImprimir";
import { tituloVenda } from "@/lib/documentos/nomeArquivo";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) { return tituloVenda({ token: (await params).token }, "Pedido de venda"); }

/** Link de cobrança (o cliente abre sem login). */
export default async function Cobranca({ params }: { params: Promise<{ token: string }> }) {
  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-3 flex max-w-[21cm] justify-end"><BotaoImprimir /></div>
      <div className="shadow print:shadow-none"><DocumentoVenda token={(await params).token} cobranca /></div>
    </div>
  );
}
