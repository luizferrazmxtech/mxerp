import Link from "next/link";
import SeletorPeriodo from "@/components/ui/SeletorPeriodo";
import BotaoImprimir from "@/app/os/[id]/separacao/BotaoImprimir";
import { brl } from "@/lib/ui/format";

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
        <BotaoImprimir />
        {csv && <a className="btn-verde" href={csv}>Exportar</a>}
        <SeletorPeriodo base={base} params={params} />
      </div>
    </div>
  );
}

export function Kpi({ rotulo, valor, dica, cor = "" }: { rotulo: string; valor: string; dica?: string; cor?: string }) {
  return (
    <div className="cartao p-4">
      <div className="text-xs text-slate-500">{rotulo}</div>
      <div className={`text-xl font-semibold ${cor}`}>{valor}</div>
      {dica && <div className="text-[11px] text-slate-500">{dica}</div>}
    </div>
  );
}

export const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
export { brl };
