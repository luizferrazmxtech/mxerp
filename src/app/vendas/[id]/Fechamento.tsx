"use client";

import { useActionState, useState } from "react";
import Pagamentos, { type Forma, type LinhaPag } from "@/components/Pagamentos";
import { concluir, mudarSituacao, type ResultadoSimples } from "../actions";

export default function Fechamento({ vendaId, situacao, total, formas }: {
  vendaId: string; situacao: string; total: number; formas: Forma[];
}) {
  const [pags, setPags] = useState<LinhaPag[]>([]);
  const [rConcluir, acaoConcluir, p1] = useActionState<ResultadoSimples, FormData>(concluir, null);
  const [rSit, acaoSit, p2] = useActionState<ResultadoSimples, FormData>(mudarSituacao, null);
  const semEstoque = rConcluir && !rConcluir.ok && rConcluir.mensagem.startsWith("Sem estoque");
  const recebidas = rSit && !rSit.ok && rSit.mensagem.includes("recebidas");

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {situacao !== "CONCLUIDA" && situacao !== "CANCELADA" && (
        <form action={acaoConcluir} className="cartao space-y-3 p-4">
          <h2 className="font-semibold">Concluir venda</h2>
          <input type="hidden" name="vendaId" value={vendaId} />
          <input type="hidden" name="pagamentos" value={JSON.stringify(pags.filter((p) => p.valor > 0))} />
          <Pagamentos formas={formas} total={total} onChange={setPags} />
          {semEstoque && <label className="flex gap-2 text-sm text-red-700"><input type="checkbox" name="negativo" /> Baixar mesmo assim (estoque negativo)</label>}
          <button className="btn w-full" disabled={p1 || total <= 0}>Concluir e baixar estoque</button>
          {rConcluir && <p className={`text-sm ${rConcluir.ok ? "text-emerald-700" : "text-red-700"}`}>{rConcluir.mensagem}</p>}
        </form>
      )}
      <form action={acaoSit} className="cartao space-y-3 p-4">
        <h2 className="font-semibold">Situação</h2>
        <input type="hidden" name="vendaId" value={vendaId} />
        <div className="flex gap-2">
          <select name="situacao" className="campo" defaultValue={situacao === "CONCLUIDA" ? "CANCELADA" : situacao} key={situacao}>
            <option value="ORCAMENTO">Orçamento</option>
            <option value="ABERTA">Em aberto (reserva)</option>
            <option value="CANCELADA">Cancelada</option>
          </select>
          <button className="btn-sec" disabled={p2}>Salvar</button>
        </div>
        {recebidas && <label className="flex gap-2 text-sm text-red-700"><input type="checkbox" name="forcar" /> Cancelar e apagar os recebimentos</label>}
        {rSit && <p className={`text-sm ${rSit.ok ? "text-emerald-700" : "text-red-700"}`}>{rSit.mensagem}</p>}
      </form>
    </div>
  );
}
