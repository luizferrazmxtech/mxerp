"use client";

import { useActionState } from "react";
import type { Resultado } from "@/lib/marketplaces/acoes";

/** Formulário curto (campos + botão) de uma ação dos marketplaces, com a resposta ao lado. */
export default function BotaoForm({ acao, campos = {}, rotulo, secundario, children, className = "flex flex-wrap items-center gap-2" }: {
  acao: (r: Resultado, f: FormData) => Promise<Resultado>; campos?: Record<string, string>; rotulo: string; secundario?: boolean; children?: React.ReactNode; className?: string;
}) {
  const [r, act, pendente] = useActionState<Resultado, FormData>(acao, null);
  return (
    <form action={act} className={className}>
      {Object.entries(campos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      <button className={`${secundario ? "btn-sec" : "btn"} h-8 text-[12px]`} disabled={pendente}>{pendente ? "Aguarde…" : rotulo}</button>
      {r && <span className={`text-[12px] ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.mensagem}</span>}
    </form>
  );
}
