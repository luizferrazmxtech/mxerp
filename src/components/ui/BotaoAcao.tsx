"use client";

import { useTransition } from "react";
import Icone from "@/components/Icone";

/** Botão que chama uma ação do servidor (que redireciona ou devolve erro) e mostra o erro. */
export default function BotaoAcao({ acao, icone, children, className, confirmar }: {
  acao: () => Promise<{ ok: boolean; mensagem: string } | void>; icone?: string; children: React.ReactNode; className?: string; confirmar?: string;
}) {
  const [pendente, start] = useTransition();
  return (
    <button type="button" disabled={pendente} className={className ?? "flex w-full items-center gap-2 px-3 py-[7px] text-left hover:bg-slate-100"}
      onClick={() => {
        if (confirmar && !window.confirm(confirmar)) return;
        start(async () => { const r = await acao(); if (r && !r.ok) window.alert(r.mensagem); });
      }}>
      {icone && <Icone nome={icone} size={15} />} {pendente ? "Aguarde…" : children}
    </button>
  );
}
