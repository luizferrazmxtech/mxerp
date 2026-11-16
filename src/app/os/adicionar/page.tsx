import PaginaFormOs from "@/components/os/PaginaFormOs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Adicionar OS" };

export default async function Adicionar({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <PaginaFormOs clienteId={sp.cliente} />;
}
