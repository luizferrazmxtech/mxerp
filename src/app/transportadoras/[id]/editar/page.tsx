import PaginaFormPessoa from "@/components/cadastros/PaginaFormPessoa";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar transportadora" };

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PaginaFormPessoa papel="transportadora" id={id} />;
}
