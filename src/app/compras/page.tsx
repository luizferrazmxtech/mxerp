import ListaCompras from "@/components/compras/ListaCompras";
import type { ParamsCompras } from "@/lib/compras/compras";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compras de produtos" };

export default async function Compras({ searchParams }: { searchParams: Promise<ParamsCompras> }) {
  return <ListaCompras tipo="PRODUTO" sp={await searchParams} />;
}
