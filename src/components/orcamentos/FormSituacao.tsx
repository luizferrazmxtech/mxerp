"use client";

import Link from "next/link";
import { useActionState } from "react";
import { alterarSituacaoAcao, gerarVendaAcao, type Resultado } from "@/lib/orcamentos/acoes";
import BotaoAcao from "@/components/ui/BotaoAcao";

/** Painel "Alterar situação" (abre pela lista ou pela visualização). */
export default function FormSituacao({ id, numero, atual, situacoes, voltar }: {
  id: string; numero: number; atual: string; situacoes: { id: string; nome: string; geraVenda: boolean }[]; voltar: string;
}) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(alterarSituacaoAcao, null);
  return (
    <div className="cartao mb-3 p-4">
      <form action={acao} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={id} />
        <div className="w-full font-semibold">Alterar situação do orçamento nº {numero}</div>
        <label className="w-64"><span className="rotulo obrig">Situação</span>
          <select name="situacaoId" defaultValue={atual} className="campo">{situacoes.map((s) => <option key={s.id} value={s.id}>{s.nome}{s.geraVenda ? " (gera venda)" : ""}</option>)}</select></label>
        <label className="min-w-64 flex-1"><span className="rotulo">Observação</span><input name="observacao" className="campo" placeholder="Opcional: vai para o histórico" /></label>
        <Link href={voltar} className="btn-sec">Fechar</Link>
        <button className="btn" disabled={pendente}>{pendente ? "Salvando…" : "Salvar"}</button>
      </form>
      {r && <div className={`mt-3 rounded px-3 py-2 text-[13px] ${r.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
        {r.mensagem}
        {r.sugerirVenda && <div className="mt-2 flex items-center gap-2">Deseja gerar a venda deste orçamento agora?
          <BotaoAcao acao={gerarVendaAcao.bind(null, id)} className="btn py-1" icone="carrinho">Gerar venda</BotaoAcao></div>}
      </div>}
    </div>
  );
}
