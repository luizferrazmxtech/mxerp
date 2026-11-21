"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import Link from "next/link";
import { alterarSituacaoAcao, gerarVendaAcao, type Resultado } from "@/lib/orcamentos/acoes";
import BotaoAcao from "@/components/ui/BotaoAcao";

/** Painel "Alterar situação" (abre pela lista ou pela visualização). */
export default function FormSituacao({ id, numero, atual, situacoes, voltar, acao: acaoServidor, rotulo = "do orçamento", depois }: {
  id: string; numero: number; atual: string; situacoes: { id: string; nome: string; geraVenda?: boolean; aviso?: string }[]; voltar: string;
  acao?: (r: Resultado, f: FormData) => Promise<Resultado>; rotulo?: string;
  /** próximo passo sugerido depois de salvar (OS: marcar os itens que estão no carro) */
  depois?: { href: string; texto: string };
}) {
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(acaoServidor ?? alterarSituacaoAcao, null);
  return (
    <div className="cartao mb-3 p-4">
      <form {...formAcao} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={id} />
        <div className="w-full font-semibold">Alterar situação {rotulo} nº {numero}</div>
        <label className="w-64"><span className="rotulo obrig">Situação</span>
          <select name="situacaoId" defaultValue={atual} className="campo">{situacoes.map((s) => <option key={s.id} value={s.id}>{s.nome}{s.geraVenda ? " (gera venda)" : ""}{s.aviso ? ` (${s.aviso})` : ""}</option>)}</select></label>
        <label className="min-w-64 flex-1"><span className="rotulo">Observação</span><input name="observacao" className="campo" placeholder="Opcional: vai para o histórico" /></label>
        <Link href={voltar} className="btn-sec">Fechar</Link>
        <button className="btn" disabled={pendente}>{pendente ? "Salvando…" : "Salvar"}</button>
      </form>
      {r && <div className={`mt-3 rounded px-3 py-2 text-[13px] ${r.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
        {r.mensagem}
        {r.ok && depois && <div className="mt-1"><Link href={depois.href} className="font-semibold underline">{depois.texto}</Link></div>}
        {r.sugerirVenda && <div className="mt-2 flex items-center gap-2">Deseja gerar a venda deste orçamento agora?
          <BotaoAcao acao={gerarVendaAcao.bind(null, id)} className="btn py-1" icone="carrinho">Gerar venda</BotaoAcao></div>}
      </div>}
    </div>
  );
}
