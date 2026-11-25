import DocumentoOrcamento from "@/components/orcamentos/DocumentoOrcamento";
import BotaoImprimir from "@/components/orcamentos/BotaoImprimir";
import { tituloOrcamento } from "@/lib/documentos/nomeArquivo";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) { return tituloOrcamento({ token: (await params).token }, "Proposta comercial"); }

/** Link público da proposta (o cliente abre sem login). */
export default async function Proposta({ params }: { params: Promise<{ token: string }> }) {
  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-3 flex max-w-[21cm] justify-end"><BotaoImprimir /></div>
      <div className="shadow print:shadow-none"><DocumentoOrcamento token={(await params).token} /></div>
    </div>
  );
}
