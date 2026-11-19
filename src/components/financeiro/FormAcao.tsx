"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export type Resultado = { ok: boolean; mensagem: string; ir?: string } | null;

/** Formulário de ação do servidor que mostra a resposta (erro em vermelho, ok em verde) e pode limpar ou navegar. */
export default function FormAcao({ acao, children, className, limpar = true, botao, pendenteRotulo = "Salvando…", classeBotao = "btn" }: {
  acao: (r: Resultado, f: FormData) => Promise<Resultado>;
  children: React.ReactNode;
  className?: string;
  limpar?: boolean;
  botao?: React.ReactNode;
  pendenteRotulo?: string;
  classeBotao?: string;
}) {
  const [r, enviar, pendente] = useActionState<Resultado, FormData>(acao, null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (!r?.ok) return;
    if (r.ir) router.push(r.ir);
    else if (limpar) ref.current?.reset();
  }, [r, limpar, router]);
  return (
    <form ref={ref} action={enviar} className={className}>
      {children}
      {r && <p className={`col-span-full rounded px-3 py-2 text-[13px] ${r.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{r.mensagem}</p>}
      {botao !== undefined && <button className={classeBotao} disabled={pendente}>{pendente ? pendenteRotulo : botao}</button>}
    </form>
  );
}
