import PaginaFormPessoa from "@/components/cadastros/PaginaFormPessoa";

export const dynamic = "force-dynamic";
export const metadata = { title: "Adicionar cliente" };

export default function Adicionar() {
  return <PaginaFormPessoa papel="cliente" />;
}
