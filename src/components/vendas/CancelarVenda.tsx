"use client";

import Link from "next/link";
import { useFormAcao } from "@/components/ui/useFormAcao";
import { cancelarVendaAcao, type Resultado } from "@/lib/vendas/acoes";

type Previa = { numero: number; balcao: boolean; desfazer: string[]; avisos: string[]; bloqueios: string[]; recebido: number };

/** Cartão "Cancelar venda": lista tudo o que será desfeito (financeiro, estoque, orçamento) antes de confirmar. */
export default function CancelarVenda({ id, previa, voltar }: { id: string; previa: Previa; voltar: string }) {
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(cancelarVendaAcao, null);
  const brl = (x: number) => x.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const bloqueada = previa.bloqueios.length > 0;
  const pedirEstorno = previa.recebido > 0 && !previa.balcao;
  return (
    <div className="cartao mb-3 border-red-200 p-4">
      {r?.ok ? (
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <span className="rounded bg-emerald-50 px-3 py-2 text-emerald-800">{r.mensagem}</span>
          <Link href={voltar} className="btn-sec ml-auto">Fechar</Link>
        </div>
      ) : (
        <form {...formAcao} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={id} />
          <div className="w-full text-[13px]">
            <div className="text-[14px] font-semibold text-red-700">Cancelar a venda nº {previa.numero}{previa.balcao ? " do PDV" : ""}</div>
            {bloqueada ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-red-700">{previa.bloqueios.map((b) => <li key={b}>{b}</li>)}</ul>
            ) : (
              <>
                <p className="mt-1 text-slate-600">Ao cancelar, o sistema desfaz:</p>
                {previa.desfazer.length
                  ? <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">{previa.desfazer.map((d) => <li key={d}>{d}</li>)}</ul>
                  : <p className="mt-1 text-slate-500">Nada além da situação: a venda não tem financeiro, estoque nem orçamento ligados.</p>}
              </>
            )}
            {previa.avisos.length > 0 && <ul className="mt-2 list-disc space-y-1 rounded bg-amber-50 py-2 pl-8 pr-3 text-amber-800">{previa.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
          </div>
          {!bloqueada && pedirEstorno && (
            <label className="flex w-full items-center gap-2 text-[13px]">
              <input type="checkbox" name="estornar" value="1" required />
              Estornar o que já foi recebido ({brl(previa.recebido)}) e devolver o valor ao cliente
            </label>
          )}
          {!bloqueada && <label className="min-w-64 flex-1"><span className="rotulo">Motivo</span><input name="motivo" className="campo" placeholder="Opcional: vai para o histórico" /></label>}
          <Link href={voltar} className={`btn-sec ${bloqueada ? "ml-auto" : ""}`}>Voltar</Link>
          {!bloqueada && <button className="btn bg-red-600 hover:bg-red-700" disabled={pendente}>{pendente ? "Cancelando…" : "Cancelar venda"}</button>}
        </form>
      )}
      {r && !r.ok && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-[13px] text-red-700">{r.mensagem}</div>}
    </div>
  );
}
