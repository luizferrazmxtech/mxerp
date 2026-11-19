import PaginaFormContrato from "@/components/contratos/PaginaFormContrato";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar contrato" };

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  return <PaginaFormContrato id={(await params).id} />;
}
