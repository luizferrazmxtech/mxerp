import PaginaFormFuncionario from "@/components/cadastros/PaginaFormFuncionario";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar funcionário" };

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PaginaFormFuncionario id={id} />;
}
