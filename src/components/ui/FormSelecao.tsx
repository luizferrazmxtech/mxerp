"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import Link from "next/link";

type Resultado = { ok: boolean; mensagem: string } | null;

/** Ação em massa sobre linhas marcadas (a tabela fica dentro do formulário, com caixas name="ids"). */
export default function FormSelecao({ acao, titulo, botao, perigo, voltar, campos, confirmar, children }: {
  acao: (r: Resultado, f: FormData) => Promise<Resultado>; titulo: string; botao: string; perigo?: boolean; voltar: string;
  campos?: React.ReactNode; confirmar?: string; children: React.ReactNode;
}) {
  const [estado, , pendente, formEnviar] = useFormAcao<Resultado>(acao, null);
  return (
    <form {...formEnviar} onSubmit={(e) => { if (confirmar && !window.confirm(confirmar)) e.preventDefault(); }}>
      <div className={`mb-2 rounded border px-3 py-2 text-[13px] ${perigo ? "border-red-200 bg-red-50 text-red-800" : "border-sky-200 bg-sky-50 text-slate-800"}`}>
        <div className="flex flex-wrap items-center gap-3">
          <b>{titulo}</b>
          <label className="flex items-center gap-1"><input type="checkbox" onChange={(e) => document.querySelectorAll<HTMLInputElement>("input[name=ids]").forEach((c) => { c.checked = e.target.checked; })} /> marcar todos da página</label>
          <span className="ml-auto flex gap-2">
            <Link href={voltar} className="btn-sec py-1">Cancelar</Link>
            <button className="btn py-1" disabled={pendente} style={perigo ? { background: "#dc2626" } : undefined}>{pendente ? "Aguarde…" : botao}</button>
          </span>
        </div>
        {campos && <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">{campos}</div>}
      </div>
      {estado && <div className={`mb-2 rounded px-3 py-2 text-[13px] ${estado.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{estado.mensagem}</div>}
      {children}
    </form>
  );
}

/** Formulário simples com resposta (usado em painéis como "Ajustar valores em massa"). */
export function FormAcao({ acao, children, className }: { acao: (r: Resultado, f: FormData) => Promise<Resultado>; children: React.ReactNode; className?: string }) {
  const [estado, , pendente, formEnviar] = useFormAcao<Resultado>(acao, null);
  return (
    <form {...formEnviar} className={className}>
      <fieldset disabled={pendente} className="contents">{children}</fieldset>
      {estado && <p className={`mt-2 text-[13px] ${estado.ok ? "text-emerald-700" : "text-red-700"}`}>{estado.mensagem}</p>}
    </form>
  );
}
