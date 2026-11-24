"use client";

import { useState } from "react";
import { useFormAcao } from "@/components/ui/useFormAcao";
import Link from "next/link";
import { alterarSituacaoAcao, gerarVendaAcao, type Resultado } from "@/lib/orcamentos/acoes";
import BotaoAcao from "@/components/ui/BotaoAcao";

type Sit = { id: string; nome: string; geraVenda?: boolean; aviso?: string; cancela?: boolean };

/**
 * Opções do select. Orçamento: a situação de concretizado vira duas opções, "gera venda" e "gera OS"
 * (valor "id|venda" / "id|os"); o que já foi gerado sai da lista e fica a opção de só trocar a situação.
 */
function opcoes(situacoes: Sit[], atual: string, gerados?: { venda: boolean; os: boolean }) {
  return situacoes.flatMap((s) => {
    if (!s.geraVenda || !gerados) return [{ valor: s.id, texto: `${s.nome}${s.geraVenda ? " (gera venda)" : ""}${s.aviso ? ` (${s.aviso})` : ""}` }];
    const r: { valor: string; texto: string }[] = [];
    if (!gerados.venda) r.push({ valor: `${s.id}|venda`, texto: `${s.nome} (gera venda)` });
    if (!gerados.os) r.push({ valor: `${s.id}|os`, texto: `${s.nome} (gera OS)` });
    if (gerados.venda || gerados.os || s.id === atual) r.push({ valor: s.id, texto: s.nome });
    return r;
  });
}

/** Painel "Alterar situação" (abre pela lista ou pela visualização). */
export default function FormSituacao({ id, numero, atual, situacoes, voltar, acao: acaoServidor, rotulo = "do orçamento", depois, gerados, cancelarHref }: {
  id: string; numero: number; atual: string; situacoes: Sit[]; voltar: string;
  /** orçamento: o que ele já gerou (esconde "gera venda"/"gera OS" já feitos) */
  gerados?: { venda: boolean; os: boolean };
  acao?: (r: Resultado, f: FormData) => Promise<Resultado>; rotulo?: string;
  /** próximo passo sugerido depois de salvar (OS: marcar os itens que estão no carro) */
  depois?: { href: string; texto: string };
  /** venda: tela que mostra o que o cancelamento desfaz (aparece ao escolher uma situação que cancela) */
  cancelarHref?: string;
}) {
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(acaoServidor ?? alterarSituacaoAcao, null);
  const [sel, setSel] = useState(atual);
  const cancelando = !!cancelarHref && sel !== atual && !!situacoes.find((s) => s.id === sel)?.cancela;
  return (
    <div className="cartao mb-3 p-4">
      <form {...formAcao} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={id} />
        <div className="w-full font-semibold">Alterar situação {rotulo} nº {numero}</div>
        <label className="w-64"><span className="rotulo obrig">Situação</span>
          <select name="situacaoId" defaultValue={atual} onChange={(e) => setSel(e.target.value)} className="campo">{opcoes(situacoes, atual, gerados).map((s) => <option key={s.valor} value={s.valor}>{s.texto}</option>)}</select></label>
        <label className="min-w-64 flex-1"><span className="rotulo">Observação</span><input name="observacao" className="campo" placeholder="Opcional: vai para o histórico" /></label>
        <Link href={voltar} className="btn-sec">Fechar</Link>
        <button className="btn" disabled={pendente}>{pendente ? "Salvando…" : "Salvar"}</button>
        {cancelando && <p className="w-full rounded bg-amber-50 px-3 py-2 text-[13px] text-amber-800">Cancelar desfaz os vínculos da venda: contas a receber, boletos, reservas e baixas de estoque, e libera o orçamento de origem. <Link href={cancelarHref!} className="font-semibold underline">Ver o que será desfeito</Link></p>}
        {gerados && <p className="w-full text-[12px] text-slate-500">Escolhendo &quot;gera venda&quot; ou &quot;gera OS&quot;, a venda ou a OS é criada com o cliente, os itens e os valores do orçamento e já abre na tela.</p>}
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
