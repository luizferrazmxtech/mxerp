import Link from "next/link";
import { Situacao, Titulo, Vazio } from "@/components/portal/ui";
import { exigirCliente } from "@/lib/portal/atual";
import { listarOs } from "@/lib/portal/dados";
import { brl, dataSP } from "@/lib/ui/format";

export const metadata = { title: "Ordens de serviço" };

export default async function OsPortal({ searchParams }: { searchParams: Promise<{ todas?: string }> }) {
  const c = await exigirCliente();
  const todas = (await searchParams).todas === "1";
  const lista = await listarOs(c.id);
  const os = todas ? lista : lista.filter((o) => o.aberta);
  const filtro = (
    <div className="flex rounded-md border border-slate-300 bg-white p-0.5 text-[13px]">
      <Link href="/area-cliente/os" className={`rounded px-3 py-1.5 ${!todas ? "bg-tinta text-white" : "text-slate-600"}`}>Em andamento</Link>
      <Link href="/area-cliente/os?todas=1" className={`rounded px-3 py-1.5 ${todas ? "bg-tinta text-white" : "text-slate-600"}`}>Todas ({lista.length})</Link>
    </div>
  );
  return (
    <>
      <Titulo titulo="Ordens de serviço" subtitulo="Toque em uma OS para ver o andamento, os itens, as fotos e as notas." acoes={filtro} />
      {!os.length ? <Vazio icone="os" texto={todas ? "Você ainda não tem ordens de serviço." : "Nenhuma OS em andamento agora."} /> : (
        <div className="cartao">
          <ul className="divide-y divide-slate-100 md:hidden">
            {os.map((o) => (
              <li key={o.id}>
                <Link href={`/area-cliente/os/${o.id}`} className="block space-y-1.5 px-4 py-3 active:bg-slate-50">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 font-semibold">OS nº {o.numero}</span>
                    {o.total !== null && <span className="font-semibold">{brl(o.total)}</span>}
                  </div>
                  {o.equipamentos.length > 0 && <div className="text-[13px] text-slate-700">{o.equipamentos.join(", ")}</div>}
                  <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
                    <Situacao {...o.situacao} /> Entrada {dataSP(o.entrada)}{o.previsao && !o.saida && <> · previsão {dataSP(o.previsao)}</>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="tabela">
              <thead><tr><th className="w-24">Nº</th><th>Equipamento / serviço</th><th>Entrada</th><th>Previsão</th><th>Saída</th><th>Situação</th><th className="text-right">Valor</th></tr></thead>
              <tbody>
                {os.map((o) => (
                  <tr key={o.id}>
                    <td><Link href={`/area-cliente/os/${o.id}`} className="font-semibold text-marca hover:underline">{o.numero}</Link></td>
                    <td><Link href={`/area-cliente/os/${o.id}`} className="hover:underline">{o.equipamentos.join(", ") || "—"}</Link>{o.loja && <div className="text-[11px] uppercase text-slate-500">{o.loja}</div>}</td>
                    <td>{dataSP(o.entrada)}</td><td>{o.previsao ? dataSP(o.previsao) : "—"}</td><td>{o.saida ? dataSP(o.saida) : "—"}</td>
                    <td><Situacao {...o.situacao} /></td>
                    <td className="text-right">{o.total !== null ? brl(o.total) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
