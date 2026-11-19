import PaginaFormCompra from "@/components/compras/PaginaFormCompra";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importar XML da compra" };

export default async function ImportarXml({ searchParams }: { searchParams: Promise<{ recebida?: string }> }) {
  const { recebida } = await searchParams;
  return <PaginaFormCompra xml recebidaId={recebida} />;
}
