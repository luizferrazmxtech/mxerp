import ListaVendas from "@/components/vendas/ListaVendas";
import type { ParamsVendas } from "@/lib/vendas/pedidos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vendas" };

export default async function Vendas({ searchParams }: { searchParams: Promise<ParamsVendas> }) {
  return <ListaVendas tipo="PEDIDO" sp={await searchParams} />;
}
