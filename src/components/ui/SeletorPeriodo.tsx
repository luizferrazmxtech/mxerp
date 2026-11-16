import Link from "next/link";
import Icone from "@/components/Icone";
import Suspenso from "./Suspenso";
import { urlCom } from "./BarraLista";
import { PERIODOS, periodoDia } from "@/lib/datas";

/** Botão preto "Novembro de 2026 ▾" das listas do Gestão Click: Hoje, Esta semana… e Escolha o período. */
export default function SeletorPeriodo({ base, params }: { base: string; params: Record<string, string | undefined> }) {
  const p = periodoDia(params.periodo, params.pde, params.pate);
  const limpo = { ...params, p: undefined, pde: undefined, pate: undefined };
  return (
    <Suspenso direita classe="btn" botao={<>{p ? p.rotulo : "Todo o período"} <Icone nome="abaixo" size={13} /></>}>
      {PERIODOS.map((x) => (
        <Link key={x.chave} href={urlCom(base, limpo, { periodo: x.chave === "mes" ? undefined : x.chave })}
          className={`block px-3 py-[7px] hover:bg-slate-100 ${(params.periodo ?? "mes") === x.chave ? "font-semibold" : ""}`}>{x.rotulo}</Link>
      ))}
      <form action={base} className="border-t px-3 py-2">
        {Object.entries(limpo).filter(([k, v]) => v && k !== "periodo").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <input type="hidden" name="periodo" value="periodo" />
        <div className="mb-1 text-[12px] font-semibold">Escolha o período</div>
        <div className="flex items-center gap-1">
          <input type="date" name="pde" defaultValue={params.pde} className="campo py-1 text-[12px]" required />
          <span className="text-[12px]">a</span>
          <input type="date" name="pate" defaultValue={params.pate} className="campo py-1 text-[12px]" />
        </div>
        <button className="btn mt-2 w-full py-1">Aplicar</button>
      </form>
    </Suspenso>
  );
}
