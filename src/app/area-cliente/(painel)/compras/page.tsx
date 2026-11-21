import Link from "next/link";
import { Situacao, Titulo, Vazio } from "@/components/portal/ui";
import { exigirCliente } from "@/lib/portal/atual";
import { listarVendas } from "@/lib/portal/dados";
import { brl, dataSP } from "@/lib/ui/format";

export const metadata = { title: "Compras" };

export default async function ComprasPortal() {
  const c = await exigirCliente();
  const vs = await listarVendas(c.id);
  return (
    <>
      <Titulo titulo="Compras" subtitulo="Seus pedidos e vendas, com itens, notas e pagamentos." />
      {!vs.length ? <Vazio icone="vendas" texto="Você ainda não tem compras." /> : (
        <div className="cartao">
          <ul className="divide-y divide-slate-100 md:hidden">
            {vs.map((v) => (
              <li key={v.id}>
                <Link href={`/area-cliente/compras/${v.id}`} className="block space-y-1.5 px-4 py-3 active:bg-slate-50">
                  <div className="flex items-center gap-2"><span className="flex-1 font-semibold">Compra nº {v.numero}</span><span className="font-semibold">{brl(v.total)}</span></div>
                  <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
                    <Situacao {...v.situacao} /> {dataSP(v.data)} · {v.itens} {v.itens === 1 ? "item" : "itens"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="tabela">
              <thead><tr><th className="w-24">Nº</th><th>Data</th><th>Itens</th><th>Loja</th><th>Situação</th><th className="text-right">Valor</th></tr></thead>
              <tbody>
                {vs.map((v) => (
                  <tr key={v.id}>
                    <td><Link href={`/area-cliente/compras/${v.id}`} className="font-semibold text-marca hover:underline">{v.numero}</Link></td>
                    <td>{dataSP(v.data)}</td><td>{v.itens}</td><td className="text-[12px] uppercase">{v.loja ?? "—"}</td>
                    <td><Situacao {...v.situacao} /></td><td className="text-right">{brl(v.total)}</td>
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
