import DocumentoOrcamento from "@/components/orcamentos/DocumentoOrcamento";
import BotaoImprimir from "@/components/orcamentos/BotaoImprimir";
import { tituloOrcamento } from "@/lib/documentos/nomeArquivo";

export const dynamic = "force-dynamic";
/** Uma só marcada: mesmo nome da impressão individual; várias: o título de sempre. */
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const ids = [(await searchParams).ids ?? []].flat();
  return ids.length === 1 ? tituloOrcamento({ id: ids[0] }, "Imprimir orçamentos") : { title: "Imprimir orçamentos" };
}

/** Mais ações › Imprimir: os marcados, um por página. */
export default async function ImprimirVarios({ searchParams }: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const ids = [(await searchParams).ids ?? []].flat();
  return (
    <div>
      <div className="no-print mb-3 flex items-center justify-end gap-3 text-[13px]">{ids.length} orçamento(s) <BotaoImprimir /></div>
      {ids.map((id) => <div key={id} style={{ breakAfter: "page" }}><DocumentoOrcamento id={id} /></div>)}
    </div>
  );
}
