"use client";

import { useActionState } from "react";
import Link from "next/link";

type Res = { ok: boolean; mensagem: string; notaId?: string } | null;

/** Formulário de uma ação com campos ocultos + mensagem de retorno. */
export default function BotaoAcao({ acao, campos, rotulo, secundario, children }: {
  acao: (e: Res, f: FormData) => Promise<Res>;
  campos: Record<string, string>;
  rotulo: string;
  secundario?: boolean;
  children?: React.ReactNode;
}) {
  const [estado, act, pendente] = useActionState<Res, FormData>(acao, null);
  return (
    <form action={act} className="space-y-2">
      {Object.entries(campos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      <button className={secundario ? "btn-sec" : "btn"} disabled={pendente}>{pendente ? "Aguarde…" : rotulo}</button>
      {estado && (
        <p className={`text-sm ${estado.ok ? "text-emerald-700" : "text-red-700"}`}>
          {estado.mensagem} {estado.notaId && <Link className="underline" href={`/fiscal/${estado.notaId}`}>abrir</Link>}
        </p>
      )}
    </form>
  );
}
