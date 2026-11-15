"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { LinhaEstoque } from "@/lib/estoque/consultas";
import Pagamentos, { type Forma, type LinhaPag } from "@/components/Pagamentos";
import { fecharBalcao, type ResultadoSimples } from "../vendas/actions";

type Item = { produtoId: string; codigo: string; nome: string; locais: string | null; quantidade: number; valorUnit: number };
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Pdv({ formas }: { formas: Forma[] }) {
  const [q, setQ] = useState("");
  const [opcoes, setOpcoes] = useState<LinhaEstoque[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [desconto, setDesconto] = useState(0);
  const [pagamentos, setPagamentos] = useState<LinhaPag[]>([]);
  const [resultado, setResultado] = useState<ResultadoSimples>(null);
  const [pendente, startTransition] = useTransition();
  const busca = useRef<HTMLInputElement>(null);

  const total = Math.round((itens.reduce((s, i) => s + i.quantidade * i.valorUnit, 0) - desconto) * 100) / 100;

  useEffect(() => {
    if (q.trim().length < 2) return setOpcoes([]);
    const c = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/produtos?q=${encodeURIComponent(q)}`, { signal: c.signal }).then((r) => r.json()).then((r: LinhaEstoque[]) => {
        // leitor de código de barras: correspondência exata entra direto
        const exato = r.find((p) => p.codigo === q.trim());
        if (exato) { incluir(exato); return; }
        setOpcoes(r);
      }).catch(() => {});
    }, 150);
    return () => { clearTimeout(t); c.abort(); };
     
  }, [q]);

  function incluir(p: LinhaEstoque) {
    setItens((atual) => {
      const ja = atual.find((i) => i.produtoId === p.id);
      if (ja) return atual.map((i) => (i.produtoId === p.id ? { ...i, quantidade: i.quantidade + 1 } : i));
      return [...atual, { produtoId: p.id, codigo: p.codigo, nome: p.nome, locais: p.locais, quantidade: 1, valorUnit: p.precoVenda }];
    });
    setQ(""); setOpcoes([]); setResultado(null);
    busca.current?.focus();
  }

  function fechar() {
    startTransition(async () => {
      const r = await fecharBalcao({
        itens: itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade, valorUnit: i.valorUnit })),
        pagamentos: pagamentos.filter((p) => p.valor > 0),
        desconto,
      });
      setResultado(r);
      if (r?.ok) { setItens([]); setDesconto(0); }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">PDV · venda balcão</h1>
        <div className="relative">
          <input ref={busca} autoFocus className="campo py-3 text-base" placeholder="Código de barras, código ou nome do produto"
            value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && opcoes[0]) incluir(opcoes[0]); }} />
          {opcoes.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-96 w-full overflow-auto rounded-md border bg-white shadow-lg">
              {opcoes.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => incluir(o)} className="flex w-full justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-100">
                    <span><span className="font-mono text-xs text-slate-500">{o.codigo}</span> {o.nome}
                      <span className="block text-xs text-slate-500">{o.locais ?? "sem local"}</span></span>
                    <span className="shrink-0 text-right">{brl(o.precoVenda)}<span className={`block text-xs ${o.disponivel > 0 ? "text-emerald-700" : "text-red-600"}`}>{o.disponivel} disp.</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Produto</th><th>Local</th><th className="text-right">Qtd</th><th className="text-right">Valor</th><th className="text-right">Subtotal</th><th></th></tr></thead>
            <tbody>
              {itens.map((i, k) => (
                <tr key={i.produtoId}>
                  <td><span className="font-mono text-xs text-slate-500">{i.codigo}</span> {i.nome}</td>
                  <td className="text-xs text-slate-500">{i.locais}</td>
                  <td className="text-right">
                    <input className="campo w-20 py-1 text-right" type="number" min={0.001} step="any" value={i.quantidade}
                      onChange={(e) => setItens(itens.map((x, j) => (j === k ? { ...x, quantidade: Number(e.target.value) } : x)))} />
                  </td>
                  <td className="text-right">
                    <input className="campo w-24 py-1 text-right" type="number" step="0.01" value={i.valorUnit}
                      onChange={(e) => setItens(itens.map((x, j) => (j === k ? { ...x, valorUnit: Number(e.target.value) } : x)))} />
                  </td>
                  <td className="text-right">{brl(i.quantidade * i.valorUnit)}</td>
                  <td><button className="text-xs text-red-600" onClick={() => setItens(itens.filter((_, j) => j !== k))}>remover</button></td>
                </tr>
              ))}
              {!itens.length && <tr><td colSpan={6} className="py-10 text-center text-slate-400">Passe o leitor ou busque um produto.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <aside className="cartao h-fit space-y-3 p-4 lg:sticky lg:top-4">
        <div className="flex items-center justify-between text-sm">
          <span>Desconto</span>
          <input className="campo w-28 py-1 text-right" type="number" step="0.01" value={desconto || ""} onChange={(e) => setDesconto(Number(e.target.value))} />
        </div>
        <div className="flex items-end justify-between border-t pt-3">
          <span className="text-sm text-slate-500">Total</span>
          <span className="text-3xl font-semibold">{brl(total)}</span>
        </div>
        <Pagamentos formas={formas} total={total} onChange={setPagamentos} />
        <button className="btn w-full py-3 text-base" disabled={!itens.length || pendente || total <= 0} onClick={fechar}>
          {pendente ? "Fechando…" : "Fechar venda"}
        </button>
        {resultado && (
          <p className={`text-sm ${resultado.ok ? "text-emerald-700" : "text-red-700"}`}>
            {resultado.mensagem}{" "}
            {resultado.vendaId && <Link className="underline" href={`/vendas/${resultado.vendaId}`}>ver venda</Link>}
          </p>
        )}
      </aside>
    </div>
  );
}
