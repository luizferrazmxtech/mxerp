import { Pagina } from "@/components/ui/Pagina";
import { calcularDre, type Regime } from "@/lib/financeiro/dre";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const v = (n: number) => (Math.abs(n) < 0.005 ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export default async function Dre({ searchParams }: { searchParams: Promise<{ ano?: string; regime?: string; centro?: string }> }) {
  const sp = await searchParams;
  const ano = Number(sp.ano) || new Date().getFullYear();
  const regime: Regime = sp.regime === "CAIXA" ? "CAIXA" : "COMPETENCIA";
  const [dre, centros] = await Promise.all([calcularDre(ano, regime, sp.centro || undefined), prisma.centroCusto.findMany({ orderBy: { nome: "asc" } })]);
  return (
    <Pagina titulo={`DRE gerencial ${ano}`} icone="dre" trilha={[{ rotulo: "Financeiro", href: "/financeiro" }, { rotulo: "DRE gerencial" }]}>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {dre.centro && <p className="text-sm font-semibold text-slate-700">Centro de custo {dre.centro}</p>}
          <p className="text-xs text-slate-500">
            {regime === "CAIXA" ? "Regime de caixa (pelo que foi pago/recebido)" : "Regime de competência"} · CMV pelo custo das peças vendidas · margem líquida {(dre.margemLiquida * 100).toFixed(1)}%
          </p>
        </div>
        <form className="flex gap-2">
          <select name="ano" defaultValue={ano} className="campo w-28">
            {[ano - 2, ano - 1, ano, ano + 1].map((a) => <option key={a}>{a}</option>)}
          </select>
          <select name="regime" defaultValue={regime} className="campo w-40">
            <option value="COMPETENCIA">Competência</option>
            <option value="CAIXA">Caixa</option>
          </select>
          {centros.length > 0 && (
            <select name="centro" defaultValue={sp.centro ?? ""} className="campo w-44" aria-label="Centro de custo">
              <option value="">Todos os centros</option>
              {centros.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          )}
          <button className="btn-sec">Ver</button>
        </form>
      </div>
      <div className="cartao overflow-x-auto">
        <table className="tabela whitespace-nowrap">
          <thead><tr><th className="sticky left-0 bg-white">Conta</th>{MESES.map((m) => <th key={m} className="text-right">{m}</th>)}<th className="text-right">Total</th></tr></thead>
          <tbody>
            {dre.linhas.map((l) => (
              <tr key={l.chave} className={l.nivel === "resultado" ? "bg-slate-50 font-semibold" : l.nivel === "grupo" ? "font-medium" : "text-slate-500"}>
                <td className={`sticky left-0 ${l.nivel === "resultado" ? "bg-slate-50" : "bg-white"} ${l.nivel === "categoria" ? "pl-8" : ""}`}>{l.rotulo}</td>
                {l.meses.map((m, i) => <td key={i} className={`text-right ${l.nivel === "resultado" && m < 0 ? "text-red-600" : ""}`}>{v(m)}</td>)}
                <td className={`text-right ${l.nivel === "resultado" && l.total < 0 ? "text-red-600" : ""}`}>{v(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </Pagina>
  );
}
