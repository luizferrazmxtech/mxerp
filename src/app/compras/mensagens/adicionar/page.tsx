import { Pagina } from "@/components/ui/Pagina";
import { FormMensagemOrc } from "@/components/orcamentos/FormsAuxOrc";
import { salvarMensagemCompraAcao, salvarMensagemCotacaoAcao } from "@/lib/compras/acoes";

export const metadata = { title: "Adicionar modelo de e-mail" };

export default async function Adicionar({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const cot = (await searchParams).tipo === "COTACAO";
  return <Pagina titulo={cot ? "Adicionar modelo de cotação" : "Adicionar modelo de compra"} trilha={[{ rotulo: "Modelos de e-mail", href: "/compras/mensagens" }, { rotulo: "Adicionar" }]}><FormMensagemOrc acao={cot ? salvarMensagemCotacaoAcao : salvarMensagemCompraAcao} voltar="/compras/mensagens" /></Pagina>;
}
