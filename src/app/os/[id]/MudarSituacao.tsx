"use client";

import { useActionState } from "react";
import { mudarSituacao, type Resultado } from "../actions";

export default function MudarSituacao({ osId, atual, opcoes }: {
  osId: string; atual: string; opcoes: { valor: string; rotulo: string }[];
}) {
  const [estado, acao, pendente] = useActionState<Resultado, FormData>(mudarSituacao, null);
  const precisaNegativo = estado && !estado.ok && estado.mensagem.startsWith("Sem estoque");
  const recebidas = estado && !estado.ok && estado.mensagem.includes("recebidas");
  return (
    <form action={acao} className="space-y-2">
      <input type="hidden" name="osId" value={osId} />
      <div className="flex gap-2">
        <select name="situacao" defaultValue={atual} key={atual} className="campo">
          {opcoes.filter((o) => o.valor !== "FATURADA" || atual === "FATURADA").map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
        </select>
        <button className="btn" disabled={pendente}>Salvar</button>
      </div>
      {precisaNegativo && (
        <label className="flex items-center gap-2 text-sm text-red-700">
          <input type="checkbox" name="negativo" /> Baixar mesmo assim (estoque fica negativo)
        </label>
      )}
      {recebidas && (
        <label className="flex items-center gap-2 text-sm text-red-700">
          <input type="checkbox" name="forcar" /> Reabrir e apagar os recebimentos
        </label>
      )}
      {estado && <p className={`text-sm ${estado.ok ? "text-emerald-700" : "text-red-700"}`}>{estado.mensagem}</p>}
    </form>
  );
}
