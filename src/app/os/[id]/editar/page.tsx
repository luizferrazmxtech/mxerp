import PaginaFormOs from "@/components/os/PaginaFormOs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar OS" };

export default async function Editar({ params }: { params: Promise<{ id: string }> }) {
  return <PaginaFormOs id={(await params).id} />;
}
