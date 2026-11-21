"use client";

import { useEffect, useState, useTransition } from "react";
import { buscarContasAbertas, type ContaAberta } from "./actions";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

/**
 * Procura contas em aberto (por nome, descrição, CPF/CNPJ ou valor) para escolher à mão: várias (uma linha do extrato
 * que paga várias contas) ou uma só (várias linhas que pagam uma conta).
 */
export default function BuscaContas({ tipo, alvo, multiplo, escolhidas, onChange, iniciais = [] }: {
  tipo: "PAGAR" | "RECEBER"; alvo: number; multiplo: boolean;
  escolhidas: ContaAberta[]; onChange: (c: ContaAberta[]) => void; iniciais?: ContaAberta[];
}) {
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<ContaAberta[]>(iniciais);
  const [pendente, start] = useTransition();

  useEffect(() => {
    const h = setTimeout(() => start(async () => setLista(await buscarContasAbertas(tipo, busca, alvo))), busca ? 350 : 0);
    return () => clearTimeout(h);
  }, [busca, tipo, alvo]);

  const marcada = (id: string) => escolhidas.some((c) => c.lancamentoId === id);
  const alternar = (c: ContaAberta) => {
    if (!multiplo) return onChange(marcada(c.lancamentoId) ? [] : [c]);
    onChange(marcada(c.lancamentoId) ? escolhidas.filter((x) => x.lancamentoId !== c.lancamentoId) : [...escolhidas, c]);
  };
  // as já escolhidas ficam no topo, mesmo fora da busca
  const mostrar = [...escolhidas, ...lista.filter((c) => !marcada(c.lancamentoId))];

  return (
    <div className="space-y-2">
      <input className="campo w-full" placeholder="Buscar conta em aberto: nome, descrição, CPF/CNPJ ou valor" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="max-h-64 overflow-y-auto rounded border border-[#dee2e6] bg-white">
        {mostrar.length === 0 && <p className="p-2 text-[13px] text-slate-500">{pendente ? "Buscando…" : "Nenhuma conta em aberto encontrada."}</p>}
        {mostrar.map((c) => (
          <label key={c.lancamentoId} className={`flex cursor-pointer items-center gap-2 border-b border-[#f0f0f0] px-2 py-1.5 text-[13px] last:border-0 ${marcada(c.lancamentoId) ? "bg-emerald-50" : "hover:bg-slate-50"}`}>
            <input type={multiplo ? "checkbox" : "radio"} checked={marcada(c.lancamentoId)} onChange={() => alternar(c)} />
            <span className="w-20 shrink-0 text-slate-600">{dataBr(c.vencimento)}</span>
            <span className="min-w-0 flex-1 truncate">{c.descricao}{c.pessoa ? <span className="text-slate-500"> · {c.pessoa}</span> : null}</span>
            <span className="shrink-0 font-semibold">{brl(c.valor)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Linha com a soma escolhida, o valor do extrato e a diferença (verde quando bate). */
export function Somatoria({ rotuloSoma, soma, rotuloAlvo, alvo, falta, sobra }: { rotuloSoma: string; soma: number; rotuloAlvo: string; alvo: number; falta: string; sobra: string }) {
  const dif = Math.round((alvo - soma) * 100) / 100;
  const bate = Math.abs(dif) < 0.01;
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded border px-3 py-2 text-[13px] ${bate ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
      <span>{rotuloSoma}: <b>{brl(soma)}</b></span>
      <span>{rotuloAlvo}: <b>{brl(alvo)}</b></span>
      <span>{bate ? "A soma bate." : `Diferença de ${brl(Math.abs(dif))}: ${dif > 0 ? falta : sobra}`}</span>
    </div>
  );
}
