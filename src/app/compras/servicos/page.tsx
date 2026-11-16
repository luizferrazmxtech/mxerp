import ListaCompras from "@/components/compras/ListaCompras";
import type { ParamsCompras } from "@/lib/compras/compras";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compras de serviços" };

export default async function ComprasServicos({ searchParams }: { searchParams: Promise<ParamsCompras> }) {
  return <ListaCompras tipo="SERVICO" sp={await searchParams} />;
}
