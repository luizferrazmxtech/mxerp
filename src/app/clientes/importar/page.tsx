import ImportarPessoas from "@/components/cadastros/ImportarPessoas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importar clientes" };

export default async function Importar({ searchParams }: { searchParams: Promise<{ origem?: string }> }) {
  const { origem } = await searchParams;
  return <ImportarPessoas papel="cliente" nfe={origem === "nfe"} />;
}
