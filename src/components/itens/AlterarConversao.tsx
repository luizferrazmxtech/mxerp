"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import Link from "next/link";
import { useEffect, useState } from "react";
import { alterarConversaoForm, simularConversaoAcao, type Resultado } from "@/lib/itens/acoes";

type Simulacao = Awaited<ReturnType<typeof simularConversaoAcao>>;
const BASES: [string, string, string][] = [
  ["PROPORCIONAL", "Proporcional", "o custo da caixa continua o mesmo, dividido pelo novo fator"],
  ["ULTIMA", "Última compra", "preço da última compra recebida ÷ fator"],
  ["MEDIA", "Média das compras", "média ponderada das compras recebidas, convertidas"],
  ["MANTER", "Manter o custo", "só troca a conversão"],
];
const r4 = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 }));
const q = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });

/** Alterar conversão: mostra o efeito (custo por base, compras que mudam) antes de gravar. */
export default function AlterarConversao({ produto }: { produto: { id: string; nome: string; unidade: string; unidadeCompra: string | null; fator: number } }) {
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(alterarConversaoForm, null);
  const [converte, setConverte] = useState(!!produto.unidadeCompra);
  const [un, setUn] = useState(produto.unidadeCompra ?? "CX");
  const [fator, setFator] = useState(produto.unidadeCompra ? String(produto.fator).replace(".", ",") : "");
  const [base, setBase] = useState("PROPORCIONAL");
  const [sim, setSim] = useState<Simulacao | null>(null);
  useEffect(() => {
    const t = setTimeout(() => { simularConversaoAcao(produto.id, converte ? un : "", fator).then(setSim).catch(() => setSim(null)); }, 300);
    return () => clearTimeout(t);
  }, [produto.id, converte, un, fator]);

  return (
    <form {...formAcao} className="cartao border-marca p-4 text-[13px]">
      <input type="hidden" name="produtoId" value={produto.id} />
      <h3 className="mb-1 font-semibold">Alterar conversão de unidade</h3>
      <p className="mb-3 text-slate-500">Hoje: {produto.unidadeCompra ? `1 ${produto.unidadeCompra} = ${q(produto.fator)} ${produto.unidade}` : `compra e venda em ${produto.unidade}`}.</p>
      <label className="mb-2 flex items-center gap-2"><input type="checkbox" name="converte" checked={converte} onChange={(e) => setConverte(e.target.checked)} /> Compro em uma unidade e vendo em outra</label>
      {converte && (
        <div className="mb-3 flex flex-wrap items-center gap-2">1 <input name="unidadeCompra" className="campo w-20 uppercase" value={un} onChange={(e) => setUn(e.target.value.toUpperCase())} />
          = <input name="fator" className="campo w-28 text-right" value={fator} placeholder="305" onChange={(e) => setFator(e.target.value)} /> {produto.unidade}</div>
      )}

      <div className="mb-1 font-semibold">Novo custo por {produto.unidade}</div>
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        {BASES.map(([v, t, d]) => (
          <label key={v} className={`flex cursor-pointer gap-2 rounded border p-2 ${base === v ? "border-marca bg-marca/5" : "border-slate-200"}`}>
            <input type="radio" name="base" value={v} checked={base === v} onChange={() => setBase(v)} />
            <span><b>{t}</b>: {sim ? r4(sim.opcoes[v as keyof Simulacao["opcoes"]]) : "…"}<span className="block text-[11px] text-slate-500">{d}</span></span>
          </label>
        ))}
      </div>

      <label className="mb-1 flex items-start gap-2"><input type="checkbox" name="corrigirCompras" defaultChecked className="mt-0.5" />
        <span><b>Corrigir as compras já lançadas</b> com o novo fator. Nas compras que deram entrada aqui, entra (ou sai) a diferença no estoque.</span></label>
      {sim && sim.compras.length > 0 && (
        <div className="mb-2 ml-6 max-h-40 overflow-auto rounded border text-[12px]">
          <table className="tabela"><thead><tr><th>Compra</th><th>Fornecedor</th><th className="text-right">Na nota</th><th className="text-right">Entrou</th><th className="text-right">Passa a</th></tr></thead>
            <tbody>{sim.compras.map((c) => <tr key={c.numero}><td>nº {c.numero} · {c.data.split("-").reverse().join("/")}</td><td>{c.fornecedor}</td><td className="text-right">{q(c.quantidade)}</td><td className="text-right">{q(c.entraAntes)} {produto.unidade}</td><td className="text-right font-semibold">{q(c.entraDepois)} {produto.unidade}</td></tr>)}</tbody></table>
        </div>
      )}
      {sim && !sim.compras.length && <p className="mb-2 ml-6 text-[12px] text-slate-500">Nenhuma compra recebida muda com esta conversão.</p>}
      <label className="mb-3 flex items-start gap-2"><input type="checkbox" name="corrigirLancados" defaultChecked className="mt-0.5" />
        <span><b>Atualizar o custo nas vendas e OS</b> que gravaram o custo antigo (corrige a margem e o DRE).</span></label>

      {r && !r.ok && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-red-700">{r.mensagem}</div>}
      <div className="flex gap-2"><button className="btn" disabled={pendente}>{pendente ? "Gravando…" : "Gravar conversão e recalcular"}</button>
        <Link href={`/produtos/${produto.id}?aba=estoque`} className="btn-sec">Cancelar</Link></div>
    </form>
  );
}
