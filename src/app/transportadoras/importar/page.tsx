import ImportarPessoas from "@/components/cadastros/ImportarPessoas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importar transportadoras" };

export default async function Importar({ searchParams }: { searchParams: Promise<{ origem?: string }> }) {
  const { origem } = await searchParams;
  return <ImportarPessoas papel="transportadora" nfe={origem === "nfe"} />;
}
