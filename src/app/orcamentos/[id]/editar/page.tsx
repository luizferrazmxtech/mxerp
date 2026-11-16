import PaginaFormOrcamento from "@/components/orcamentos/PaginaFormOrcamento";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar orçamento" };

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  return <PaginaFormOrcamento id={(await params).id} />;
}
