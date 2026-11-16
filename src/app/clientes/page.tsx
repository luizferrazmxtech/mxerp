import ListaPessoas, { MaisAcoesPessoas, type ParamsLista } from "@/components/cadastros/ListaPessoas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clientes" };

export default async function PaginaClientes({ searchParams }: { searchParams: Promise<ParamsLista> }) {
  const sp = await searchParams;
  return <ListaPessoas papel="cliente" sp={sp} maisAcoes={<MaisAcoesPessoas papel="cliente" sp={sp} />} />;
}
