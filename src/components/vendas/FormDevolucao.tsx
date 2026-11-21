"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import Link from "next/link";
import { useState } from "react";
import { devolucaoAcao, type Resultado } from "@/lib/vendas/acoes";
import { Bloco } from "@/components/ui/Pagina";

type Item = { id: string; codigo: string; nome: string; unidade: string; vendido: number; jaDevolvido: number; unit: number };
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;

/** Passo 2: quanto de cada produto volta para a loja. */
export default function FormDevolucao({ vendaId, tipo, itens, desconto, frete }: { vendaId: string; tipo: "DEVOLUCAO" | "TROCA"; itens: Item[]; desconto: number; frete: number }) {
  const [q, setQ] = useState<Record<string, string>>({});
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(devolucaoAcao, null);
  const linhas = itens.map((i) => ({ ...i, dev: Math.min(num(q[i.id] ?? ""), i.vendido - i.jaDevolvido) }));
  const produtos = linhas.reduce((s, l) => s + Math.round(l.dev * l.unit * 100) / 100, 0);
  return (
    <form {...formAcao}>
      <input type="hidden" name="vendaId" value={vendaId} /><input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="itens" value={JSON.stringify(linhas.filter((l) => l.dev > 0).map((l) => ({ vendaItemId: l.id, quantidade: l.dev })))} />
      <Bloco icone="produtos" titulo={<>Informe os <b>produtos devolvidos</b></>} subtitulo="O estoque é ajustado ao finalizar." corpo="p-0">
        <table className="tabela">
          <thead><tr><th>Produto</th><th className="w-28 text-right">Vendido</th><th className="w-28 text-right">Já devolvido</th><th className="w-32 text-right">Devolvido</th><th className="w-32 text-right">Valor unitário</th><th className="w-32 text-right">Total</th></tr></thead>
          <tbody>{linhas.map((l) => (
            <tr key={l.id}>
              <td><span className="font-mono text-[11px] text-slate-500">{l.codigo}</span> {l.nome}</td>
              <td className="text-right">{l.vendido.toLocaleString("pt-BR")} {l.unidade}</td>
              <td className="text-right text-slate-500">{l.jaDevolvido ? l.jaDevolvido.toLocaleString("pt-BR") : "—"}</td>
              <td><input className="campo text-right" inputMode="decimal" disabled={l.vendido - l.jaDevolvido <= 0} value={q[l.id] ?? ""} placeholder="0" onChange={(e) => setQ({ ...q, [l.id]: e.target.value })} /></td>
              <td className="text-right">{brl(l.unit)}</td>
              <td className="text-right font-semibold">{brl(Math.round(l.dev * l.unit * 100) / 100)}</td>
            </tr>
          ))}</tbody>
        </table>
        <p className="px-4 py-2 text-[11px] text-slate-500">O valor unitário já considera os descontos da linha e o desconto geral da venda. O frete não é devolvido.</p>
      </Bloco>
      <Bloco icone="caixa" titulo={<>Confira o <b>total da devolução</b></>}>
        <div className="grid gap-3 text-[13px] sm:grid-cols-4">
          <div><div className="text-slate-500">Produtos devolvidos</div><b className="text-[15px]">{brl(produtos)}</b></div>
          <div><div className="text-slate-500">Desconto da venda</div><b className="text-[15px]">{brl(desconto)}</b></div>
          <div><div className="text-slate-500">Frete da venda</div><b className="text-[15px]">{brl(frete)}</b></div>
          <div><div className="text-slate-500">Total devolvido</div><b className="text-[18px] text-marca">{brl(produtos)}</b></div>
        </div>
        <label className="mt-3 block"><span className="rotulo">Observação</span><input name="observacao" className="campo" placeholder="Motivo da troca ou devolução" /></label>
        <p className="mt-2 text-[12px] text-slate-500">{tipo === "TROCA" ? "A troca gera um vale-compras no valor devolvido, para o cliente usar na próxima compra." : "A devolução gera uma conta a pagar ao cliente, na categoria Devoluções de vendas."}</p>
      </Bloco>
      <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-slate-200 bg-white px-4 py-3 md:-mx-5 md:px-5">
        {r && !r.ok && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-[13px] text-red-700">{r.mensagem}</div>}
        <div className="flex items-center gap-3">
          <span className="text-[13px]">Valor devolvido <b className="text-[16px]">{brl(produtos)}</b></span>
          <Link href="/vendas/devolucoes" className="btn-sec ml-auto">Cancelar</Link>
          <button className="btn px-5" disabled={pendente || produtos <= 0 && !linhas.some((l) => l.dev > 0)}>{pendente ? "Salvando…" : tipo === "TROCA" ? "Trocar" : "Devolver"}</button>
        </div>
      </div>
    </form>
  );
}
