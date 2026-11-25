import DocumentoVenda from "@/components/vendas/DocumentoVenda";
import BotaoImprimir from "@/components/orcamentos/BotaoImprimir";
import { tituloVenda } from "@/lib/documentos/nomeArquivo";

export const dynamic = "force-dynamic";
/** Uma só marcada: mesmo nome da impressão individual; várias: o título de sempre. */
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const ids = [(await searchParams).ids ?? []].flat();
  return ids.length === 1 ? tituloVenda({ id: ids[0] }, "Imprimir vendas") : { title: "Imprimir vendas" };
}

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
