import { Pagina } from "@/components/ui/Pagina";
import { FormMensagemOrc } from "@/components/orcamentos/FormsAuxOrc";
import { salvarMensagemOsAcao } from "@/lib/os/acoes";

export const metadata = { title: "Adicionar mensagem" };

export default function Adicionar() {
  return <Pagina titulo="Adicionar mensagem" trilha={[{ rotulo: "Mensagens", href: "/os/mensagens" }, { rotulo: "Adicionar" }]}><FormMensagemOrc acao={salvarMensagemOsAcao} voltar="/os/mensagens" /></Pagina>;
}
