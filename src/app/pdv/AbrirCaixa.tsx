"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import Icone from "@/components/Icone";
import { abrirCaixaAcao, type ResultadoSimples } from "../vendas/actions";

/** Tela de abertura do caixa, como no Gestão Click: valor inicial e opção de lançar no financeiro. */
export default function AbrirCaixa() {
  const [r, acao, pendente] = useActionState<ResultadoSimples, FormData>(abrirCaixaAcao, null);
  const [valor, setValor] = useState("0,00");
  const ref = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); ref.current?.focus(); ref.current?.select(); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);
  return (
    <div className="flex min-h-[calc(100vh-50px)] flex-col items-center px-4 pt-6">
      <form ref={form} action={acao} className="w-full max-w-[475px]">
        <section className="cartao">
          <div className="rounded-t-md border-b bg-[#f7f7f7] px-4 py-3">
            <h1 className="flex items-center gap-1.5 text-[17px] font-light"><Icone nome="pdv" size={15} /> Abra o <b className="font-semibold">caixa</b> para começar a vender</h1>
            <p className="text-[11px] text-slate-500">Informe o dinheiro disponível no caixa antes da primeira venda.</p>
          </div>
          <div className="p-4">
            <span className="rotulo">Valor da abertura</span>
            <div className="flex">
              <span className="flex items-center rounded-l border border-r-0 border-slate-300 bg-slate-50 px-3 text-slate-500">R$</span>
              <input ref={ref} name="valor" autoFocus className="campo rounded-l-none py-2.5 text-right text-[16px]" inputMode="decimal"
                value={valor} onChange={(e) => setValor(e.target.value)} onFocus={(e) => e.target.select()} />
            </div>
            <label className="mt-4 flex items-center gap-3 border-t pt-4">
              <Icone nome="dinheiro" size={18} className="text-slate-600" />
              <span className="flex-1"><span className="block text-[13px] font-semibold">Gerar um recebimento no financeiro</span>
                <span className="text-[11px] text-slate-500">O valor da abertura entra como recebimento na conta Caixa.</span></span>
              <input type="checkbox" name="recebimento" className="h-4 w-8 accent-marca" />
            </label>
          </div>
        </section>
        {r && !r.ok && <p className="mt-2 text-[13px] text-red-700">{r.mensagem}</p>}
        <div className="mt-3 flex justify-between">
          <Link href="/vendas/balcao" className="btn-sec">Cancelar</Link>
          <button className="btn px-4" disabled={pendente}>Abrir caixa</button>
        </div>
      </form>
      <div className="mt-auto mb-6 w-full max-w-5xl rounded-md border bg-white py-2 text-center text-[12px] text-slate-600">
        <kbd className="rounded border bg-slate-50 px-1.5">F2</kbd> Mudar o valor <span className="mx-3" />
        <kbd className="rounded border bg-slate-50 px-1.5">Enter</kbd> Confirmar abertura
      </div>
    </div>
  );
}
