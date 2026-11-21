import Icone from "@/components/Icone";
import { Situacao, Titulo, Vazio } from "@/components/portal/ui";
import { exigirCliente } from "@/lib/portal/atual";
import { listarOrcamentos } from "@/lib/portal/dados";
import { brl, data } from "@/lib/ui/format";

export const metadata = { title: "Orçamentos" };

export default async function OrcamentosPortal() {
  const c = await exigirCliente();
  const os = await listarOrcamentos(c.id);
  return (
    <>
      <Titulo titulo="Orçamentos" subtitulo="Propostas enviadas para você." />
      {!os.length ? <Vazio icone="cotacao" texto="Nenhum orçamento." /> : (
        <div className="cartao">
          <ul className="divide-y divide-slate-100">
            {os.map((o) => (
              <li key={o.id}>
                <a href={`/proposta/${o.token}`} target="_blank" rel="noreferrer" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">Orçamento nº {o.numero} <span className="font-normal text-slate-500">· {o.servicos ? "serviços" : "produtos"}</span></div>
                    <div className="text-[12px] text-slate-500">{data(o.data)}{o.validade && <> · validade {o.validade}</>}</div>
                  </div>
                  <Situacao {...o.situacao} />
                  {o.total !== null && <span className="w-28 text-right font-semibold">{brl(o.total)}</span>}
                  <Icone nome="direita" size={16} className="text-slate-400" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
