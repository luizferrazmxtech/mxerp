"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Icone from "@/components/Icone";

const MENU = [
  { href: "/area-cliente", rotulo: "Início", icone: "inicio", celular: true },
  { href: "/area-cliente/os", rotulo: "Ordens de serviço", curto: "OS", icone: "os", celular: true },
  { href: "/area-cliente/compras", rotulo: "Compras", icone: "vendas", celular: true },
  { href: "/area-cliente/notas", rotulo: "Notas fiscais", curto: "Notas", icone: "notas", celular: true },
  { href: "/area-cliente/financeiro", rotulo: "Boletos e pagamentos", curto: "Boletos", icone: "boleto", celular: true },
  { href: "/area-cliente/orcamentos", rotulo: "Orçamentos", icone: "cotacao", celular: false },
];

const ativo = (href: string, caminho: string) => (href === "/area-cliente" ? caminho === href : caminho === href || caminho.startsWith(href + "/"));
const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

/** Moldura da Área do Cliente: topo branco com o logo da empresa, abas no computador e barra de baixo no celular. */
export default function PortalShell({ cliente, empresa, sair, children }: {
  cliente: { nome: string; documento: string | null };
  empresa: string;
  sair: () => Promise<void>;
  children: React.ReactNode;
}) {
  const caminho = usePathname();
  const [perfil, setPerfil] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setPerfil(false); };
    document.addEventListener("click", fora);
    return () => document.removeEventListener("click", fora);
  }, []);
  useEffect(() => setPerfil(false), [caminho]);

  return (
    <div className="min-h-screen bg-fundo pb-[68px] md:pb-0">
      <header className="no-print sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-[60px] max-w-6xl items-center gap-3 px-4">
          <Link href="/area-cliente" className="flex min-w-0 items-center gap-3" title="Início">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/area-cliente/logo" alt={empresa} className="h-10 w-auto max-w-[150px] object-contain" />
            <span className="hidden border-l border-slate-200 pl-3 text-[12px] font-semibold uppercase tracking-wide text-slate-500 sm:block">Área do Cliente</span>
          </Link>
          <div ref={ref} className="relative ml-auto">
            <button onClick={() => setPerfil((v) => !v)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-slate-100" aria-label="Minha conta">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-tinta text-[12px] font-semibold text-white">{iniciais(cliente.nome)}</span>
              <span className="hidden max-w-[220px] truncate text-left text-[13px] font-semibold text-slate-700 md:block">{cliente.nome}</span>
              <Icone nome="abaixo" size={14} className="text-slate-500" />
            </button>
            {perfil && (
              <div className="absolute right-0 top-12 w-64 rounded-md border border-slate-200 bg-white py-1 text-[14px] text-slate-800 shadow-lg">
                <div className="border-b border-slate-100 px-3 py-2">
                  <div className="truncate font-semibold">{cliente.nome}</div>
                  {cliente.documento && <div className="text-[12px] text-slate-500">{cliente.documento}</div>}
                </div>
                <Link href="/area-cliente/orcamentos" className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-100 md:hidden"><Icone nome="cotacao" size={15} /> Orçamentos</Link>
                <Link href="/area-cliente/conta" className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-100"><Icone nome="senha" size={15} /> Minha conta e senha</Link>
                <form action={sair}><button className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-100"><Icone nome="sair" size={15} /> Sair</button></form>
              </div>
            )}
          </div>
        </div>
        {/* abas (computador e tablet) */}
        <nav className="mx-auto hidden max-w-6xl gap-1 overflow-x-auto px-4 md:flex">
          {MENU.map((m) => (
            <Link key={m.href} href={m.href}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[14px] ${ativo(m.href, caminho) ? "border-marca font-semibold text-[#212529]" : "border-transparent text-slate-600 hover:text-[#212529]"}`}>
              <Icone nome={m.icone} size={15} /> {m.rotulo}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4 md:py-6">{children}</main>

      {/* barra de baixo (celular) */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {MENU.filter((m) => m.celular).map((m) => {
          const a = ativo(m.href, caminho);
          return (
            <Link key={m.href} href={m.href} className={`flex h-[60px] flex-col items-center justify-center gap-0.5 text-[11px] ${a ? "font-semibold text-marca" : "text-slate-500"}`}>
              <Icone nome={m.icone} size={21} strokeWidth={a ? 2.2 : 1.8} />
              {m.curto ?? m.rotulo}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
