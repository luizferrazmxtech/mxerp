import DocumentoOs from "@/components/os/DocumentoOs";
import BotaoImprimir from "@/components/orcamentos/BotaoImprimir";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ordem de serviço" };

/** Link de cobrança da OS (o cliente abre sem login). */
export default async function CobrancaOs({ params }: { params: Promise<{ token: string }> }) {
  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-3 flex max-w-[820px] justify-end"><BotaoImprimir /></div>
      <div className="mx-auto max-w-[820px] shadow print:shadow-none"><DocumentoOs token={(await params).token} cobranca /></div>
    </div>
  );
}
