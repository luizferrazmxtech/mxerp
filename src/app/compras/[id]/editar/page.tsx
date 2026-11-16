import PaginaFormCompra from "@/components/compras/PaginaFormCompra";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar compra" };

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  return <PaginaFormCompra id={(await params).id} />;
}
