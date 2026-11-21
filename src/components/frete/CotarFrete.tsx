"use client";

import { useState } from "react";
import Icone from "@/components/Icone";
import type { CotacaoFrete, ItemCotacao } from "@/lib/frete/tipos";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Tabela de serviços cotados (Correios, Jadlog…), com o mais barato e o mais rápido marcados. */
export function TabelaCotacao({ cotacoes, escolhido, onEscolher, rotuloBotao = "Usar", custo }: {
  cotacoes: CotacaoFrete[]; escolhido?: number | null; onEscolher?: (c: CotacaoFrete) => void; rotuloBotao?: string; custo?: boolean;
}) {
  const ok = cotacoes.filter((c) => !c.erro);
  const barato = ok[0]?.servicoId;
  const rapido = [...ok].sort((a, b) => (a.prazoDias ?? 99) - (b.prazoDias ?? 99))[0]?.servicoId;
  return (
    <table className="tabela">
      <thead><tr><th>Serviço</th><th className="text-right">Prazo</th>{custo && <th className="text-right">Custo</th>}<th className="text-right">Valor</th>{onEscolher && <th className="w-24"></th>}</tr></thead>
      <tbody>
        {cotacoes.map((c) => (
          <tr key={c.servicoId} className={c.servicoId === escolhido ? "bg-teal-50" : c.erro ? "text-slate-400" : ""}>
            <td>
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {c.logo && <img src={c.logo} alt="" className="h-5 w-12 object-contain" />}
                <span><b>{c.transportadora}</b> {c.servico}</span>
                {c.servicoId === barato && <span className="etiqueta border-emerald-300 bg-emerald-50 text-emerald-700">mais barato</span>}
                {c.servicoId === rapido && rapido !== barato && <span className="etiqueta border-sky-300 bg-sky-50 text-sky-700">mais rápido</span>}
              </div>
              {c.erro && <div className="text-[11px]">{c.erro}</div>}
            </td>
            <td className="text-right">{c.erro ? "—" : c.prazoDias != null ? `${c.prazoDias} dia${c.prazoDias === 1 ? "" : "s"} úte${c.prazoDias === 1 ? "il" : "is"}` : "—"}</td>
            {custo && <td className="text-right text-slate-500">{c.erro ? "—" : brl(c.custo)}</td>}
            <td className="text-right font-semibold">{c.erro ? "—" : brl(c.valor)}</td>
            {onEscolher && <td className="text-right">{!c.erro && (c.servicoId === escolhido ? <span className="text-[12px] text-marca"><Icone nome="ok" size={13} /> Escolhido</span> : <button type="button" className="btn-sec py-1 text-[12px]" onClick={() => onEscolher(c)}>{rotuloBotao}</button>)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Botão "Cotar frete" do formulário de venda/orçamento: abre as opções do Melhor Envio e põe o valor escolhido no frete. */
export default function CotarFrete({ clienteId, enderecoEntregaId, itens, escolhido, onEscolher }: {
  clienteId: string; enderecoEntregaId: string; itens: ItemCotacao[]; escolhido: number | null; onEscolher: (c: CotacaoFrete) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [cep, setCep] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [lista, setLista] = useState<CotacaoFrete[]>([]);

  async function cotar(cepDigitado = cep) {
    setCarregando(true); setErro("");
    try {
      const r = await fetch("/api/frete/cotar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clienteId, enderecoEntregaId, cep: cepDigitado, itens }) });
      const j = (await r.json()) as { erro?: string; cep?: string; cotacoes?: CotacaoFrete[] };
      if (!r.ok) throw new Error(j.erro ?? `Erro ${r.status}`);
      setLista(j.cotacoes ?? []);
      if (j.cep && !cepDigitado) setCep(j.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2"));
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); setLista([]); } finally { setCarregando(false); }
  }

  return (
    <>
      <button type="button" className="btn-sec" disabled={!itens.length} title={itens.length ? "Cotar no Melhor Envio" : "Adicione produtos para cotar"}
        onClick={() => { setAberto(true); if (clienteId || cep) void cotar(); }}><Icone nome="frete" size={14} /> Cotar frete</button>
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16" onClick={() => setAberto(false)}>
          <div className="cartao w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b bg-[#f7f7f7] px-4 py-3"><Icone nome="frete" size={15} /><b className="text-[15px]">Cotar frete no Melhor Envio</b>
              <button type="button" className="ml-auto text-slate-500 hover:text-slate-800" onClick={() => setAberto(false)}><Icone nome="fechar" size={16} /></button></div>
            <div className="flex flex-wrap items-end gap-2 px-4 py-3">
              <label className="text-[13px]"><span className="rotulo">CEP de entrega</span><input className="campo w-36" value={cep} onChange={(e) => setCep(e.target.value)} placeholder="00000-000" inputMode="numeric" /></label>
              <button type="button" className="btn-sec" disabled={carregando} onClick={() => cotar(cep)}>{carregando ? "Cotando…" : "Cotar"}</button>
              <span className="text-[11px] text-slate-500">Em branco, usa o CEP do endereço de entrega do cliente.</span>
            </div>
            {erro && <p className="mx-4 mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{erro}</p>}
            {carregando && !lista.length && <p className="px-4 pb-4 text-[13px] text-slate-500">Consultando as transportadoras…</p>}
            {lista.length > 0 && <TabelaCotacao cotacoes={lista} escolhido={escolhido} onEscolher={(c) => { onEscolher(c); setAberto(false); }} />}
            <p className="px-4 py-2 text-[11px] text-slate-500">O valor já tem os acréscimos da configuração do frete. Produtos sem peso e medidas no cadastro usam a caixa padrão.</p>
          </div>
        </div>
      )}
    </>
  );
}
