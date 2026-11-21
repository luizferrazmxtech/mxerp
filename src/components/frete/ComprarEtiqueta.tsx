"use client";

import { useActionState, useState } from "react";
import Icone from "@/components/Icone";
import { comprarEtiquetaAcao, type Resultado } from "@/lib/frete/acoes";
import type { CotacaoFrete } from "@/lib/frete/tipos";
import { TabelaCotacao } from "./CotarFrete";

/** Venda → Entrega: cota de novo no Melhor Envio (o serviço escolhido no pedido vem marcado) e compra a etiqueta. */
export default function ComprarEtiqueta({ vendaId, escolhido }: { vendaId: string; escolhido: number | null }) {
  const [lista, setLista] = useState<CotacaoFrete[] | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [servico, setServico] = useState<CotacaoFrete | null>(null);
  const [r, acao, pendente] = useActionState<Resultado, FormData>(comprarEtiquetaAcao, null);

  async function cotar() {
    setCarregando(true); setErro("");
    try {
      const x = await fetch("/api/frete/cotar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vendaId }) });
      const j = (await x.json()) as { erro?: string; cotacoes?: CotacaoFrete[] };
      if (!x.ok) throw new Error(j.erro ?? `Erro ${x.status}`);
      setLista(j.cotacoes ?? []);
      setServico((j.cotacoes ?? []).find((c) => c.servicoId === escolhido && !c.erro) ?? null);
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setCarregando(false); }
  }

  if (r?.ok) return <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">{r.mensagem}</p>;
  return (
    <div className="space-y-2">
      {!lista && <button type="button" className="btn" disabled={carregando} onClick={cotar}><Icone nome="frete" size={14} /> {carregando ? "Cotando…" : "Cotar e comprar etiqueta"}</button>}
      {erro && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{erro}</p>}
      {lista && (
        <div className="cartao overflow-x-auto">
          <TabelaCotacao cotacoes={lista} escolhido={servico?.servicoId ?? null} onEscolher={setServico} rotuloBotao="Escolher" custo />
          <form action={acao} className="flex flex-wrap items-center gap-3 border-t px-4 py-3">
            <input type="hidden" name="vendaId" value={vendaId} />
            <input type="hidden" name="servicoId" value={servico?.servicoId ?? ""} />
            <button className="btn-verde" disabled={!servico || pendente}
              onClick={(e) => { if (!window.confirm(`Comprar a etiqueta ${servico?.transportadora} ${servico?.servico}? O valor sai do saldo da carteira do Melhor Envio.`)) e.preventDefault(); }}>
              {pendente ? "Comprando…" : servico ? `Comprar etiqueta ${servico.transportadora} ${servico.servico} (${servico.custo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})` : "Escolha o serviço"}
            </button>
            <button type="button" className="btn-sec" onClick={cotar} disabled={carregando}>{carregando ? "Cotando…" : "Cotar de novo"}</button>
            {r && !r.ok && <p className="text-[13px] text-red-700">{r.mensagem}</p>}
          </form>
        </div>
      )}
    </div>
  );
}
