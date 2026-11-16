import ListaOrcamentos from "@/components/orcamentos/ListaOrcamentos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orçamentos de serviços" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <ListaOrcamentos tipo="SERVICO" sp={await searchParams} />;
}
