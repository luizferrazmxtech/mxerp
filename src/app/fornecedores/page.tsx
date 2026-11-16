import ListaPessoas, { MaisAcoesPessoas, type ParamsLista } from "@/components/cadastros/ListaPessoas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fornecedores" };

export default async function PaginaFornecedores({ searchParams }: { searchParams: Promise<ParamsLista> }) {
  const sp = await searchParams;
  return <ListaPessoas papel="fornecedor" sp={sp} maisAcoes={<MaisAcoesPessoas papel="fornecedor" sp={sp} />} />;
}
