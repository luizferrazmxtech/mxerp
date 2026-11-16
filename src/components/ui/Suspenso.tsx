"use client";

import { useEffect, useRef, useState } from "react";

/** Menu suspenso (Mais ações ▾, Editar ▾, ⋮). Fecha ao clicar fora ou escolher uma opção. */
export default function Suspenso({ botao, classe = "btn-sec", children, direita = false, titulo }: {
  botao: React.ReactNode; classe?: string; children: React.ReactNode; direita?: boolean; titulo?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("click", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);
  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" className={classe} onClick={() => setAberto((v) => !v)} title={titulo} aria-expanded={aberto}>{botao}</button>
      {aberto && (
        <div onClick={() => setAberto(false)}
          className={`absolute z-30 mt-1 min-w-48 rounded-md border bg-white py-1 text-[14px] text-slate-800 shadow-lg ${direita ? "right-0" : "left-0"}`}>
          {children}
        </div>
      )}
    </div>
  );
}

/** Item de menu suspenso: link, botão de formulário ou ação. */
export function ItemSuspenso({ children, perigo, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { perigo?: boolean }) {
  return (
    <button type="button" {...p}
      className={`flex w-full items-center gap-2 px-3 py-[7px] text-left hover:bg-slate-100 disabled:opacity-40 ${perigo ? "text-red-600" : ""}`}>
      {children}
    </button>
  );
}
