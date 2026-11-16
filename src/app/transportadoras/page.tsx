import ListaPessoas, { MaisAcoesPessoas, type ParamsLista } from "@/components/cadastros/ListaPessoas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transportadoras" };

export default async function PaginaTransportadoras({ searchParams }: { searchParams: Promise<ParamsLista> }) {
  const sp = await searchParams;
  return <ListaPessoas papel="transportadora" sp={sp} maisAcoes={<MaisAcoesPessoas papel="transportadora" sp={sp} />} />;
}
