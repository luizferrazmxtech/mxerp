import { Pagina } from "@/components/ui/Pagina";
import { FormMensagemOrc } from "@/components/orcamentos/FormsAuxOrc";

export const metadata = { title: "Adicionar mensagem" };

export default function Adicionar() {
  return <Pagina titulo="Adicionar mensagem" trilha={[{ rotulo: "Mensagens", href: "/orcamentos/mensagens" }, { rotulo: "Adicionar" }]}><FormMensagemOrc /></Pagina>;
}
