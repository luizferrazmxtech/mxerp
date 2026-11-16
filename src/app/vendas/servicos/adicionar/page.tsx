import PaginaFormVenda from "@/components/vendas/PaginaFormVenda";

export const dynamic = "force-dynamic";
export const metadata = { title: "Adicionar venda" };

export default async function Adicionar({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <PaginaFormVenda tipo="SERVICO" clienteId={sp.cliente} />;
}
