"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import { ligarNotasAcao } from "./actions";

/** Liga às vendas/OS as notas trazidas do Gestão Click que ficaram sem origem (não precisa do backup). */
export default function LigarNotas() {
  const [r, , pendente, form] = useFormAcao(ligarNotasAcao, null);
  return (
    <form {...form} className="flex flex-wrap items-center gap-2">
      <button name="modo" value="simular" className="btn-sec" disabled={pendente}>Simular</button>
      <button name="modo" value="gravar" className="btn" disabled={pendente}>{pendente ? "Ligando…" : "Ligar notas"}</button>
      {r && <p className={`w-full rounded px-3 py-2 text-[13px] ${r.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{r.mensagem}</p>}
    </form>
  );
}
