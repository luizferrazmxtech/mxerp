import ListaOrcamentos from "@/components/orcamentos/ListaOrcamentos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orçamentos de produtos" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <ListaOrcamentos tipo="PRODUTO" sp={await searchParams} />;
}
