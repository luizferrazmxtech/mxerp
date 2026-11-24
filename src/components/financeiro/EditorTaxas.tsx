"use client";

import { useState } from "react";
import { BANDEIRAS, MAX_VEZES, TAXAS_PAGSEGURO, calcularTaxa, colunaIntermediacao, colunaParcelamento, lerTabela, pct, taxaCredito, tipoCartao, type GrupoBandeiras, type TabelaTaxas } from "@/lib/financeiro/taxasCartao";

const TIPOS: [string, string][] = [
  ["01", "Dinheiro"], ["17", "PIX"], ["03", "Cartão de crédito"], ["04", "Cartão de débito"], ["15", "Boleto"], ["05", "Crediário / a prazo"],
  ["02", "Cheque"], ["16", "Depósito / transferência"], ["10", "Vale alimentação"], ["11", "Vale refeição"], ["99", "Outros"],
];

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const txt = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
const lerPct = (s: string) => { const v = Number(s.replace(",", ".")); return s.trim() === "" || !Number.isFinite(v) ? null : v; };
const grupoVazio = (): GrupoBandeiras => ({ nome: "", bandeiras: [], prazoCredito: 30, prazoDebito: 1, debito: null, intermediacao: Array(MAX_VEZES).fill(null), parcelamento: Array(MAX_VEZES).fill(null) });

/**
 * Campos da forma que dependem do tipo: para cartão, a tabela de taxas por grupo de bandeiras (débito e 1x a 12x);
 * para as demais, a taxa fixa. Grava a tabela num campo escondido "taxas" (JSON).
 */
export default function EditorTaxas({ inicial }: { inicial: { tPag: string; taxa: number; diasPrazo: number; taxas: unknown } }) {
  const [tPag, setTPag] = useState(inicial.tPag || "99");
  const [tab, setTab] = useState<TabelaTaxas>(() => lerTabela(inicial.taxas));
  // células em texto enquanto digita ("2," não vira 2)
  const [cel, setCel] = useState<Record<string, string>>({});
  const [sim, setSim] = useState({ valor: "1000", bandeira: "Visa", vezes: "1" });
  const [base, setBase] = useState<Record<number, { aVista: string; ate6: string; ate12: string }>>({});
  const tipo = tipoCartao(tPag);

  const upGrupo = (i: number, m: Partial<GrupoBandeiras>) => setTab((t) => ({ ...t, grupos: t.grupos.map((g, j) => (j === i ? { ...g, ...m } : g)) }));
  const celula = (chave: string, valor: number | null, onValor: (v: number | null) => void, largura = "w-[4.5rem]") => (
    <input className={`campo ${largura} px-1.5 text-right`} inputMode="decimal" value={cel[chave] ?? txt(valor)}
      onChange={(e) => { setCel((c) => ({ ...c, [chave]: e.target.value })); onValor(lerPct(e.target.value)); }}
      onBlur={() => setCel((c) => { const n = { ...c }; delete n[chave]; return n; })} />
  );
  const preencher = (i: number) => {
    const b = base[i]; const g = tab.grupos[i];
    const a = lerPct(b?.aVista ?? "") ?? g.intermediacao[0] ?? 0, s6 = lerPct(b?.ate6 ?? "") ?? a, s12 = lerPct(b?.ate12 ?? "") ?? s6;
    upGrupo(i, { intermediacao: colunaIntermediacao(a, s6, s12) });
    setCel({});
  };
  const recalcular = (i: number) => { upGrupo(i, { parcelamento: colunaParcelamento(tab.acrescimoMes ?? 0) }); setCel({}); };

  const forma = { tPag, taxa: 0, taxas: tab };
  const calc = tipo ? calcularTaxa(forma, Number(sim.valor.replace(",", ".")) || 0, sim.bandeira, Number(sim.vezes) || 1) : null;

  return (
    <>
      <input type="hidden" name="taxas" value={JSON.stringify(tipo ? tab : { grupos: [] })} />
      <div className="grid gap-3 md:grid-cols-6">
        <label className="md:col-span-2"><span className="rotulo obrig">Tipo</span>
          <select name="tPag" className="campo" value={tPag} onChange={(e) => setTPag(e.target.value)}>
            {TIPOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
          <span className="text-[11px] text-slate-500">Também é o meio de pagamento que sai na nota fiscal.</span>
        </label>
        <label><span className="rotulo">Prazo (dias)</span><input name="diasPrazo" inputMode="numeric" defaultValue={String(inicial.diasPrazo)} className="campo" />
          <span className="text-[11px] text-slate-500">{tipo ? "Usado só sem tabela." : "0 = recebe na hora."}</span></label>
        {!tipo && <label><span className="rotulo">Taxa fixa (%)</span><input name="taxa" inputMode="decimal" defaultValue={txt(inicial.taxa || null)} className="campo" placeholder="0" /></label>}
      </div>

      {tipo && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <b className="text-[13px]">Taxas por bandeira e vezes</b>
            <span className="text-[12px] text-slate-500">Como no simulador da maquininha: intermediação + parcelamento (antecipação). Cada célula é editável.</span>
            <span className="ml-auto flex items-center gap-2 text-[12px]">
              Juros de antecipação ao mês {celula("acr", tab.acrescimoMes ?? null, (v) => setTab((t) => ({ ...t, acrescimoMes: v })), "w-16")} %
              <button type="button" className="btn-sec" onClick={() => { setTab(lerTabela(TAXAS_PAGSEGURO)); setCel({}); }}>Usar taxas da PagSeguro</button>
            </span>
          </div>
          {tab.grupos.length === 0 && <p className="mb-2 rounded bg-amber-50 px-3 py-2 text-[12px] text-amber-800">Sem tabela, o cartão usa a taxa 0. Clique em &quot;Usar taxas da PagSeguro&quot; ou adicione um grupo de bandeiras.</p>}
          {tab.grupos.map((g, i) => (
            <div key={i} className="mb-3 rounded border border-slate-200 p-3">
              <div className="mb-2 grid gap-2 md:grid-cols-12">
                <label className="md:col-span-3"><span className="rotulo">Grupo</span><input className="campo" value={g.nome} onChange={(e) => upGrupo(i, { nome: e.target.value })} placeholder="ex.: Visa e Mastercard" /></label>
                <div className="md:col-span-6"><span className="rotulo">Bandeiras</span>
                  <div className="flex flex-wrap gap-1">{BANDEIRAS.map((b) => {
                    const on = g.bandeiras.includes(b);
                    return <button type="button" key={b} onClick={() => upGrupo(i, { bandeiras: on ? g.bandeiras.filter((x) => x !== b) : [...g.bandeiras, b] })}
                      className={`rounded border px-1.5 py-0.5 text-[11px] ${on ? "border-marca bg-marca/10 text-marca" : "border-slate-200 text-slate-500"}`}>{b}</button>;
                  })}</div>
                </div>
                <label className="md:col-span-1"><span className="rotulo">Cai em (dias)</span><input className="campo" inputMode="numeric" value={tipo === "DEBITO" ? g.prazoDebito : g.prazoCredito}
                  onChange={(e) => upGrupo(i, tipo === "DEBITO" ? { prazoDebito: Math.max(0, Math.trunc(Number(e.target.value)) || 0) } : { prazoCredito: Math.max(0, Math.trunc(Number(e.target.value)) || 0) })} /></label>
                <div className="flex items-end md:col-span-2"><button type="button" className="text-[12px] text-red-600 hover:underline" onClick={() => setTab((t) => ({ ...t, grupos: t.grupos.filter((_, j) => j !== i) }))}>Remover grupo</button></div>
              </div>
              <div className="mb-2 flex items-center gap-2 text-[12px]"><b>Débito</b> {celula(`d${i}`, g.debito, (v) => upGrupo(i, { debito: v }))} %
                {g.debito === null && <span className="text-slate-500">vazio = usa o débito do primeiro grupo</span>}</div>
              {tipo === "CREDITO" && (
                <>
                  <div className="overflow-x-auto">
                    <table className="tabela text-[12px]">
                      <thead><tr><th>Crédito (%)</th>{Array.from({ length: MAX_VEZES }, (_, k) => <th key={k} className="text-right">{k + 1}x</th>)}</tr></thead>
                      <tbody>
                        <tr><td className="whitespace-nowrap">Intermediação</td>{g.intermediacao.map((c, k) => <td key={k}>{celula(`i${i}-${k}`, c, (v) => upGrupo(i, { intermediacao: g.intermediacao.map((x, j) => (j === k ? v : x)) }))}</td>)}</tr>
                        <tr><td className="whitespace-nowrap">Parcelamento</td>{g.parcelamento.map((c, k) => <td key={k}>{celula(`p${i}-${k}`, c, (v) => upGrupo(i, { parcelamento: g.parcelamento.map((x, j) => (j === k ? v : x)) }))}</td>)}</tr>
                        <tr className="font-semibold"><td>Total</td>{Array.from({ length: MAX_VEZES }, (_, k) => <td key={k} className="text-right">{pct(taxaCredito(g, k + 1))}</td>)}</tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-slate-600">
                    Intermediação do plano: à vista
                    <input className="campo w-16 px-1.5 text-right" value={base[i]?.aVista ?? ""} onChange={(e) => setBase((b) => ({ ...b, [i]: { ...{ aVista: "", ate6: "", ate12: "" }, ...b[i], aVista: e.target.value } }))} placeholder="3,05" />
                    2x a 6x <input className="campo w-16 px-1.5 text-right" value={base[i]?.ate6 ?? ""} onChange={(e) => setBase((b) => ({ ...b, [i]: { ...{ aVista: "", ate6: "", ate12: "" }, ...b[i], ate6: e.target.value } }))} placeholder="2,75" />
                    7x a 12x <input className="campo w-16 px-1.5 text-right" value={base[i]?.ate12 ?? ""} onChange={(e) => setBase((b) => ({ ...b, [i]: { ...{ aVista: "", ate6: "", ate12: "" }, ...b[i], ate12: e.target.value } }))} placeholder="2,85" />
                    <button type="button" className="btn-sec" onClick={() => preencher(i)}>Preencher intermediação</button>
                    <button type="button" className="btn-sec" onClick={() => recalcular(i)}>Recalcular parcelamento ({pct(tab.acrescimoMes ?? 0)} ao mês)</button>
                  </div>
                </>
              )}
            </div>
          ))}
          <button type="button" className="btn-sec" onClick={() => setTab((t) => ({ ...t, grupos: [...t.grupos, grupoVazio()] }))}>+ Grupo de bandeiras</button>

          {tab.grupos.length > 0 && calc && (
            <div className="mt-4 rounded bg-slate-50 p-3 text-[13px]">
              <b>Simular:</b>{" "}
              <input className="campo inline-block w-28 text-right" value={sim.valor} onChange={(e) => setSim({ ...sim, valor: e.target.value })} />{" "}
              <select className="campo inline-block w-36" value={sim.bandeira} onChange={(e) => setSim({ ...sim, bandeira: e.target.value })}>{BANDEIRAS.map((b) => <option key={b}>{b}</option>)}</select>{" "}
              {tipo === "CREDITO" && <select className="campo inline-block w-20" value={sim.vezes} onChange={(e) => setSim({ ...sim, vezes: e.target.value })}>{Array.from({ length: MAX_VEZES }, (_, k) => <option key={k} value={k + 1}>{k + 1}x</option>)}</select>}
              <div className="mt-1">{calc.parcelamento > 0 && <>Intermediação {pct(calc.intermediacao)} + parcelamento {pct(calc.parcelamento)} · </>}Taxa {pct(calc.percentual)} = <b>{brl(calc.taxa)}</b> · líquido <b>{brl(calc.liquido)}</b> · cai {calc.prazoDias === 0 ? "na hora" : `em ${calc.prazoDias} dias`} ({calc.grupo})</div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
