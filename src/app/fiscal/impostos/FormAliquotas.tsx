"use client";

import { useActionState, useState } from "react";
import { salvarAliquotas, copiarMesAnterior, type Res } from "./actions";

type Linha = { cnae: string; descricao: string; aliquota: string };

export default function FormAliquotas({ competencia, inicial, sugestoes }: { competencia: string; inicial: Linha[]; sugestoes: string[] }) {
  const [linhas, setLinhas] = useState<Linha[]>(inicial.length ? inicial : [{ cnae: "*", descricao: "Demais atividades", aliquota: "" }]);
  const [estado, salvar, salvando] = useActionState<Res, FormData>(salvarAliquotas, null);
  const [copia, copiar, copiando] = useActionState<Res, FormData>(copiarMesAnterior, null);
  const muda = (i: number, k: keyof Linha, v: string) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return (
    <div className="space-y-2">
      <form action={salvar} className="space-y-2">
        <input type="hidden" name="competencia" value={competencia} />
        <table className="tabela">
          <thead><tr><th>CNAE</th><th>Atividade</th><th className="text-right">Alíquota efetiva (%)</th><th /></tr></thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i}>
                <td><input name="cnae" list="cnaes" value={l.cnae} onChange={(e) => muda(i, "cnae", e.target.value)} className="campo w-32" placeholder="ex.: 4751201" /></td>
                <td><input name="descricao" value={l.descricao} onChange={(e) => muda(i, "descricao", e.target.value)} className="campo" /></td>
                <td><input name="aliquota" value={l.aliquota} onChange={(e) => muda(i, "aliquota", e.target.value)} inputMode="decimal" className="campo w-28 text-right" placeholder="10,88" /></td>
                <td><button type="button" className="text-red-700 hover:underline" onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}>remover</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="cnaes">{sugestoes.map((c) => <option key={c} value={c} />)}</datalist>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-sec" onClick={() => setLinhas((ls) => [...ls, { cnae: "", descricao: "", aliquota: "" }])}>+ CNAE</button>
          <button className="btn-verde" disabled={salvando}>{salvando ? "Salvando…" : "Salvar alíquotas do mês"}</button>
          {estado && <span className={`text-sm ${estado.ok ? "text-emerald-700" : "text-red-700"}`}>{estado.mensagem}</span>}
        </div>
      </form>
      <form action={copiar} className="flex items-center gap-2">
        <input type="hidden" name="competencia" value={competencia} />
        <button className="text-[13px] text-marca hover:underline" disabled={copiando}>Copiar as alíquotas do mês anterior</button>
        {copia && <span className={`text-sm ${copia.ok ? "text-emerald-700" : "text-red-700"}`}>{copia.mensagem}</span>}
      </form>
      <p className="text-[12px] text-slate-500">Use “*” para a alíquota das demais atividades (a que o contador manda “para a maioria”). Os valores ficam só no sistema.</p>
    </div>
  );
}
