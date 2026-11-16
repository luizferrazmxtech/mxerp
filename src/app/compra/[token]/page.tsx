import DocumentoCompra from "@/components/compras/DocumentoCompra";
import BotaoImprimir from "@/components/orcamentos/BotaoImprimir";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pedido de compra" };

/** "Link da compra": o fornecedor vê o pedido sem precisar de login. */
export default async function LinkCompra({ params }: { params: Promise<{ token: string }> }) {
  return (
    <div className="min-h-screen bg-slate-100 py-6">
      <div className="no-print mx-auto mb-3 flex max-w-[21cm] justify-end"><BotaoImprimir /></div>
      <DocumentoCompra token={(await params).token} />
    </div>
  );
}
