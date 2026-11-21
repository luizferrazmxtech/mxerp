"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import { useState } from "react";
import { responderCotacaoAcao, type Resultado } from "@/lib/compras/acoes";
import { lerNumero } from "@/lib/itens/tipos";

type Item = { id: string; nome: string; detalhes: string | null; quantidade: number; unidade: string; valor: string };

/** Página pública: o fornecedor informa o valor unitário de cada item, frete, prazo e condição. */
export default function FormRespostaCotacao({ token, itens, aberta, inicial }: { token: string; itens: Item[]; aberta: boolean; inicial: { frete: string; prazoEntrega: string; condicao: string; observacao: string } }) {
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(responderCotacaoAcao, null);
  const [valores, setValores] = useState<Record<string, string>>(Object.fromEntries(itens.map((i) => [i.id, i.valor])));
  const [frete, setFrete] = useState(inicial.frete);
  const n = (s: string) => lerNumero(s) ?? 0;
  const total = itens.reduce((s, i) => s + n(valores[i.id] ?? "") * i.quantidade, 0) + n(frete);
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <form {...formAcao} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <table className="w-full border-collapse text-[13px]">
        <thead><tr className="border-b-2 border-slate-400 text-left"><th className="py-1">Item</th><th className="text-right">Qtd.</th><th className="pl-2">Un.</th><th className="w-40 text-right">Valor unitário (R$)</th><th className="w-32 text-right">Total</th></tr></thead>
        <tbody>{itens.map((i) => (
          <tr key={i.id} className="border-b border-slate-200">
            <td className="py-1.5">{i.nome}{i.detalhes && <div className="text-[11px] text-slate-500">{i.detalhes}</div>}</td>
            <td className="text-right">{i.quantidade.toLocaleString("pt-BR")}</td><td className="pl-2">{i.unidade}</td>
            <td><input name={`v_${i.id}`} disabled={!aberta} className="campo text-right" inputMode="decimal" placeholder="0,00" value={valores[i.id] ?? ""} onChange={(e) => setValores({ ...valores, [i.id]: e.target.value })} /></td>
            <td className="text-right">{n(valores[i.id] ?? "") ? brl(n(valores[i.id]) * i.quantidade) : "—"}</td>
          </tr>
        ))}</tbody>
      </table>
      <div className="grid gap-3 sm:grid-cols-3">
        <label><span className="rotulo">Frete (R$)</span><input name="frete" disabled={!aberta} className="campo text-right" value={frete} onChange={(e) => setFrete(e.target.value)} /></label>
        <label><span className="rotulo">Prazo de entrega</span><input name="prazoEntrega" disabled={!aberta} className="campo" defaultValue={inicial.prazoEntrega} placeholder="Ex.: 5 dias úteis" /></label>
        <label><span className="rotulo">Condição de pagamento</span><input name="condicao" disabled={!aberta} className="campo" defaultValue={inicial.condicao} placeholder="Ex.: 28 dias no boleto" /></label>
        <label className="sm:col-span-3"><span className="rotulo">Observação</span><textarea name="observacao" disabled={!aberta} rows={2} className="campo h-auto" defaultValue={inicial.observacao} /></label>
      </div>
      {r && <div className={`rounded px-3 py-2 text-[13px] ${r.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{r.mensagem}</div>}
      <div className="flex items-center gap-3 border-t pt-3"><span className="text-[14px]">Total da proposta <b className="text-[18px]">{brl(total)}</b></span>
        {aberta ? <button className="btn ml-auto px-6" disabled={pendente}>{pendente ? "Enviando…" : "Enviar resposta"}</button> : <span className="ml-auto text-[13px] text-slate-500">Esta cotação foi encerrada.</span>}</div>
    </form>
  );
}
