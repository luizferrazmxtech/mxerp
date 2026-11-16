import { Pagina } from "@/components/ui/Pagina";
import { FormEtiqueta } from "@/components/itens/FormsAuxiliares";

export const metadata = { title: "Adicionar etiqueta" };

export default function Adicionar() {
  return <Pagina titulo="Adicionar modelo de etiqueta" trilha={[{ rotulo: "Etiquetas", href: "/etiquetas" }, { rotulo: "Adicionar" }]}><FormEtiqueta /></Pagina>;
}
