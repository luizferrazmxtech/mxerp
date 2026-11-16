import PaginaFormOrcamento from "@/components/orcamentos/PaginaFormOrcamento";

export const dynamic = "force-dynamic";
export const metadata = { title: "Adicionar orçamento" };

export default function Adicionar() {
  return <PaginaFormOrcamento tipo="SERVICO" />;
}
