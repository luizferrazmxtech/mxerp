import PaginaFormServico from "@/components/itens/PaginaFormServico";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar serviço" };

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PaginaFormServico id={id} />;
}
