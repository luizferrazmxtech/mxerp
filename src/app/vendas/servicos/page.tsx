import ListaVendas from "@/components/vendas/ListaVendas";
import type { ParamsVendas } from "@/lib/vendas/pedidos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vendas de serviços" };

export default async function VendasServicos({ searchParams }: { searchParams: Promise<ParamsVendas> }) {
  return <ListaVendas tipo="SERVICO" sp={await searchParams} />;
}
