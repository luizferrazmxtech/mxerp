"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icone from "@/components/Icone";
import Suspenso from "./Suspenso";
import { salvarColunas } from "@/lib/ui/preferencias";

/** Botão ☰ "Gerenciar colunas": marca/desmarca colunas; a escolha fica salva para o usuário. */
export default function GerenciarColunas({ lista, colunas, visiveis }: { lista: string; colunas: { chave: string; rotulo: string }[]; visiveis: string[] }) {
  const [sel, setSel] = useState(visiveis);
  const [, start] = useTransition();
  const router = useRouter();
  function alternar(chave: string) {
    const novo = sel.includes(chave) ? sel.filter((c) => c !== chave) : colunas.map((c) => c.chave).filter((c) => c === chave || sel.includes(c));
    if (!novo.length) return;
    setSel(novo);
    start(async () => { await salvarColunas(lista, novo); router.refresh(); });
  }
  return (
    <Suspenso direita classe="btn-sec px-2.5" titulo="Gerenciar colunas" botao={<Icone nome="lista" size={16} />}>
      <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase text-slate-500">Gerenciar colunas</div>
      {colunas.map((c) => (
        <label key={c.chave} onClick={(e) => e.stopPropagation()} className="flex cursor-pointer items-center gap-2 px-3 py-[6px] hover:bg-slate-100">
          <input type="checkbox" checked={sel.includes(c.chave)} onChange={() => alternar(c.chave)} /> {c.rotulo}
        </label>
      ))}
    </Suspenso>
  );
}
