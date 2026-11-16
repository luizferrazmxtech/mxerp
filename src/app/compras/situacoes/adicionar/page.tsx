import { Pagina } from "@/components/ui/Pagina";
import { FormSituacaoCompra } from "@/components/compras/FormsAuxCompra";

export const metadata = { title: "Adicionar situação" };

export default function Adicionar() {
  return <Pagina titulo="Adicionar situação" trilha={[{ rotulo: "Situações", href: "/compras/situacoes" }, { rotulo: "Adicionar" }]}><FormSituacaoCompra usada={0} /></Pagina>;
}
