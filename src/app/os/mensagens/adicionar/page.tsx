import { Pagina } from "@/components/ui/Pagina";
import { FormMensagemOrc } from "@/components/orcamentos/FormsAuxOrc";
import { salvarMensagemOsAcao } from "@/lib/os/acoes";
import { TAGS_WHATSAPP_OS, TEXTO_PADRAO_OS } from "@/lib/whatsapp/tipos";

export const metadata = { title: "Adicionar mensagem" };

export default function Adicionar() {
  return <Pagina titulo="Adicionar mensagem" trilha={[{ rotulo: "Mensagens", href: "/os/mensagens" }, { rotulo: "Adicionar" }]}><FormMensagemOrc acao={salvarMensagemOsAcao} voltar="/os/mensagens" whatsapp={{ tags: TAGS_WHATSAPP_OS, padrao: TEXTO_PADRAO_OS }} /></Pagina>;
}
