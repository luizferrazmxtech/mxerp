import ListaVendas, { type ParamsVendas } from "../Lista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vendas balcão" };

export default async function VendasBalcao({ searchParams }: { searchParams: Promise<ParamsVendas> }) {
  return <ListaVendas tipo="BALCAO" sp={await searchParams} />;
}
