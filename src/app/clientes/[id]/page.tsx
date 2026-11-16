import VerPessoa from "@/components/cadastros/VerPessoa";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visualizar cliente" };

export default async function Visualizar({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <VerPessoa papel="cliente" id={id} sp={sp} />;
}
