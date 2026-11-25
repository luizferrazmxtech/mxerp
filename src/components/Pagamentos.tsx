"use client";

import { useEffect, useState } from "react";
import { BANDEIRAS, calcularTaxa, maxVezes, pct, temTabela, tipoCartao } from "@/lib/financeiro/taxasCartao";

export type Forma = { id: string; nome: string; diasPrazo: number; /** PIX do PagSeguro: mostra o QR antes de fechar */ pix?: boolean; /** PIX do Banco Inter (sem taxa): mostra o QR antes de fechar */ pixInter?: boolean;
  /** para calcular a taxa (cartão: tabela por bandeira e vezes) */ tPag?: string; taxa?: number; taxas?: unknown };
export type LinhaPag = { formaPagamentoId: string; valor: number; parcelas: number; bandeira?: string };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;

/** Editor de formas de pagamento; o valor da última linha completa o total. */
export default function Pagamentos({ formas, total, onChange }: {
  formas: Forma[]; total: number; onChange: (p: LinhaPag[]) => void;
}) {
  const [linhas, setLinhas] = useState<{ formaPagamentoId: string; valor: string; parcelas: number; bandeira?: string }[]>([
    { formaPagamentoId: formas[0]?.id ?? "", valor: "", parcelas: 1 },
  ]);
  const atualizar = (novas: typeof linhas) => {
    setLinhas(novas);
    const somaOutras = novas.slice(0, -1).reduce((s, l) => s + num(l.valor), 0);
    onChange(novas.map((l, i) => ({
      formaPagamentoId: l.formaPagamentoId,
      parcelas: l.parcelas,
      bandeira: l.bandeira || undefined,
      valor: i === novas.length - 1 && !l.valor ? Math.round((total - somaOutras) * 100) / 100 : num(l.valor),
    })));
  };
  // recalcula o "restante" quando o total muda
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => atualizar(linhas), [total]);

  const somaInformada = linhas.reduce((s, l, i) => s + (i === linhas.length - 1 && !l.valor
    ? Math.max(0, total - linhas.slice(0, -1).reduce((a, x) => a + num(x.valor), 0)) : num(l.valor)), 0);

  return (
    <div className="space-y-2">
      {linhas.map((l, i) => {
        const forma = formas.find((f) => f.id === l.formaPagamentoId);
        const cartao = forma && tipoCartao(forma.tPag) && temTabela(forma.taxas) ? tipoCartao(forma.tPag) : null;
        const valor = i === linhas.length - 1 && !l.valor ? Math.max(0, total - linhas.slice(0, -1).reduce((a, x) => a + num(x.valor), 0)) : num(l.valor);
        const calc = forma && (cartao || (forma.taxa ?? 0) > 0) ? calcularTaxa({ tPag: forma.tPag ?? "", taxa: forma.taxa ?? 0, taxas: forma.taxas }, valor, l.bandeira, l.parcelas) : null;
        const up = (m: Partial<(typeof linhas)[number]>) => atualizar(linhas.map((x, j) => (j === i ? { ...x, ...m } : x)));
        return (
          <div key={i}>
            <div className="flex gap-2">
              <select className="campo" value={l.formaPagamentoId} onChange={(e) => up({ formaPagamentoId: e.target.value, parcelas: 1 })}>
                {formas.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
              <input className="campo w-32" placeholder={i === linhas.length - 1 ? "restante" : "valor"} value={l.valor} onChange={(e) => up({ valor: e.target.value })} />
              {cartao && (
                <select className="campo w-36" value={l.bandeira ?? ""} onChange={(e) => up({ bandeira: e.target.value, parcelas: Math.min(l.parcelas, maxVezes(forma?.taxas, e.target.value)) })} title="Bandeira do cartão">
                  <option value="">Bandeira</option>{BANDEIRAS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              )}
              {forma && (cartao === "CREDITO" || (!cartao && forma.diasPrazo > 0)) && (
                <select className="campo w-24" value={l.parcelas} onChange={(e) => up({ parcelas: Number(e.target.value) })}>
                  {Array.from({ length: cartao ? maxVezes(forma.taxas, l.bandeira) : 12 }, (_, k) => <option key={k} value={k + 1}>{k + 1}x</option>)}
                </select>
              )}
              {linhas.length > 1 && (
                <button type="button" className="text-xs text-red-600" onClick={() => atualizar(linhas.filter((_, j) => j !== i))}>×</button>
              )}
            </div>
            {calc && calc.taxa > 0 && (
              <div className="mt-0.5 text-[11px] text-slate-500">
                Taxa {pct(calc.percentual)} = {brl(calc.taxa)} · líquido {brl(calc.liquido)}{calc.prazoDias !== null && ` · cai ${calc.prazoDias === 0 ? "na hora" : `em ${calc.prazoDias} dias`}`}
              </div>
            )}
          </div>
        );
      })}
      <div className="flex items-center justify-between text-sm">
        <button type="button" className="text-marca hover:underline"
          onClick={() => atualizar([...linhas, { formaPagamentoId: formas[0]?.id ?? "", valor: "", parcelas: 1 }])}>
          + outra forma
        </button>
        <span className={Math.abs(somaInformada - total) > 0.005 ? "text-red-600" : "text-slate-500"}>
          Pago {brl(somaInformada)} de {brl(total)}
        </span>
      </div>
    </div>
  );
}
