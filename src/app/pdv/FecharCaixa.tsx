"use client";

import { useState } from "react";
import { useFormAcao } from "@/components/ui/useFormAcao";
import { fecharCaixaAcao, type ResultadoSimples } from "./actions";

type Linha = { forma: string; esperado: number };
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ler = (t: string) => {
  const s = t.trim().replace(/\s|R\$/g, "");
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Fechamento com conferência por forma de pagamento (esperado × contado), diferença na hora e opção de lançar a
 * sobra/quebra do dinheiro no financeiro.
 */
export default function FecharCaixa({ caixaId, linhas }: { caixaId: string; linhas: Linha[] }) {
  const [r, , pendente, formAcao] = useFormAcao<ResultadoSimples>(fecharCaixaAcao, null);
  const [vals, setVals] = useState<string[]>(linhas.map((l) => fmt(l.esperado)));
  const difs = linhas.map((l, i) => { const v = ler(vals[i]); return Number.isFinite(v) ? Math.round((v - l.esperado) * 100) / 100 : 0; });
  const total = Math.round(difs.reduce((s, d) => s + d, 0) * 100) / 100;
  const corDif = (d: number) => (Math.abs(d) < 0.01 ? "text-slate-500" : d > 0 ? "text-[#1d7a34]" : "text-[#a8323e]");
  const txtDif = (d: number) => (Math.abs(d) < 0.01 ? "ok" : `${d > 0 ? "+" : "−"}${brl(Math.abs(d))}`);
  return (
    <form {...formAcao} className="space-y-3">
      <input type="hidden" name="caixaId" value={caixaId} />
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead><tr className="border-b text-left text-[12px] text-slate-500">
            <th className="py-1 font-medium">Forma</th><th className="py-1 text-right font-medium">Esperado</th>
            <th className="py-1 pl-2 text-right font-medium">Contado</th><th className="py-1 pl-2 text-right font-medium">Diferença</th>
          </tr></thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={l.forma} className="border-b last:border-0">
                <td className="py-1.5">{l.forma}{i === 0 && <span className="block text-[11px] text-slate-500">na gaveta</span>}</td>
                <td className="py-1.5 text-right whitespace-nowrap">{brl(l.esperado)}</td>
                <td className="py-1.5 pl-2"><input name={`contado:${l.forma}`} className="campo w-full min-w-[90px] py-1 text-right" inputMode="decimal"
                  value={vals[i]} onChange={(e) => setVals(vals.map((x, j) => (j === i ? e.target.value : x)))} onFocus={(e) => e.target.select()} autoFocus={i === 0} /></td>
                <td className={`py-1.5 pl-2 text-right whitespace-nowrap ${corDif(difs[i])}`}>{txtDif(difs[i])}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t font-semibold">
            <td className="py-1.5" colSpan={3}>Diferença total</td>
            <td className={`py-1.5 text-right whitespace-nowrap ${corDif(total)}`}>{Math.abs(total) < 0.01 ? "sem diferença" : txtDif(total)}</td>
          </tr></tfoot>
        </table>
      </div>
      <p className="text-[12px] text-slate-500">Conte o dinheiro da gaveta e confira os comprovantes de cartão e PIX. Sobra em verde, falta em vermelho.</p>
      <label className="flex items-start gap-2 text-[13px]">
        <input type="checkbox" name="lancar" className="mt-0.5 accent-marca" />
        <span>Lançar a sobra ou falta de dinheiro no financeiro<span className="block text-[11px] text-slate-500">Vira um lançamento pago na conta Caixa (outras receitas ou outras despesas).</span></span>
      </label>
      <label className="block"><span className="rotulo">Observação</span><input name="observacao" className="campo" placeholder="Ex.: troco a mais para cliente" /></label>
      {r && !r.ok && <p className="text-[13px] text-red-700">{r.mensagem}</p>}
      <button className="btn w-full py-2.5" disabled={pendente}>Fechar caixa</button>
    </form>
  );
}
