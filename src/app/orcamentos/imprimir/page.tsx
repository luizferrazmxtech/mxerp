import DocumentoOrcamento from "@/components/orcamentos/DocumentoOrcamento";
import BotaoImprimir from "@/components/orcamentos/BotaoImprimir";

export const dynamic = "force-dynamic";
export const metadata = { title: "Imprimir orçamentos" };

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
