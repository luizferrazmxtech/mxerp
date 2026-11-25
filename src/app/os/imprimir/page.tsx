import DocumentoOs from "@/components/os/DocumentoOs";
import BotaoImprimir from "@/components/orcamentos/BotaoImprimir";
import { tituloOs } from "@/lib/documentos/nomeArquivo";

export const dynamic = "force-dynamic";
/** Uma só marcada: mesmo nome da impressão individual; várias: o título de sempre. */
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const ids = [(await searchParams).ids ?? []].flat();
  return ids.length === 1 ? tituloOs({ id: ids[0] }, "Imprimir OS") : { title: "Imprimir OS" };
}

/** Mais ações › Imprimir: as marcadas, uma por página. */
export default async function ImprimirVarias({ searchParams }: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const ids = [(await searchParams).ids ?? []].flat();
  return (
    <div className="bg-white">
      <div className="no-print mb-3 flex items-center justify-end gap-3 p-4 text-[13px]">{ids.length} OS <BotaoImprimir /></div>
      {ids.map((id) => <div key={id} style={{ breakAfter: "page" }}><DocumentoOs id={id} /></div>)}
    </div>
  );
}
