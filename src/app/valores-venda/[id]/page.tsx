import PaginaFormTipoValor from "@/components/itens/PaginaFormTipoValor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar valor de venda" };

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  return <PaginaFormTipoValor id={(await params).id} />;
}
