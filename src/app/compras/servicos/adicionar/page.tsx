import PaginaFormCompra from "@/components/compras/PaginaFormCompra";

export const dynamic = "force-dynamic";
export const metadata = { title: "Adicionar compra de serviços" };

export default async function Adicionar({ searchParams }: { searchParams: Promise<{ cotacao?: string; f?: string }> }) {
  const sp = await searchParams;
  return <PaginaFormCompra tipo="SERVICO" cotacao={sp.cotacao} fornecedorCotacao={sp.f} />;
}
