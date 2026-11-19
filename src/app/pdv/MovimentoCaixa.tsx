"use client";

import { useActionState } from "react";
import { movimentarCaixaAcao, type ResultadoSimples } from "./actions";

export default function MovimentoCaixa({ tipo, contas, disponivel }: { tipo: "SANGRIA" | "SUPRIMENTO"; contas: { id: string; nome: string }[]; disponivel: number }) {
  const [r, acao, pendente] = useActionState<ResultadoSimples, FormData>(movimentarCaixaAcao, null);
  const sangria = tipo === "SANGRIA";
  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="tipo" value={tipo} />
      <label className="block"><span className="rotulo">Valor (R$)</span>
        <input name="valor" className="campo text-right" inputMode="decimal" required autoFocus /></label>
      {sangria && <p className="text-[12px] text-slate-500">Dinheiro na gaveta agora: {disponivel.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>}
      <label className="block"><span className="rotulo">Motivo</span>
        <input name="motivo" className="campo" placeholder={sangria ? "Ex.: depósito no banco, excesso na gaveta" : "Ex.: troco"} /></label>
      <label className="block"><span className="rotulo">{sangria ? "Levar para a conta (opcional)" : "Retirado da conta (opcional)"}</span>
        <select name="contaId" className="campo" defaultValue="">
          <option value="">Só registrar no caixa</option>
          {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <span className="mt-1 block text-[12px] text-slate-500">Com uma conta escolhida, o valor vira uma transferência no financeiro {sangria ? "do Caixa para essa conta" : "dessa conta para o Caixa"}.</span>
      </label>
      {r && !r.ok && <p className="text-[13px] text-red-700">{r.mensagem}</p>}
      <button className="btn w-full" disabled={pendente}>{sangria ? "Registrar sangria" : "Registrar suprimento"}</button>
    </form>
  );
}
