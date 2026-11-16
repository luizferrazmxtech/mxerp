import { Pagina } from "@/components/ui/Pagina";
import { FormCampoExtra } from "@/components/cadastros/Auxiliares";

export const metadata = { title: "Adicionar campo extra" };

export default function Adicionar() {
  return <Pagina titulo="Adicionar campo extra" trilha={[{ rotulo: "Campos extras", href: "/campos-extras" }, { rotulo: "Adicionar" }]}><FormCampoExtra /></Pagina>;
}
