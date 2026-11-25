"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Menu suspenso (Mais ações ▾, Editar ▾, ⋮). Fecha ao clicar fora, rolar a página ou escolher uma opção.
 * O menu fica em position:fixed calculado a partir do botão, então não é cortado por tabelas com overflow
 * (o ⋮ da última linha das listas era cortado). Se não couber embaixo, abre para cima. Continua no mesmo lugar
 * do DOM (sem portal) para os botões de formulário dentro dele seguirem funcionando. Fecha só depois do clique
 * (setTimeout): fechar no próprio clique tirava o <form> da página antes do envio ("Clonar produto" não fazia nada).
 */
export default function Suspenso({ botao, classe = "btn-sec", children, direita = false, titulo }: {
  botao: React.ReactNode; classe?: string; children: React.ReactNode; direita?: boolean; titulo?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({ visibility: "hidden" });
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    const rolou = (e: Event) => { if (!menu.current?.contains(e.target as Node)) setAberto(false); };
    const fechar = () => setAberto(false);
    document.addEventListener("click", fora);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", rolou, true);
    window.addEventListener("resize", fechar);
    return () => {
      document.removeEventListener("click", fora); document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", rolou, true); window.removeEventListener("resize", fechar);
    };
  }, [aberto]);
  useLayoutEffect(() => {
    if (!aberto || !btn.current || !menu.current) { setPos({ visibility: "hidden" }); return; }
    const b = btn.current.getBoundingClientRect();
    const alt = menu.current.offsetHeight;
    const larg = menu.current.offsetWidth;
    const vh = window.innerHeight, vw = window.innerWidth;
    const baixo = vh - b.bottom - 8, cima = b.top - 8;
    const paraCima = alt > baixo && cima > baixo;
    const top = paraCima ? Math.max(8, b.top - 4 - Math.min(alt, cima)) : b.bottom + 4;
    let left = direita ? b.right - larg : b.left;
    left = Math.min(Math.max(8, left), vw - larg - 8);
    setPos({ position: "fixed", top, left, maxHeight: Math.max(160, paraCima ? cima : baixo), overflowY: "auto" });
  }, [aberto, direita]);
  return (
    <div ref={ref} className="relative inline-block">
      <button ref={btn} type="button" className={classe} onClick={() => setAberto((v) => !v)} title={titulo} aria-expanded={aberto}>{botao}</button>
      {aberto && (
        <div ref={menu} onClick={() => setTimeout(() => setAberto(false), 0)} style={pos}
          className="fixed z-50 w-max min-w-48 max-w-[24rem] rounded-md border bg-white py-1 text-[14px] text-slate-800 shadow-lg">
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
