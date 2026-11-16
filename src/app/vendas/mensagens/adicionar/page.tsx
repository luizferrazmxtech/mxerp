import { Pagina } from "@/components/ui/Pagina";
import { FormMensagemOrc } from "@/components/orcamentos/FormsAuxOrc";
import { salvarMensagemVendaAcao } from "@/lib/vendas/acoes";

export const metadata = { title: "Adicionar mensagem" };

export default function Adicionar() {
  return <Pagina titulo="Adicionar mensagem" trilha={[{ rotulo: "Mensagens", href: "/vendas/mensagens" }, { rotulo: "Adicionar" }]}><FormMensagemOrc acao={salvarMensagemVendaAcao} voltar="/vendas/mensagens" /></Pagina>;
}
