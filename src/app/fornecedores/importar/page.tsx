import ImportarPessoas from "@/components/cadastros/ImportarPessoas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importar fornecedores" };

export default async function Importar({ searchParams }: { searchParams: Promise<{ origem?: string }> }) {
  const { origem } = await searchParams;
  return <ImportarPessoas papel="fornecedor" nfe={origem === "nfe"} />;
}
