import Link from "next/link";
import { relatorioLucro, type AgruparLucro } from "@/lib/relatorios/relatorios";
import { paramsDe, periodoRelatorio } from "@/lib/relatorios/periodo";
import { Pagina } from "@/components/ui/Pagina";
import { BarraRelatorio, Kpi, brl, pct } from "@/components/relatorios/Barra";
import { qtd } from "@/lib/ui/format";
import { GraficoColunas } from "@/components/inicio/Graficos";
import { BarrasH } from "@/components/relatorios/Graficos";
import { rotuloMesCurto } from "@/lib/datas";
import { urlCom } from "@/components/ui/BarraLista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lucro das vendas e OS" };

const POR: [AgruparLucro, string][] = [["documento", "Por venda/OS"], ["cliente", "Por cliente"], ["vendedor", "Por vendedor"], ["produto", "Por produto"], ["servico", "Por serviço"]];

export default async function Lucro({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const per = periodoRelatorio(sp);
  const por = (POR.find(([k]) => k === sp.por)?.[0] ?? "documento") as AgruparLucro;
  const params = paramsDe(sp);
  const r = await relatorioLucro(per, por, { vendedorId: sp.vendedor || undefined });
  const t = r.totais;
  return (
    <Pagina titulo="Lucro das vendas e OS" icone="dinheiro" trilha={[{ rotulo: "Relatórios", href: "/relatorios" }, { rotulo: "Lucro" }]}>
      <BarraRelatorio base="/relatorios/lucro" params={params} opcoes={[{ chave: "por", padrao: "documento", valores: POR }]} csv={`/api/relatorios/lucro?${new URLSearchParams(params)}`} />
      <p className="mb-2 text-[12px] text-slate-500">{per.rotulo} · vendas concretizadas e OS concluídas/faturadas · receita com o desconto geral rateado, sem frete · custo = custo das peças gravado na venda/OS</p>
      <div className="mb-3 grid gap-3 md:grid-cols-4">
        <Kpi rotulo="Valor vendido" valor={brl(t.receita)} dica={`${t.documentos} documentos · ticket médio ${brl(t.ticket)}`} />
        <Kpi rotulo="Produtos / serviços" valor={brl(t.produtos)} dica={`serviços ${brl(t.servicos)}`} />
        <Kpi rotulo="Custo das peças" valor={brl(t.custo)} />
        <Kpi rotulo="Lucro bruto" valor={brl(t.lucro)} dica={`${pct(t.margem)} de margem`} cor={t.lucro < 0 ? "text-red-600" : "text-emerald-700"} />
      </div>
      <div className="mb-3 grid gap-3 lg:grid-cols-5">
        <div className={`cartao p-4 ${por === "documento" ? "lg:col-span-5" : "lg:col-span-3"}`}>
          <h3 className="mb-2 text-[14px] font-semibold text-slate-700">Faturamento e lucro {r.evolucao.porDia ? "por dia" : "por mês"}</h3>
          <GraficoColunas titulo={`Faturamento e lucro ${r.evolucao.porDia ? "por dia" : "por mês"}`} formatar={brl}
            rotulos={r.evolucao.pontos.map((p) => (r.evolucao.porDia ? p.chave.slice(8) : rotuloMesCurto(p.chave)))}
            links={r.evolucao.porDia ? undefined : r.evolucao.pontos.map((p) => urlCom("/relatorios/lucro", params, { periodo: p.chave, pde: undefined, pate: undefined }))}
            series={[{ nome: "Faturamento", cor: "#018e83", valores: r.evolucao.pontos.map((p) => p.receita) }, { nome: "Lucro bruto", cor: "#2f6fd6", valores: r.evolucao.pontos.map((p) => p.lucro) }]} />
        </div>
        {por !== "documento" && (
          <div className="lg:col-span-2">
            <BarrasH titulo={`Os 10 maiores (${POR.find(([k]) => k === por)![1].toLowerCase()})`} formatar={brl}
              series={[{ nome: "Custo", cor: "#cbd5e1" }, { nome: "Lucro", cor: "#2f6fd6" }]}
              linhas={r.linhas.slice(0, 10).map((l) => ({ chave: l.chave, rotulo: l.rotulo, href: l.href, valores: [l.custo, Math.max(l.lucro, 0)], total: `${brl(l.receita)} · ${pct(l.margem)}` }))} />
          </div>
        )}
      </div>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>{POR.find(([k]) => k === por)![1].replace("Por ", "").replace(/^./, (c) => c.toUpperCase())}</th>{por !== "documento" && <th className="text-right">Docs</th>}{(por === "produto" || por === "servico") && <th className="text-right">Qtd</th>}<th className="text-right">Receita</th><th className="text-right">Custo</th><th className="text-right">Lucro</th><th className="text-right">Margem</th></tr></thead>
          <tbody>
            {r.linhas.map((l) => (
              <tr key={l.chave}>
                <td>{l.href ? <Link href={l.href} className="text-marca hover:underline">{l.rotulo}</Link> : l.rotulo}{l.detalhe && <span className="ml-2 text-[12px] text-slate-500">{l.detalhe}</span>}</td>
                {por !== "documento" && <td className="text-right">{l.documentos}</td>}
                {(por === "produto" || por === "servico") && <td className="text-right">{qtd(l.quantidade)}</td>}
                <td className="text-right">{brl(l.receita)}</td><td className="text-right">{brl(l.custo)}</td>
                <td className={`text-right ${l.lucro < 0 ? "text-red-600" : ""}`}>{brl(l.lucro)}</td>
                <td className={`text-right ${l.margem < 0.15 ? "text-amber-700" : ""}`}>{pct(l.margem)}</td>
              </tr>
            ))}
            {!r.linhas.length && <tr><td colSpan={7} className="py-8 text-center text-slate-500">Nada vendido no período.</td></tr>}
          </tbody>
        </table>
      </div>
    </Pagina>
  );
}
