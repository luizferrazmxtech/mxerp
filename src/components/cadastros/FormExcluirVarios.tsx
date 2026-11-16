"use client";

import { useActionState } from "react";
import Link from "next/link";
import Icone from "@/components/Icone";
import { excluirVariasAcao, type Resultado } from "@/lib/cadastros/acoes";

/** Modo "Excluir em massa": a tabela vira formulário com caixas de seleção. */
export default function FormExcluirVarios({ papel, plural, voltar, children }: { papel: string; plural: string; voltar: string; children: React.ReactNode }) {
  const [estado, acao, pendente] = useActionState<Resultado, FormData>(excluirVariasAcao, null);
  return (
    <form action={acao} onSubmit={(e) => { if (!window.confirm(`Excluir os ${plural.toLowerCase()} marcados?`)) e.preventDefault(); }}>
      <input type="hidden" name="papel" value={papel} />
      <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
        <Icone nome="excluir" size={14} /> Marque os {plural.toLowerCase()} que deseja excluir.
        <label className="flex items-center gap-1"><input type="checkbox" onChange={(e) => document.querySelectorAll<HTMLInputElement>("input[name=ids]").forEach((c) => { c.checked = e.target.checked; })} /> marcar todos da página</label>
        <span className="ml-auto flex gap-2">
          <Link href={voltar} className="btn-sec py-1">Cancelar</Link>
          <button className="btn py-1" disabled={pendente} style={{ background: "#dc2626" }}>{pendente ? "Excluindo…" : "Excluir selecionados"}</button>
        </span>
      </div>
      {estado && <div className={`mb-2 rounded px-3 py-2 text-[13px] ${estado.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{estado.mensagem}</div>}
      {children}
    </form>
  );
}
