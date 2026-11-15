"use client";

import { useActionState, useState } from "react";
import Pagamentos, { type Forma, type LinhaPag } from "@/components/Pagamentos";
import { faturar, type Resultado } from "../actions";

export default function Faturar({ osId, total, formas }: { osId: string; total: number; formas: Forma[] }) {
  const [pags, setPags] = useState<LinhaPag[]>([]);
  const [estado, acao, pendente] = useActionState<Resultado, FormData>(faturar, null);
  const semEstoque = estado && !estado.ok && estado.mensagem.startsWith("Sem estoque");
  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="osId" value={osId} />
      <input type="hidden" name="pagamentos" value={JSON.stringify(pags.filter((p) => p.valor > 0))} />
      <Pagamentos formas={formas} total={total} onChange={setPags} />
      {semEstoque && <label className="flex gap-2 text-sm text-red-700"><input type="checkbox" name="negativo" /> Baixar mesmo assim (estoque negativo)</label>}
      <button className="btn w-full" disabled={pendente}>Faturar OS</button>
      {estado && <p className={`text-sm ${estado.ok ? "text-emerald-700" : "text-red-700"}`}>{estado.mensagem}</p>}
    </form>
  );
}
