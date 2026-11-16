import Link from "next/link";
import DocumentoOs from "@/components/os/DocumentoOs";
import BotaoImprimir from "@/components/orcamentos/BotaoImprimir";

export const dynamic = "force-dynamic";
export const metadata = { title: "Imprimir OS" };

/** OS para imprimir ou salvar em PDF, com o cabeçalho da MXTECH. */
export default async function ImprimirOs({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="bg-white">
      <div className="no-print mx-auto mb-4 flex max-w-[820px] gap-2 p-6 pb-0"><Link href={`/os/${id}`} className="btn-sec">Voltar</Link><BotaoImprimir /></div>
      <DocumentoOs id={id} />
    </div>
  );
}
