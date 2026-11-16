import PaginaFormProduto from "@/components/itens/PaginaFormProduto";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar produto" };

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PaginaFormProduto id={id} />;
}
