import Link from "next/link";
import SeletorPeriodo from "@/components/ui/SeletorPeriodo";
import BotaoImprimir from "@/app/os/[id]/separacao/BotaoImprimir";
import { brl } from "@/lib/ui/format";
import Suspenso from "@/components/ui/Suspenso";
import Icone from "@/components/Icone";
import Favoritos from "./Favoritos";

/** Barra dos relatórios: opções (abas) à esquerda; imprimir, exportar e período à direita. */
export function BarraRelatorio({ base, params, opcoes, csv }: {
  base: string; params: Record<string, string>; opcoes?: { chave: string; valores: [string, string][]; padrao: string }[]; csv?: string;
}) {
  const url = (k: string, v: string) => { const p = new URLSearchParams({ ...params, [k]: v }); return `${base}?${p}`; };
  return (
    <div className="no-print mb-3 flex flex-wrap items-center gap-2">
      {opcoes?.map((o) => (
        <div key={o.chave} className="flex flex-wrap gap-1">
          {o.valores.map(([v, r]) => <Link key={v} href={url(o.chave, v)} className={(params[o.chave] ?? o.padrao) === v ? "aba aba-ativa" : "aba"}>{r}</Link>)}
        </div>
      ))}
      <div className="ml-auto flex items-center gap-2">
        {params.vendedor && (
          <Link href={(() => { const p = new URLSearchParams(params); p.delete("vendedor"); return `${base}?${p}`; })()} className="btn-sec" title="Tirar o filtro de vendedor">
            Filtrado por vendedor ✕
          </Link>
        )}
        <Favoritos />
        <BotaoImprimir />
        {csv && (
          <Suspenso direita classe="btn-verde" botao={<>Exportar <Icone nome="abaixo" size={13} /></>}>
            <a href={`${csv}${csv.includes("?") ? "&" : "?"}formato=xlsx`} className="block px-3 py-[7px] hover:bg-slate-100">Excel (.xlsx)</a>
            <a href={csv} className="block px-3 py-[7px] hover:bg-slate-100">CSV</a>
            <p className="border-t px-3 py-[7px] text-[12px] text-slate-500">Para PDF com os gráficos, use Imprimir e escolha “Salvar como PDF”.</p>
          </Suspenso>
        )}
        <SeletorPeriodo base={base} params={params} />
      </div>
    </div>
  );
}

export function Kpi({ rotulo, valor, dica, cor = "" }: { rotulo: string; valor: string; dica?: string; cor?: string }) {
  return (
    // mesmo desenho dos cartões de resumo das listas (título cinza em negrito, valor grande, legenda pequena)
    <div className="cartao px-4 py-3">
      <div className="text-[13px] font-semibold text-[#495057]">{rotulo}</div>
      <div className={`mt-1 text-[20px] font-semibold text-[#212529] ${cor}`}>{valor}</div>
      {dica && <div className="text-[12px] text-slate-500">{dica}</div>}
    </div>
  );
}

export const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
export { brl };
