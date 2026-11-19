import PaginaFormContrato from "@/components/contratos/PaginaFormContrato";

export const dynamic = "force-dynamic";
export const metadata = { title: "Adicionar contrato" };

export default async function Adicionar({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  return <PaginaFormContrato clienteId={(await searchParams).cliente} />;
}
