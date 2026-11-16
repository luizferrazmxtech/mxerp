"use client";

import { useActionState } from "react";
import { fecharCaixaAcao, type ResultadoSimples } from "./actions";

export default function FecharCaixa({ caixaId, esperado }: { caixaId: string; esperado: number }) {
  const [r, acao, pendente] = useActionState<ResultadoSimples, FormData>(fecharCaixaAcao, null);
  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="caixaId" value={caixaId} />
      <label className="block"><span className="rotulo">Dinheiro contado na gaveta (R$)</span>
        <input name="valor" className="campo text-right" inputMode="decimal" defaultValue={esperado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} autoFocus /></label>
      <label className="block"><span className="rotulo">Observação</span><input name="observacao" className="campo" /></label>
      {r && !r.ok && <p className="text-[13px] text-red-700">{r.mensagem}</p>}
      <button className="btn w-full" disabled={pendente}>Fechar caixa</button>
    </form>
  );
}
