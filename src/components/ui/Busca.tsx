"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Campo "Digite para buscar" com lista suspensa (clientes, produtos…).
 * `url` recebe o texto e devolve a lista; `rotulo` mostra o item escolhido.
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

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
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
      {aberto && lista.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-80 w-full min-w-72 overflow-auto rounded-md border bg-white shadow-lg">
          {lista.map((t, i) => (
            <li key={t.id}>
              <button type="button" onMouseEnter={() => setFoco(i)} onClick={() => escolher(t)}
                className={`block w-full px-3 py-2 text-left text-[13px] ${i === foco ? "bg-slate-100" : ""}`}>
                {linha(t)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {aberto && q.trim().length >= 2 && !lista.length && (
        <div className="absolute z-30 mt-1 w-full rounded-md border bg-white px-3 py-2 text-[13px] text-slate-500 shadow-lg">Nada encontrado.</div>
      )}
    </div>
  );
}
