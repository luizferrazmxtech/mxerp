import PaginaFormCompra from "@/components/compras/PaginaFormCompra";

export const dynamic = "force-dynamic";
export const metadata = { title: "Adicionar compra" };

export default async function Adicionar({ searchParams }: { searchParams: Promise<{ cotacao?: string; f?: string }> }) {
  const sp = await searchParams;
  return <PaginaFormCompra tipo="PRODUTO" cotacao={sp.cotacao} fornecedorCotacao={sp.f} />;
}
