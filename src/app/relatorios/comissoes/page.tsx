import Link from "next/link";
import { relatorioComissoes } from "@/lib/relatorios/relatorios";
import { paramsDe, periodoRelatorio } from "@/lib/relatorios/periodo";
import { Pagina } from "@/components/ui/Pagina";
import { BarraRelatorio, Kpi, brl } from "@/components/relatorios/Barra";
import { data } from "@/lib/ui/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Comissões" };

export default async function Comissoes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const per = periodoRelatorio(sp);
  const params = paramsDe(sp);
  const r = await relatorioComissoes(per);
  return (
    <Pagina titulo="Comissões" icone="percentual" trilha={[{ rotulo: "Relatórios", href: "/relatorios" }, { rotulo: "Comissões" }]}>
      <BarraRelatorio base="/relatorios/comissoes" params={params} csv={`/api/relatorios/comissoes?${new URLSearchParams(params)}`} />
      <p className="mb-2 text-[12px] text-slate-500">
        {per.rotulo} · vendas pelo vendedor; OS pelo vendedor ou, sem vendedor, pelo técnico · % e regra de liberação vêm do cadastro do funcionário
        (<Link href="/funcionarios" className="text-marca hover:underline">Funcionários</Link>)
      </p>
      <div className="mb-3 grid gap-3 md:grid-cols-3">
        <Kpi rotulo="Base de cálculo" valor={brl(r.reduce((s, f) => s + f.base, 0))} />
        <Kpi rotulo="Comissão total" valor={brl(r.reduce((s, f) => s + f.comissao, 0))} />
        <Kpi rotulo="Liberada para pagar" valor={brl(r.reduce((s, f) => s + f.liberada, 0))} cor="text-emerald-700" />
      </div>
      {r.map((f) => (
        <div key={f.usuarioId} className="cartao mb-3 overflow-x-auto">
          <div className="flex flex-wrap items-center gap-3 border-b bg-[#f7f7f7] px-3 py-2 text-[13px]">
            <b>{f.nome}</b><span className="text-slate-500">{f.percentual}% · {f.regra}</span>
            <span className="ml-auto">Comissão <b>{brl(f.comissao)}</b> · liberada <b className="text-emerald-700">{brl(f.liberada)}</b></span>
          </div>
          <table className="tabela">
            <thead><tr><th>Documento</th><th>Data</th><th>Cliente</th><th className="text-right">Base</th><th className="text-right">Comissão</th><th className="text-right">Recebido</th><th className="text-right">Liberada</th></tr></thead>
            <tbody>{f.linhas.map((l) => (
              <tr key={l.docId}>
                <td><Link href={l.origem === "OS" ? `/os/${l.docId}` : `/vendas/${l.docId}`} className="text-marca hover:underline">{l.origem === "OS" ? "OS" : "Venda"} nº {l.numero}</Link></td>
                <td>{data(l.data)}</td><td>{l.cliente}</td><td className="text-right">{brl(l.base)}</td><td className="text-right">{brl(l.comissao)}</td>
                <td className="text-right text-[12px]">{l.totalReceber ? `${brl(l.recebido)} de ${brl(l.totalReceber)}` : "sem financeiro"}</td>
                <td className="text-right">{brl(l.liberada)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}
      {!r.length && <div className="cartao py-8 text-center text-slate-500">Nenhuma venda/OS com vendedor ou técnico no período (ou sem % de comissão no cadastro).</div>}
    </Pagina>
  );
}
