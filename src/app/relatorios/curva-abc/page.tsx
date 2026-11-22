import Link from "next/link";
import { curvaAbc, type CriterioAbc } from "@/lib/relatorios/relatorios";
import { paramsDe, periodoRelatorio } from "@/lib/relatorios/periodo";
import { Pagina } from "@/components/ui/Pagina";
import { BarraRelatorio, Kpi, brl, pct } from "@/components/relatorios/Barra";
import { CurvaAbc as GraficoAbc } from "@/components/relatorios/Graficos";
import { urlCom } from "@/components/ui/BarraLista";
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
  const classe = ["A", "B", "C"].includes(sp.classe ?? "") ? sp.classe : undefined;
  const unidade = por === "clientes" ? "clientes" : "itens";
  const fmt = (v: number) => (criterio === "quantidade" ? qtd(v) : brl(v));
  return (
    <Pagina titulo="Curva ABC" icone="grafico" trilha={[{ rotulo: "Relatórios", href: "/relatorios" }, { rotulo: "Curva ABC" }]}>
      <BarraRelatorio base="/relatorios/curva-abc" params={params} csv={`/api/relatorios/curva-abc?${new URLSearchParams(params)}`} opcoes={[
        { chave: "por", padrao: "produtos", valores: [["produtos", "Produtos"], ["servicos", "Serviços"], ["clientes", "Clientes"]] },
        { chave: "criterio", padrao: "valor", valores: [["valor", "Faturamento"], ["quantidade", "Quantidade"], ["lucro", "Lucro"]] },
      ]} />
      <p className="mb-2 text-[12px] text-slate-500">{per.rotulo} · A = primeiros 80% do {criterio === "valor" ? "faturamento" : criterio}, B = até 95%, C = o resto</p>
      <div className="mb-3 grid gap-3 md:grid-cols-3">
        {r.resumo.map((c) => (
          <Link key={c.classe} href={urlCom("/relatorios/curva-abc", params, { classe: classe === c.classe ? undefined : c.classe })}
            className={`rounded ${classe === c.classe ? "ring-2 ring-marca" : ""}`} title={classe === c.classe ? "Mostrar todas as classes" : `Mostrar só a classe ${c.classe}`}>
            <Kpi rotulo={`Classe ${c.classe}`} valor={`${c.itens} ${unidade}`} dica={`${pct(c.pctItens)} dos ${unidade} · ${fmt(c.base)}`} />
          </Link>
        ))}
      </div>
      <GraficoAbc linhas={r.linhas} resumo={r.resumo} classe={classe} unidade={unidade}
        hrefClasse={(c) => urlCom("/relatorios/curva-abc", params, { classe: c })} />
      {classe && <p className="mb-2 text-[13px]">Mostrando só a classe <b>{classe}</b> · <Link href={urlCom("/relatorios/curva-abc", params, { classe: undefined })} className="text-marca hover:underline">ver todas</Link></p>}
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th className="w-10">#</th><th>{por === "clientes" ? "Cliente" : por === "servicos" ? "Serviço" : "Produto"}</th><th className="text-right">Qtd</th><th className="text-right">Faturamento</th><th className="text-right">Lucro</th><th className="text-right">% do total</th><th className="text-right">Acumulado</th><th className="w-16 text-center">Classe</th></tr></thead>
          <tbody>
            {r.linhas.map((l, i) => (classe && l.classe !== classe ? null :
              <tr key={l.chave}>
                <td className="text-slate-500">{i + 1}</td>
                <td>{l.rotulo}{l.detalhe && <span className="ml-2 text-[12px] text-slate-500">{l.detalhe}</span>}</td>
                <td className="text-right">{qtd(l.quantidade)}</td><td className="text-right">{brl(l.valor)}</td><td className="text-right">{brl(l.lucro)}</td>
                <td className="text-right">{pct(l.pct)}</td><td className="text-right">{pct(l.acumulado)}</td>
                <td className="text-center"><span className={`rounded px-2 py-0.5 text-[12px] font-semibold ${COR[l.classe]}`}>{l.classe}</span></td>
              </tr>
            ))}
            {!r.linhas.length && <tr><td colSpan={8} className="py-8 text-center text-slate-500">Nada vendido no período.</td></tr>}
            {!!r.linhas.length && classe && !r.linhas.some((l) => l.classe === classe) && <tr><td colSpan={8} className="py-8 text-center text-slate-500">Nenhum item na classe {classe}.</td></tr>}
          </tbody>
        </table>
      </div>
    </Pagina>
  );
}
