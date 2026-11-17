"use client";

import { lerNumero } from "@/lib/itens/tipos";
import { mesmaUnidade } from "@/lib/itens/unidades";

/** O pedaço da linha que cuida da conversão de unidade (compra e entrada manual de estoque). */
export type Conversao = {
  unidade: string; // unidade do produto (venda/estoque)
  unidadeCompra?: string; fator?: string; salvarConversao?: boolean;
  conversaoProduto?: { unidade: string; fator: number } | null;
};

const num = (v: number, c = 4) => v.toLocaleString("pt-BR", { maximumFractionDigits: c });
const fatorDe = (c: Conversao) => ((c.unidadeCompra ?? "").trim() ? lerNumero(c.fator ?? "") ?? 0 : 1);

/**
 * Escolha da unidade em que a quantidade foi digitada: a do produto (MT) ou a de compra (CX = 305 MT).
 * Em "outra unidade" dá para digitar a unidade e o fator e marcar para gravar no cadastro do produto.
 */
export function SeletorUnidade({ l, onChange }: { l: Conversao; onChange: (m: Partial<Conversao>) => void }) {
  const cp = l.conversaoProduto;
  const atual = (l.unidadeCompra ?? "").trim().toUpperCase();
  const valor = !atual ? "" : cp && atual === cp.unidade.toUpperCase() && fatorDe(l) === cp.fator ? "PRODUTO" : "OUTRA";
  return (
    <div className="min-w-24 space-y-1">
      <select className="campo" value={valor} onChange={(e) => {
        const v = e.target.value;
        if (v === "") onChange({ unidadeCompra: "", fator: "", salvarConversao: false });
        else if (v === "PRODUTO" && cp) onChange({ unidadeCompra: cp.unidade, fator: String(cp.fator).replace(".", ","), salvarConversao: false });
        else onChange({ unidadeCompra: atual || (cp?.unidade ?? "CX"), fator: l.fator || "", salvarConversao: !cp });
      }}>
        <option value="">{l.unidade || "UN"}</option>
        {cp && <option value="PRODUTO">{cp.unidade} ({num(cp.fator)} {l.unidade})</option>}
        <option value="OUTRA">Outra…</option>
      </select>
      {valor === "OUTRA" && (
        <div className="space-y-1 text-[11px]">
          <div className="flex items-center gap-1">1 <input className="campo w-14 px-1 py-0.5 text-[11px] uppercase" value={l.unidadeCompra ?? ""} onChange={(e) => onChange({ unidadeCompra: e.target.value.toUpperCase() })} />
            = <input className={`campo w-16 px-1 py-0.5 text-right text-[11px] ${fatorDe(l) > 0 ? "" : "border-red-400"}`} value={l.fator ?? ""} placeholder="305" onChange={(e) => onChange({ fator: e.target.value })} /> {l.unidade}</div>
          <label className="flex items-center gap-1 text-slate-600"><input type="checkbox" checked={!!l.salvarConversao} onChange={(e) => onChange({ salvarConversao: e.target.checked })} /> gravar no produto</label>
        </div>
      )}
    </div>
  );
}

/** "= 610 MT · R$ 2,13/MT" embaixo do subtotal, quando a linha está convertida. */
export function ResumoConversao({ l, quantidade, subtotal }: { l: Conversao; quantidade: string; subtotal: number }) {
  if (!(l.unidadeCompra ?? "").trim() || mesmaUnidade(l.unidadeCompra, l.unidade) && fatorDe(l) === 1) return null;
  const f = fatorDe(l);
  if (!(f > 0)) return <div className="text-[11px] text-red-600">Informe quantos {l.unidade} vêm em 1 {l.unidadeCompra}</div>;
  const q = (lerNumero(quantidade) ?? 0) * f;
  return <div className="whitespace-nowrap text-[11px] text-slate-500">= {num(q)} {l.unidade}{q > 0 && subtotal > 0 ? ` · R$ ${num(subtotal / q, 4)}/${l.unidade}` : ""}</div>;
}
