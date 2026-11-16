import { Pagina } from "@/components/ui/Pagina";
import { FormGrade } from "@/components/itens/FormsAuxiliares";

export const metadata = { title: "Adicionar grade" };

export default function Adicionar() {
  return <Pagina titulo="Adicionar grade" trilha={[{ rotulo: "Grades", href: "/grades" }, { rotulo: "Adicionar" }]}><FormGrade /></Pagina>;
}
