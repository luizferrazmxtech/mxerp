"use client";

import { useEffect, useRef, useState } from "react";
import type { SaldoDetalhado } from "@/lib/estoque/carro";

/**
 * Dica do saldo ao passar o mouse (ou focar) na quantidade de um item de OS, venda ou orçamento:
 * físico, reservado, disponível e onde está (loja e carros das equipes).
 * Busca só quando abre e guarda por 20 s, para não pesar a tela.
 */
const cache = new Map<string, { em: number; dados: SaldoDetalhado | null }>();
const q = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });

async function carregar(produtoId: string, forcar = false) {
  const c = cache.get(produtoId);
  if (c && !forcar && Date.now() - c.em < 20_000) return c.dados;
  const r = await fetch(`/api/estoque/saldo?produto=${encodeURIComponent(produtoId)}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  cache.set(produtoId, { em: Date.now(), dados: r });
  return r as SaldoDetalhado | null;
}

export default function DicaSaldo({ produtoId, children }: { produtoId?: string; children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState<SaldoDetalhado | null | undefined>(undefined);
  const [pos, setPos] = useState<React.CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const abrir = () => {
    if (!produtoId) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const b = ref.current?.getBoundingClientRect();
      if (b) {
        const larg = 260, left = Math.min(Math.max(8, b.right - larg), window.innerWidth - larg - 8);
        const embaixo = window.innerHeight - b.bottom > 220;
        setPos(embaixo ? { top: b.bottom + 6, left } : { bottom: window.innerHeight - b.top + 6, left });
      }
      setAberto(true);
      setDados(cache.get(produtoId)?.dados);
      setDados(await carregar(produtoId));
    }, 250);
  };
  const fechar = () => { if (timer.current) clearTimeout(timer.current); setAberto(false); };

  return (
    <div ref={ref} onMouseEnter={abrir} onMouseLeave={fechar} onFocus={abrir} onBlur={fechar} className="relative">
      {children}
      {aberto && produtoId && (
        <div role="tooltip" style={{ ...pos, width: 260 }} className="pointer-events-none fixed z-50 rounded-md border bg-white p-3 text-left text-[12px] text-slate-700 shadow-lg">
          {dados === undefined ? <div className="text-slate-500">Consultando o estoque…</div>
            : !dados ? <div className="text-slate-500">Não foi possível ler o estoque.</div>
            : !dados.controla ? <div className="text-slate-500">Este produto não controla estoque.</div>
            : (
              <>
                <div className="mb-1 font-semibold text-slate-800">Estoque no sistema</div>
                {(() => {
                  const carros = dados.onde.filter((o) => o.carro).reduce((a, o) => a + o.fisico, 0);
                  return carros !== 0 ? (
                    <>
                      <div className="flex justify-between"><span>Físico total</span><b>{q(dados.fisico)} {dados.unidade}</b></div>
                      <div className="flex justify-between"><span>Físico - Loja</span><b>{q(dados.fisico - carros)}</b></div>
                      <div className="flex justify-between text-slate-600"><span>Físico nos carros</span><b>{q(carros)}</b></div>
                    </>
                  ) : <div className="flex justify-between"><span>Físico</span><b>{q(dados.fisico)} {dados.unidade}</b></div>;
                })()}
                <div className="flex justify-between text-amber-700"><span>Reservado</span><b>{q(dados.reservado)}</b></div>
                <div className={`flex justify-between ${dados.disponivel > 0 ? "text-emerald-700" : "text-red-600"}`}><span>Disponível{dados.nosCarros ? " na loja" : ""}</span><b>{q(dados.disponivel)}</b></div>
                {dados.nosCarros !== 0 && <div className="flex justify-between text-slate-600"><span>Livre nos carros</span><b>{q(dados.nosCarros)}</b></div>}
                {dados.falta > 0 && <div className="flex justify-between text-red-600"><span>Falta p/ pedidos</span><b>{q(dados.falta)}</b></div>}
                {dados.onde.length > 0 && (
                  <div className="mt-2 border-t pt-2">
                    {dados.onde.map((o) => (
                      <div key={o.nome} className="flex justify-between gap-2">
                        <span className="truncate">{o.nome}{o.carro && <span className="ml-1 text-[10px] uppercase text-slate-400">carro</span>}</span>
                        <span className="whitespace-nowrap">{q(o.fisico)}{o.reservado ? <span className="text-amber-700"> ({q(o.reservado)} res.)</span> : null}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
        </div>
      )}
    </div>
  );
}
