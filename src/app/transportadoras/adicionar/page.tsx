import PaginaFormPessoa from "@/components/cadastros/PaginaFormPessoa";

export const dynamic = "force-dynamic";
export const metadata = { title: "Adicionar transportadora" };

export default function Adicionar() {
  return <PaginaFormPessoa papel="transportadora" />;
}
