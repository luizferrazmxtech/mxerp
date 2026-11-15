"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { adicionarProduto, type Resultado } from "../actions";
import type { LinhaEstoque } from "@/lib/estoque/consultas";

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 4 });

export default function AdicionarProduto({ osId }: { osId: string }) {
  const [q, setQ] = useState("");
  const [opcoes, setOpcoes] = useState<LinhaEstoque[]>([]);
  const [sel, setSel] = useState<LinhaEstoque | null>(null);
  const [estado, acao, pendente] = useActionState<Resultado, FormData>(adicionarProduto, null);
  const qtdRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (sel || q.trim().length < 2) return setOpcoes([]);
    const c = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/produtos?q=${encodeURIComponent(q)}`, { signal: c.signal })
        .then((r) => r.json())
        .then(setOpcoes)
        .catch(() => {});
    }, 200);
    return () => { clearTimeout(t); c.abort(); };
  }, [q, sel]);

  useEffect(() => {
    if (estado?.pegar) { setSel(null); setQ(""); }
  }, [estado]);

  return (
    <div className="space-y-2">
      <form action={acao} className="flex flex-wrap items-start gap-2">
        <input type="hidden" name="osId" value={osId} />
        <input type="hidden" name="produtoId" value={sel?.id ?? ""} />
        <div className="relative min-w-64 flex-1">
          <input
            className="campo"
            placeholder="Buscar produto por nome, código ou código de barras"
            value={sel ? `${sel.codigo} · ${sel.nome}` : q}
            onChange={(e) => { setSel(null); setQ(e.target.value); }}
          />
          {opcoes.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-80 w-full overflow-auto rounded-md border bg-white shadow-lg">
              {opcoes.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-100"
                    onClick={() => { setSel(o); setOpcoes([]); setTimeout(() => qtdRef.current?.focus()); }}
                  >
                    <span>
                      <span className="font-mono text-xs text-slate-500">{o.codigo}</span> {o.nome}
                      <span className="block text-xs text-slate-500">{o.locais ?? "sem local"}</span>
                    </span>
                    <span className={`shrink-0 text-xs font-semibold ${o.disponivel > 0 ? "text-emerald-700" : "text-red-600"}`}>
                      {fmt(o.disponivel)} disp.
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <input ref={qtdRef} name="quantidade" defaultValue="1" className="campo w-24" aria-label="Quantidade" />
        <input name="valorUnit" key={sel?.id} defaultValue={sel ? String(sel.precoVenda) : ""} className="campo w-28" placeholder="Valor" aria-label="Valor unitário" />
        <button className="btn" disabled={!sel || pendente}>{pendente ? "Reservando…" : "Adicionar e reservar"}</button>
      </form>
      {estado && (
        <div className={`rounded-md px-3 py-2 text-sm ${estado.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
          {estado.mensagem}
          {estado.pegar && (
            <span className="ml-1 font-semibold">
              Pegar: {estado.pegar.map((p) => `${fmt(p.quantidade)} em ${p.local}`).join(" · ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
