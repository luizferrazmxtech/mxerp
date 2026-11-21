import { curvaAbc, type CriterioAbc } from "@/lib/relatorios/relatorios";
import { paramsDe, periodoRelatorio } from "@/lib/relatorios/periodo";
import { Pagina } from "@/components/ui/Pagina";
import { BarraRelatorio, Kpi, brl, pct } from "@/components/relatorios/Barra";
import { qtd } from "@/lib/ui/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Curva ABC" };

const COR = { A: "bg-emerald-100 text-emerald-800", B: "bg-amber-100 text-amber-800", C: "bg-slate-100 text-slate-600" };

export default async function CurvaAbc({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const per = periodoRelatorio(sp);
  const por = sp.por === "clientes" ? "clientes" : sp.por === "servicos" ? "servicos" : "produtos";
  const criterio = (["valor", "quantidade", "lucro"].includes(sp.criterio ?? "") ? sp.criterio : "valor") as CriterioAbc;
  const params = paramsDe(sp);
  const r = await curvaAbc(per, por, criterio, { vendedorId: sp.vendedor || undefined });
  const fmt = (v: number) => (criterio === "quantidade" ? qtd(v) : brl(v));
  return (
    <Pagina titulo="Curva ABC" icone="grafico" trilha={[{ rotulo: "Relatórios", href: "/relatorios" }, { rotulo: "Curva ABC" }]}>
      <BarraRelatorio base="/relatorios/curva-abc" params={params} csv={`/api/relatorios/curva-abc?${new URLSearchParams(params)}`} opcoes={[
        { chave: "por", padrao: "produtos", valores: [["produtos", "Produtos"], ["servicos", "Serviços"], ["clientes", "Clientes"]] },
        { chave: "criterio", padrao: "valor", valores: [["valor", "Faturamento"], ["quantidade", "Quantidade"], ["lucro", "Lucro"]] },
      ]} />
      <p className="mb-2 text-[12px] text-slate-500">{per.rotulo} · A = primeiros 80% do {criterio === "valor" ? "faturamento" : criterio}, B = até 95%, C = o resto</p>
      <div className="mb-3 grid gap-3 md:grid-cols-3">
        {r.resumo.map((c) => <Kpi key={c.classe} rotulo={`Classe ${c.classe}`} valor={`${c.itens} ${por === "clientes" ? "clientes" : "itens"}`} dica={`${pct(c.pctItens)} dos itens · ${fmt(c.base)}`} />)}
      </div>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th className="w-10">#</th><th>{por === "clientes" ? "Cliente" : por === "servicos" ? "Serviço" : "Produto"}</th><th className="text-right">Qtd</th><th className="text-right">Faturamento</th><th className="text-right">Lucro</th><th className="text-right">% do total</th><th className="text-right">Acumulado</th><th className="w-16 text-center">Classe</th></tr></thead>
          <tbody>
            {r.linhas.map((l, i) => (
              <tr key={l.chave}>
                <td className="text-slate-500">{i + 1}</td>
                <td>{l.rotulo}{l.detalhe && <span className="ml-2 text-[12px] text-slate-500">{l.detalhe}</span>}</td>
                <td className="text-right">{qtd(l.quantidade)}</td><td className="text-right">{brl(l.valor)}</td><td className="text-right">{brl(l.lucro)}</td>
                <td className="text-right">{pct(l.pct)}</td><td className="text-right">{pct(l.acumulado)}</td>
                <td className="text-center"><span className={`rounded px-2 py-0.5 text-[12px] font-semibold ${COR[l.classe]}`}>{l.classe}</span></td>
              </tr>
            ))}
            {!r.linhas.length && <tr><td colSpan={8} className="py-8 text-center text-slate-500">Nada vendido no período.</td></tr>}
          </tbody>
        </table>
      </div>
    </Pagina>
  );
}
