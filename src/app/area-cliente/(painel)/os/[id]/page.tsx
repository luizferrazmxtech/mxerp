import { notFound } from "next/navigation";
import Icone from "@/components/Icone";
import { Dados, Itens, LinhaDoTempo, Totais } from "@/components/portal/Detalhe";
import { ListaContas, ListaNotas, Secao, Situacao, Titulo } from "@/components/portal/ui";
import { exigirCliente } from "@/lib/portal/atual";
import { verOs } from "@/lib/portal/dados";
import { dataSP } from "@/lib/ui/format";

export const metadata = { title: "Ordem de serviço" };

export default async function VerOsPortal({ params }: { params: Promise<{ id: string }> }) {
  const c = await exigirCliente();
  const o = await verOs(c.id, (await params).id);
  if (!o) notFound();
  const itens = [...o.servicos, ...o.produtos];
  return (
    <>
      <Titulo voltar="/area-cliente/os" titulo={<>OS nº {o.numero} <Situacao {...o.situacao} /></>}
        subtitulo={o.loja ? <span className="uppercase">{o.loja.nome}</span> : undefined}
        acoes={<a href={`/cobranca/os/${o.token}`} target="_blank" rel="noreferrer" className="btn-sec"><Icone nome="imprimir" size={15} /> Imprimir / PDF</a>} />

      <Secao titulo="Dados da OS" icone="detalhes">
        <Dados itens={[["Entrada", dataSP(o.entrada)], ["Previsão", o.previsao ? dataSP(o.previsao) : "—"], ["Saída", o.saida ? dataSP(o.saida) : "—"], ["Técnico", o.tecnico]]} />
        {o.observacoes && <p className="mt-3 whitespace-pre-line border-t border-slate-100 pt-3 text-[14px]">{o.observacoes}</p>}
      </Secao>

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div>
          {o.equipamentos.map((e, i) => (
            <Secao key={e.id} titulo={o.equipamentos.length > 1 ? `Equipamento ${i + 1}: ${e.equipamento}` : e.equipamento} icone="os">
              <Dados itens={[["Marca", e.marca], ["Modelo", e.modelo], ["Nº de série", e.serie], ["Acessórios", e.acessorios]]} />
              {([["Defeito informado", e.defeitos], ["Solução", e.solucao], ["Laudo técnico", e.laudo], ["Garantia", e.garantia]] as const).filter(([, v]) => v).map(([r, v]) => (
                <div key={r} className="mt-3 border-t border-slate-100 pt-3"><div className="text-[12px] text-slate-500">{r}</div><p className="whitespace-pre-line text-[14px]">{v}</p></div>
              ))}
            </Secao>
          ))}
          <Secao titulo="Serviços e produtos" icone="lista" corpo="p-0">
            <Itens itens={itens} valores={!!o.totais} />
            {o.totais && <div className="border-t border-slate-100"><Totais t={o.totais} /></div>}
          </Secao>
          {o.fotos.length > 0 && (
            <Secao titulo={`Fotos da instalação (${o.fotos.length})`} icone="foto">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {o.fotos.map((f) => (
                  <a key={f.id} href={`/area-cliente/arquivos/foto/${f.id}`} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/area-cliente/arquivos/foto/${f.id}`} alt={f.nome} loading="lazy" className="aspect-square w-full object-cover transition group-hover:scale-105" />
                  </a>
                ))}
              </div>
            </Secao>
          )}
        </div>
        <div>
          <Secao titulo="Andamento" icone="hoje"><LinhaDoTempo passos={o.linhaDoTempo} /></Secao>
        </div>
      </div>

      <Secao titulo="Notas fiscais" icone="notas" corpo="p-0"><ListaNotas notas={o.notas} semOrigem /></Secao>
      <Secao titulo="Pagamentos" icone="boleto" corpo="p-0"><ListaContas contas={o.contas} vazio="Nenhuma parcela lançada para esta OS." /></Secao>
    </>
  );
}
