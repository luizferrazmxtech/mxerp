import DocumentoVenda from "@/components/vendas/DocumentoVenda";
import BotaoImprimir from "@/components/orcamentos/BotaoImprimir";

export const dynamic = "force-dynamic";
export const metadata = { title: "Imprimir vendas" };

/** Mais ações › Imprimir: as marcadas, uma por página. */
export default async function ImprimirVarias({ searchParams }: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const ids = [(await searchParams).ids ?? []].flat();
  return (
    <div>
      <div className="no-print mb-3 flex items-center justify-end gap-3 text-[13px]">{ids.length} venda(s) <BotaoImprimir /></div>
      {ids.map((id) => <div key={id} style={{ breakAfter: "page" }}><DocumentoVenda id={id} /></div>)}
    </div>
  );
}
