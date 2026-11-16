"use client";

import { useActionState, useState } from "react";
import Pagamentos, { type Forma, type LinhaPag } from "@/components/Pagamentos";
import { concluir, mudarSituacao, type ResultadoSimples } from "../actions";

/** Aba Pagamento: informa as formas e concretiza a venda (baixa o estoque e gera o contas a receber). */
export function Concluir({ vendaId, total, formas }: { vendaId: string; total: number; formas: Forma[] }) {
  const [pags, setPags] = useState<LinhaPag[]>([]);
  const [r, acao, pendente] = useActionState<ResultadoSimples, FormData>(concluir, null);
  const semEstoque = r && !r.ok && r.mensagem.startsWith("Sem estoque");
  return (
    <form action={acao} className="max-w-xl space-y-3">
      <input type="hidden" name="vendaId" value={vendaId} />
      <input type="hidden" name="pagamentos" value={JSON.stringify(pags.filter((p) => p.valor > 0))} />
      <Pagamentos formas={formas} total={total} onChange={setPags} />
      {semEstoque && <label className="flex gap-2 text-sm text-red-700"><input type="checkbox" name="negativo" /> Baixar mesmo assim (estoque negativo)</label>}
      <button className="btn w-full" disabled={pendente || total <= 0}>Concretizar venda</button>
      {r && <p className={`text-sm ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.mensagem}</p>}
    </form>
  );
}

/** Alterar situação: orçamento, em aberto (reserva) ou cancelada. */
export function SituacaoVenda({ vendaId, situacao }: { vendaId: string; situacao: string }) {
  const [r, acao, pendente] = useActionState<ResultadoSimples, FormData>(mudarSituacao, null);
  const recebidas = r && !r.ok && r.mensagem.includes("recebidas");
  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="vendaId" value={vendaId} />
      <div className="flex gap-2">
        <select name="situacao" className="campo" defaultValue={situacao === "CONCLUIDA" ? "ABERTA" : situacao} key={situacao}>
          <option value="ORCAMENTO">Orçamento</option>
          <option value="ABERTA">Em aberto (reserva o estoque)</option>
          <option value="CANCELADA">Cancelada</option>
        </select>
        <button className="btn" disabled={pendente}>Salvar</button>
      </div>
      {recebidas && <label className="flex gap-2 text-sm text-red-700"><input type="checkbox" name="forcar" /> Reabrir e apagar os recebimentos</label>}
      {r && <p className={`text-sm ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.mensagem}</p>}
    </form>
  );
}
