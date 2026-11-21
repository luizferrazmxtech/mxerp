"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icone, { type NomeIcone } from "./Icone";

const MENU: { href: string; rotulo: string; icone: NomeIcone }[] = [
  { href: "/", rotulo: "Painel", icone: "painel" },
  { href: "/clientes", rotulo: "Clientes", icone: "clientes" },
  { href: "/faturas", rotulo: "Mensalidades", icone: "mensalidades" },
  { href: "/planos", rotulo: "Planos", icone: "planos" },
  { href: "/tarefas", rotulo: "Tarefas da VPS", icone: "tarefas" },
  { href: "/configuracoes", rotulo: "Configurações", icone: "configuracoes" },
];

const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

/** Moldura igual à do MXERP: barra escura com o logo em cima e menu lateral cinza (some no celular). */
export default function Shell({ admin, sair, children }: { admin: { nome: string; email: string }; sair: () => Promise<void>; children: React.ReactNode }) {
  const caminho = usePathname();
  const [aberto, setAberto] = useState(true);
  const [perfil, setPerfil] = useState(false);
  useEffect(() => { if (window.innerWidth < 900) setAberto(false); }, []);
  useEffect(() => { if (window.innerWidth < 900) setAberto(false); }, [caminho]);
  const ativo = (href: string) => (href === "/" ? caminho === "/" : caminho === href || caminho.startsWith(href + "/"));

  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-40 flex h-[50px] items-center gap-3 bg-topo px-3 text-white">
        <Link href="/" className="flex h-full items-center gap-2" title="Painel">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/logo-escuro.svg" alt="MXTECH" className="h-[42px] w-auto" />
          <span className="hidden rounded bg-white/10 px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-white/85 sm:inline">Central de revenda</span>
        </Link>
        <button onClick={() => setAberto((v) => !v)} className="ml-3 rounded p-1.5 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Mostrar ou esconder o menu">
          <Icone nome="menu" size={22} />
        </button>
        <div className="relative ml-auto">
          <button onClick={() => setPerfil((v) => !v)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-semibold text-topo" title={admin.nome}>
            {iniciais(admin.nome)}
          </button>
          {perfil && (
            <div className="absolute right-0 top-10 w-56 rounded-md border bg-white py-1 text-sm text-slate-800 shadow-lg">
              <div className="border-b px-3 py-2">
                <div className="truncate font-semibold">{admin.nome}</div>
                <div className="truncate text-xs text-slate-500">{admin.email}</div>
              </div>
              <form action={sair}><button className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-100"><Icone nome="sair" /> Sair</button></form>
            </div>
          )}
        </div>
      </header>

      <div className="flex pt-[50px]">
        {aberto && (
          <aside className="fixed bottom-0 left-0 top-[50px] z-30 w-[210px] overflow-y-auto border-r border-slate-200 bg-lateral pb-6">
            <div className="m-2.5 flex items-center gap-2.5 rounded-md bg-topo px-3 py-3 text-white">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marca text-xs font-bold">MX</span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold uppercase">MXTECH</div>
                <div className="text-[11px] text-slate-300">Revenda MXERP</div>
              </div>
            </div>
            <nav className="mt-3 text-[14px]">
              {MENU.map((m) => {
                const a = ativo(m.href);
                return (
                  <Link key={m.href} href={m.href}
                    className={`mx-1.5 flex items-center gap-2.5 rounded px-3 py-[9px] ${a ? "bg-slate-200 font-semibold text-black" : "text-slate-700 hover:text-black"}`}>
                    <Icone nome={m.icone} className={a ? "text-marca" : "text-slate-600"} /> {m.rotulo}
                  </Link>
                );
              })}
            </nav>
          </aside>
        )}
        <main className={`min-w-0 flex-1 px-4 pb-24 pt-3 md:px-5 ${aberto ? "md:ml-[210px]" : ""}`}>{children}</main>
      </div>
      {aberto && <div className="fixed inset-0 top-[50px] z-20 bg-black/30 md:hidden" onClick={() => setAberto(false)} />}
    </div>
  );
}
