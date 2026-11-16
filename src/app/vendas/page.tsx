import ListaVendas, { type ParamsVendas } from "./Lista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vendas de produtos" };

export default async function Vendas({ searchParams }: { searchParams: Promise<ParamsVendas> }) {
  return <ListaVendas tipo="PEDIDO" sp={await searchParams} />;
}
