"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Campo "Digite para buscar" com lista suspensa (clientes, produtos…).
 * `url` recebe o texto e devolve a lista; `rotulo` mostra o item escolhido.
 * A lista abre num portal em `position: fixed` sobre a página: dentro de tabelas com rolagem
 * (itens da venda, orçamento, OS) ela ficava cortada/atrás do quadro.
 */
export default function Busca<T extends { id: string }>({ url, valor, rotulo, linha, onEscolher, placeholder = "Digite para buscar", autoFocus, limparAoEscolher, className = "", exato }: {
  url: (q: string) => string;
  valor: T | null;
  rotulo: (t: T) => string;
  linha: (t: T) => React.ReactNode;
  onEscolher: (t: T | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
  limparAoEscolher?: boolean;
  className?: string;
  /** se devolver um item, ele entra direto (leitor de código de barras) */
  exato?: (q: string, lista: T[]) => T | undefined;
}) {
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<T[]>([]);
  const [foco, setFoco] = useState(0);
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setLista([]); return; }
    const c = new AbortController();
    const t = setTimeout(() => {
      fetch(url(q), { signal: c.signal }).then((r) => r.json()).then((r: T[]) => {
        const e = exato?.(q.trim(), r);
        if (e) { escolher(e); return; }
        setLista(r); setFoco(0); setAberto(true);
      }).catch(() => {});
    }, 180);
    return () => { clearTimeout(t); c.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const mostrar = aberto && q.trim().length >= 2;

  // posiciona a lista junto do campo (abaixo, ou acima quando não cabe) e acompanha rolagem/redimensionamento
  useLayoutEffect(() => {
    if (!mostrar) return;
    const calc = () => {
      const r = input.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.max(r.width, 288);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const abaixo = window.innerHeight - r.bottom - 8;
      const acima = r.top - 8;
      if (abaixo < 220 && acima > abaixo) setPos({ left, width, bottom: window.innerHeight - r.top + 4, maxH: Math.min(320, acima - 4) });
      else setPos({ left, width, top: r.bottom + 4, maxH: Math.min(320, abaixo - 4) });
    };
    calc();
    window.addEventListener("scroll", calc, true);
    window.addEventListener("resize", calc);
    return () => { window.removeEventListener("scroll", calc, true); window.removeEventListener("resize", calc); };
  }, [mostrar, lista.length]);

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && !caixa.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("click", fora);
    return () => document.removeEventListener("click", fora);
  }, []);

  function escolher(t: T) {
    onEscolher(t);
    setQ(""); setLista([]); setAberto(false);
    if (limparAoEscolher) input.current?.focus();
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <input
        ref={input}
        className="campo"
        placeholder={placeholder}
        autoFocus={autoFocus}
        value={valor && !limparAoEscolher ? rotulo(valor) : q}
        onChange={(e) => { if (valor && !limparAoEscolher) onEscolher(null); setQ(e.target.value); }}
        onFocus={() => lista.length && setAberto(true)}
        onKeyDown={(e) => {
          if (!aberto || !lista.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setFoco((f) => Math.min(f + 1, lista.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setFoco((f) => Math.max(f - 1, 0)); }
          if (e.key === "Enter") { e.preventDefault(); escolher(lista[foco]); }
          if (e.key === "Escape") setAberto(false);
        }}
      />
      {mostrar && pos && typeof document !== "undefined" && createPortal(
        <div ref={caixa} style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH, zIndex: 1000 }}
          className="overflow-auto rounded-md border bg-white shadow-lg">
          {lista.length > 0 ? (
            <ul>
              {lista.map((t, i) => (
                <li key={t.id}>
                  <button type="button" onMouseEnter={() => setFoco(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(t)}
                    className={`block w-full border-b border-slate-100 px-3 py-2 text-left text-[13px] last:border-b-0 ${i === foco ? "bg-slate-100" : ""}`}>
                    {linha(t)}
                  </button>
                </li>
              ))}
            </ul>
          ) : <div className="px-3 py-2 text-[13px] text-slate-500">Nada encontrado.</div>}
        </div>,
        document.body,
      )}
    </div>
  );
}
