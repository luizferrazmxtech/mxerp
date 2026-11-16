"use client";

import { useTransition } from "react";
import Icone from "@/components/Icone";
import { moverSituacaoAcao } from "@/lib/orcamentos/acoes";

/** Setas que trocam a ordem da situação (no lugar do arrastar do Gestão Click, que também funciona por teclado). */
export default function MoverSituacao({ id, primeira, ultima, acao = moverSituacaoAcao }: { id: string; primeira: boolean; ultima: boolean; acao?: (id: string, d: -1 | 1) => Promise<unknown> }) {
  const [p, start] = useTransition();
  return (
    <span className="inline-flex items-center text-slate-400">
      <Icone nome="arrastar" size={15} />
      <button type="button" disabled={p || primeira} onClick={() => start(async () => { await acao(id, -1); })} className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-30" title="Subir"><Icone nome="cima" size={15} /></button>
      <button type="button" disabled={p || ultima} onClick={() => start(async () => { await acao(id, 1); })} className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-30" title="Descer"><Icone nome="abaixo" size={15} /></button>
    </span>
  );
}
