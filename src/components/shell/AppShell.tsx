"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Icone from "@/components/Icone";
import { MODULOS, type ItemMenu, type SubItem } from "./menu";
import { RegistroNavegacao } from "@/components/ui/BotaoVoltar";

type Props = {
  menu: ItemMenu[];
  usuario: { nome: string; papel: string };
  empresa: { nome: string; cnpj: string | null };
  /** lojas (CNPJs) que o usuário pode usar; com mais de uma, o cartão vira seletor */
  lojas?: { id: string; nome: string; cnpj: string; atual: boolean }[];
  trocarLoja?: (form: FormData) => Promise<void>;
  sair: () => Promise<void>;
  children: React.ReactNode;
};

const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

const ativoSub = (f: SubItem, caminho: string, busca: string): boolean => (f.filhos ? f.filhos.some((x) => ativo(x.href, caminho, busca)) : ativo(f.href, caminho, busca));

function ativo(href: string, caminho: string, busca: string) {
  const [p, q] = href.split("?");
  if (q) return caminho.startsWith(p) && busca.includes(q);
  if (busca.includes("entidade=") && p === "/campos-extras") return false; // campos extras de produtos ficam no menu Itens
  if (p === "/orcamentos") return caminho === p || (caminho.startsWith(p + "/") && !/^\/orcamentos\/(servicos|situacoes|mensagens|configuracoes)/.test(caminho));
  if (p === "/vendas") return caminho === p || (caminho.startsWith(p + "/") && !/^\/vendas\/(servicos|balcao|devolucoes|vales|situacoes|canais|mensagens|balancas|configuracoes)/.test(caminho));
  if (p === "/os") return caminho === p || (caminho.startsWith(p + "/") && !/^\/os\/(painel|situacoes|equipes|mensagens|configuracoes)/.test(caminho));
  if (p === "/estoque") return caminho === p || caminho.startsWith("/estoque/produto");
  if (p === "/estoque/ajustes") return /^\/estoque\/(ajustes|zerar|inventarios)/.test(caminho);
  if (p === "/compras") return caminho === p || (caminho.startsWith(p + "/") && !/^\/compras\/(servicos|cotacoes|situacoes|mensagens)/.test(caminho));
  if (p === "/fiscal") return (caminho === p && !busca.includes("modelo=")) || /^\/fiscal\/[^/]+$/.test(caminho) && !/^\/fiscal\/(impostos|inutilizacao)$/.test(caminho);
  if (p === "/financeiro") return caminho === p || (caminho.startsWith(p + "/") && !/\/(conciliacao|dre)/.test(caminho));
  return caminho === p || caminho.startsWith(p + "/");
}

export default function AppShell({ menu, usuario, empresa, lojas = [], trocarLoja, sair, children }: Props) {
  const [seletorLoja, setSeletorLoja] = useState(false);
  const caminho = usePathname();
  const busca = useSearchParams().toString();
  // PDV e tela do técnico ocupam a tela toda (sem menu lateral)
  const pdv = caminho.startsWith("/pdv") || caminho.startsWith("/tecnico");
  const tecnico = caminho.startsWith("/tecnico");
  const [menuAberto, setMenuAberto] = useState(true);
  const [abertos, setAbertos] = useState<string[]>(() =>
    [...menu.filter((m) => m.filhos?.some((f) => ativoSub(f, caminho, busca))).map((m) => m.rotulo),
      ...menu.flatMap((m) => m.filhos ?? []).filter((f) => f.filhos && ativoSub(f, caminho, busca)).map((f) => f.rotulo)]);
  const [perfil, setPerfil] = useState(false);
  const perfilRef = useRef<HTMLDivElement>(null);

  // abre o grupo da página atual
  useEffect(() => {
    const g = menu.find((m) => m.filhos?.some((f) => ativoSub(f, caminho, busca)));
    const sub = g?.filhos?.find((f) => f.filhos && ativoSub(f, caminho, busca));
    if (g) setAbertos((a) => [...a, ...[g.rotulo, sub?.rotulo].filter((x): x is string => !!x && !a.includes(x))]);
  }, [caminho, busca, menu]);

  useEffect(() => {
    try { if (localStorage.getItem("mxerp:menu") === "fechado") setMenuAberto(false); } catch {}
    if (window.innerWidth < 900) setMenuAberto(false);
  }, []);

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!perfilRef.current?.contains(e.target as Node)) setPerfil(false); };
    document.addEventListener("click", fora);
    return () => document.removeEventListener("click", fora);
  }, []);

  function alternarMenu() {
    setMenuAberto((v) => {
      try { localStorage.setItem("mxerp:menu", v ? "fechado" : "aberto"); } catch {}
      return !v;
    });
  }

  const modulo = MODULOS.find((m) => caminho === m.prefixo || caminho.startsWith(m.prefixo + "/"));
  // páginas de impressão (DANFE, OS, pedidos…): sem cabeçalho nem menu, para a impressão sair só com o documento
  if (/\/imprimir(\/|$)/.test(caminho)) return <div className="min-h-screen bg-white">{children}</div>;

  return (
    <div className="min-h-screen">
      <header className="no-print fixed inset-x-0 top-0 z-40 flex h-[50px] items-center gap-3 bg-topo px-3 text-white">
        <Link href="/" className="flex h-full items-center" title="Início">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/logo-escuro.svg" alt="MXTECH" className="h-[42px] w-auto" />
        </Link>
        {!pdv && (
          <button onClick={alternarMenu} className="ml-6 rounded p-1.5 text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Mostrar ou esconder o menu">
            <Icone nome="menu" size={22} />
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          {tecnico ? (
            <Link href="/os" className="flex items-center gap-1 rounded bg-white/15 px-2 py-1 text-xs hover:bg-white/25">
              <Icone nome="sair" size={13} /> Sistema completo
            </Link>
          ) : pdv ? (
            <Link href="/vendas/balcao" className="flex items-center gap-1 rounded bg-white/15 px-2 py-1 text-xs hover:bg-white/25">
              <Icone nome="sair" size={13} /> Sair do PDV
            </Link>
          ) : modulo && (
            <span className="hidden items-center gap-1.5 rounded px-2 py-1 text-xs font-medium sm:flex" style={{ background: modulo.cor }}>
              <Icone nome={modulo.icone} size={13} /> {modulo.rotulo}
            </span>
          )}
          <div ref={perfilRef} className="relative">
            <button onClick={() => setPerfil((v) => !v)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-semibold text-topo" title={usuario.nome}>
              {iniciais(usuario.nome)}
            </button>
            {perfil && (
              <div className="absolute right-0 top-10 w-56 rounded-md border bg-white py-1 text-sm text-slate-800 shadow-lg">
                <div className="border-b px-3 py-2">
                  <div className="truncate font-semibold">{usuario.nome}</div>
                  <div className="text-xs text-slate-500">{usuario.papel}</div>
                </div>
                <Link href="/conta" onClick={() => setPerfil(false)} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-100"><Icone nome="senha" /> Minha senha</Link>
                <form action={sair}><button className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-100"><Icone nome="sair" /> Sair</button></form>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex pt-[50px]">
        {!pdv && menuAberto && (
          <aside className="no-print fixed bottom-0 left-0 top-[50px] z-30 w-[210px] overflow-y-auto border-r border-slate-200 bg-lateral pb-6">
            <div className="relative m-2.5 rounded-md bg-topo text-white">
              <button type="button" disabled={lojas.length < 2} onClick={() => setSeletorLoja((v) => !v)} title={lojas.length > 1 ? "Trocar de loja" : undefined}
                className="flex w-full items-center gap-2.5 px-3 py-3 text-left disabled:cursor-default">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marca text-xs font-bold">{empresa.nome.slice(0, 2).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold uppercase">{empresa.nome}</div>
                  {empresa.cnpj && <div className="text-[11px] text-slate-300">{empresa.cnpj}</div>}
                </div>
                {lojas.length > 1 && <Icone nome="abaixo" size={13} className="text-slate-300" />}
              </button>
              {seletorLoja && trocarLoja && (
                <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded-md border bg-white py-1 text-slate-800 shadow-lg">
                  {lojas.map((l) => (
                    <form key={l.id} action={trocarLoja} onSubmit={() => setSeletorLoja(false)}>
                      <input type="hidden" name="lojaId" value={l.id} />
                      <button className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-100 ${l.atual ? "font-semibold" : ""}`}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] uppercase">{l.nome}</span>
                          <span className="block text-[11px] text-slate-500">{l.cnpj}</span>
                        </span>
                        {l.atual && <span className="text-emerald-600">✓</span>}
                      </button>
                    </form>
                  ))}
                  <Link href="/empresas" onClick={() => setSeletorLoja(false)} className="block border-t px-3 py-2 text-center text-[12px] text-marca hover:bg-slate-100">Gerenciar lojas</Link>
                </div>
              )}
            </div>
            <nav className="mt-3 text-[14px]">
              {menu.map((g) => {
                const aberto = abertos.includes(g.rotulo);
                const grupoAtivo = g.filhos?.some((f) => ativoSub(f, caminho, busca));
                return (
                  <div key={g.rotulo}>
                    <button
                      onClick={() => setAbertos((a) => (aberto ? a.filter((x) => x !== g.rotulo) : [...a, g.rotulo]))}
                      className={`flex w-full items-center gap-2.5 px-4 py-[9px] text-left hover:text-black ${grupoAtivo ? "font-semibold text-black" : "text-slate-700"}`}
                    >
                      <Icone nome={g.icone} className="text-slate-600" />
                      <span className="flex-1">{g.rotulo}</span>
                      <Icone nome={aberto ? "abaixo" : "direita"} size={13} className="text-slate-400" />
                    </button>
                    {aberto && (
                      <div className="pb-1">
                        {g.filhos?.map((f) => {
                          if (f.filhos) {
                            const subAberto = abertos.includes(f.rotulo);
                            const subAtivo = ativoSub(f, caminho, busca);
                            return (
                              <div key={f.rotulo}>
                                <button onClick={() => setAbertos((x) => (subAberto ? x.filter((y) => y !== f.rotulo) : [...x, f.rotulo]))}
                                  className={`mx-1.5 flex w-[calc(100%-12px)] items-center gap-2 rounded py-[6px] pl-7 pr-2 text-left text-[13px] ${subAtivo ? "bg-slate-200 font-semibold text-black" : "text-slate-500 hover:text-black"}`}>
                                  <Icone nome={f.icone} size={14} className={subAtivo ? "text-marca" : ""} /> <span className="flex-1">{f.rotulo}</span>
                                  <Icone nome={subAberto ? "abaixo" : "direita"} size={12} className="text-slate-400" />
                                </button>
                                {subAberto && f.filhos.map((x) => {
                                  const a = ativo(x.href, caminho, busca);
                                  return (
                                    <Link key={x.href} href={x.href} className={`mx-1.5 flex items-center gap-2 rounded py-[5px] pl-11 pr-2 text-[12.5px] ${a ? "font-semibold text-black" : "text-slate-500 hover:text-black"}`}>
                                      <Icone nome={x.icone} size={13} className={a ? "text-marca" : ""} /> {x.rotulo}
                                    </Link>
                                  );
                                })}
                              </div>
                            );
                          }
                          const a = ativo(f.href, caminho, busca);
                          return (
                            <Link key={f.href + f.rotulo} href={f.href}
                              className={`mx-1.5 flex items-center gap-2 rounded py-[6px] pl-7 pr-2 text-[13px] ${a ? "bg-slate-200 font-semibold text-black" : "text-slate-500 hover:text-black"}`}>
                              <Icone nome={f.icone} size={14} className={a ? "text-marca" : ""} /> {f.rotulo}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </aside>
        )}
        <main className={`min-w-0 flex-1 ${!pdv && menuAberto ? "md:ml-[210px]" : ""} ${pdv ? "" : "px-4 pb-24 pt-3 md:px-5"}`}>
          <RegistroNavegacao />
          {children}
        </main>
      </div>
      {!pdv && menuAberto && <div className="no-print fixed inset-0 top-[50px] z-20 bg-black/30 md:hidden" onClick={alternarMenu} />}
    </div>
  );
}
