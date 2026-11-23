"use client";

import Link from "next/link";
import { useFormAcao } from "@/components/ui/useFormAcao";
import { cancelarVendaBalcaoAcao, type Resultado } from "@/lib/vendas/acoes";

/** Cartão "Cancelar venda do PDV": devolve os produtos ao estoque e estorna o recebimento lançado pelo caixa. */
export default function CancelarBalcao({ id, numero, recebido, formas, voltar }: { id: string; numero: number; recebido: string; formas: string; voltar: string }) {
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(cancelarVendaBalcaoAcao, null);
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
          <div className="w-full">
            <div className="font-semibold text-red-700">Cancelar a venda nº {numero} do PDV</div>
            <p className="text-[13px] text-slate-600">
              Os produtos voltam ao estoque e o recebimento de <b>{recebido}</b>{formas ? ` (${formas})` : ""} é estornado do financeiro e do caixa.
              Devolva o valor ao cliente. Se a NFC-e foi autorizada, cancele a nota antes.
            </p>
          </div>
          <label className="min-w-64 flex-1"><span className="rotulo">Motivo</span><input name="motivo" className="campo" placeholder="Opcional: vai para o histórico" /></label>
          <Link href={voltar} className="btn-sec">Voltar</Link>
          <button className="btn bg-red-600 hover:bg-red-700" disabled={pendente}>{pendente ? "Cancelando…" : "Cancelar venda"}</button>
        </form>
      )}
      {r && !r.ok && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-[13px] text-red-700">{r.mensagem}</div>}
    </div>
  );
}
