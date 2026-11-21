import { notFound } from "next/navigation";
import Icone from "@/components/Icone";
import { Dados, Itens, LinhaDoTempo, Totais } from "@/components/portal/Detalhe";
import { ListaContas, ListaNotas, Secao, Situacao, Titulo } from "@/components/portal/ui";
import { exigirCliente } from "@/lib/portal/atual";
import { verVenda } from "@/lib/portal/dados";
import { data, dataSP } from "@/lib/ui/format";

export const metadata = { title: "Compra" };

export default async function VerCompraPortal({ params }: { params: Promise<{ id: string }> }) {
  const c = await exigirCliente();
  const v = await verVenda(c.id, (await params).id);
  if (!v) notFound();
  return (
    <>
      <Titulo voltar="/area-cliente/compras" titulo={<>Compra nº {v.numero} <Situacao {...v.situacao} /></>}
        subtitulo={v.loja ? <span className="uppercase">{v.loja.nome}</span> : undefined}
        acoes={<a href={`/cobranca/${v.token}`} target="_blank" rel="noreferrer" className="btn-sec"><Icone nome="imprimir" size={15} /> Imprimir / PDF</a>} />
      <Secao titulo="Dados da compra" icone="detalhes">
        <Dados itens={[["Data", dataSP(v.data)], ["Previsão de entrega", v.prazoEntrega ? data(v.prazoEntrega) : null], ["Vendedor", v.vendedor]]} />
        {v.observacoes && <p className="mt-3 whitespace-pre-line border-t border-slate-100 pt-3 text-[14px]">{v.observacoes}</p>}
      </Secao>
      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <Secao titulo="Itens" icone="lista" corpo="p-0">
          <Itens itens={v.itens} valores />
          <div className="border-t border-slate-100"><Totais t={v.totais} /></div>
        </Secao>
        <div><Secao titulo="Andamento" icone="hoje"><LinhaDoTempo passos={v.linhaDoTempo} /></Secao></div>
      </div>
      <Secao titulo="Notas fiscais" icone="notas" corpo="p-0"><ListaNotas notas={v.notas} semOrigem /></Secao>
      <Secao titulo="Pagamentos" icone="boleto" corpo="p-0"><ListaContas contas={v.contas} vazio="Nenhuma parcela lançada para esta compra." /></Secao>
    </>
  );
}
