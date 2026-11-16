"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import Icone from "@/components/Icone";
import { visualizacaoOsAcao } from "@/lib/os/acoes";

/** Ícones "Visualizar lista" / "Visualizar kanban": a escolha fica salva para o usuário. */
export default function TrocarVisualizacao({ kanban, lista }: { kanban: boolean; lista: string }) {
  const router = useRouter();
  const [p, start] = useTransition();
  const ir = (modo: "lista" | "kanban") => start(async () => { await visualizacaoOsAcao(modo); router.push(lista); router.refresh(); });
  const cls = (ativo: boolean) => `px-2.5 py-1.5 ${ativo ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`;
  return (
    <span className={`inline-flex overflow-hidden rounded border border-slate-300 ${p ? "opacity-60" : ""}`}>
      <button type="button" title="Visualizar lista" className={cls(!kanban)} onClick={() => ir("lista")}><Icone nome="lista" size={15} /></button>
      <button type="button" title="Visualizar kanban" className={cls(kanban)} onClick={() => ir("kanban")}><Icone nome="colunas" size={15} /></button>
    </span>
  );
}
