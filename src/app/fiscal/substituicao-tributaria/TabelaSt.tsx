"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormAcao } from "@/components/ui/useFormAcao";
import type { ProdutoSt } from "@/lib/fiscal/st";
import { acaoSt, type Res } from "./actions";

const ROTULO_FONTE = { NOTA: "Nota de compra", NCM: "NCM com ST", CEST: "Tem CEST" } as const;

export default function TabelaSt({ produtos }: { produtos: ProdutoSt[] }) {
  const [filtro, setFiltro] = useState<"PENDENTES" | "NOTA" | "PROVAVEIS" | "AJUSTADOS" | "TODOS">("PENDENTES");
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(produtos.filter((p) => !p.ajustado && p.fonte === "NOTA").map((p) => p.id)));
  const [estado, , enviando, form] = useFormAcao<Res>(acaoSt, null);
  const visiveis = useMemo(() => produtos.filter((p) =>
    filtro === "TODOS" ? true : filtro === "AJUSTADOS" ? p.ajustado : p.ajustado ? false
      : filtro === "NOTA" ? p.fonte === "NOTA" : filtro === "PROVAVEIS" ? p.fonte !== "NOTA" : true), [produtos, filtro]);
  const todosVisiveis = visiveis.length > 0 && visiveis.every((p) => marcados.has(p.id));
  const alterna = (id: string) => setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const alternaTodos = () => setMarcados((m) => { const n = new Set(m); for (const p of visiveis) { if (todosVisiveis) n.delete(p.id); else n.add(p.id); } return n; });
  const regra = (p: ProdutoSt) => [p.cfopInterno || "padrão", p.cfopExterno || "padrão", p.csosn || p.cstIcms || "padrão"].join(" / ");

  return (
    <form {...form}>
      {[...marcados].map((id) => <input key={id} type="hidden" name="produto" value={id} />)}
      {produtos.filter((p) => marcados.has(p.id) && (p.ncmNota || p.cestNota)).map((p) => (
        <span key={p.id}>
          {p.ncmNota && <input type="hidden" name={`ncm_${p.id}`} value={p.ncmNota} />}
          {p.cestNota && <input type="hidden" name={`cest_${p.id}`} value={p.cestNota} />}
        </span>
      ))}
      <input type="hidden" name="completar" value="1" />
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
        {([["PENDENTES", "A ajustar"], ["NOTA", "Vieram com ST na nota"], ["PROVAVEIS", "Prováveis (NCM/CEST)"], ["AJUSTADOS", "Já ajustados"], ["TODOS", "Todos"]] as const).map(([k, r]) => (
          <button key={k} type="button" onClick={() => setFiltro(k)} className={`rounded px-3 py-1 text-[13px] ${filtro === k ? "bg-slate-200 font-semibold" : "hover:bg-slate-100"}`}>{r}</button>
        ))}
        <span className="ml-auto text-[13px] text-slate-600">{marcados.size} marcado(s)</span>
        <button name="acao" value="aplicar" className="btn-verde" disabled={enviando || !marcados.size}>{enviando ? "Gravando…" : "Aplicar ST (5405 / 6404 / CSOSN 500)"}</button>
        <button name="acao" value="remover" className="btn-sec" disabled={enviando || !marcados.size}>Tirar ST</button>
      </div>
      {estado && <p className={`px-3 pt-2 text-sm ${estado.ok ? "text-emerald-700" : "text-red-700"}`}>{estado.mensagem}</p>}
      <table className="tabela">
        <thead>
          <tr>
            <th className="w-8"><input type="checkbox" checked={todosVisiveis} onChange={alternaTodos} aria-label="Marcar todos" /></th>
            <th>Código</th><th>Produto</th><th>NCM</th><th>CEST</th><th>Por que</th><th>Regra atual (dentro / fora / CSOSN)</th>
          </tr>
        </thead>
        <tbody>
          {visiveis.map((p) => (
            <tr key={p.id}>
              <td><input type="checkbox" checked={marcados.has(p.id)} onChange={() => alterna(p.id)} aria-label={`Marcar ${p.nome}`} /></td>
              <td><Link href={`/produtos/${p.id}?aba=fiscal`} className="text-marca hover:underline">{p.codigo}</Link></td>
              <td>{p.nome}{p.conflito && <div className="text-[11px] text-amber-700">Também veio sem ST em outra nota: confira</div>}</td>
              <td>{p.ncm || (p.ncmNota ? <span className="text-slate-500">{p.ncmNota} (da nota)</span> : "—")}</td>
              <td>{p.cest || (p.cestNota ? <span className="text-slate-500">{p.cestNota} (da nota)</span> : "—")}</td>
              <td>
                <span className="text-[13px]">{ROTULO_FONTE[p.fonte]}</span>
                {p.evidencias[0] && (
                  <div className="text-[11px] text-slate-500" title={p.evidencias.map((e) => `NF ${e.nota} ${e.fornecedor} (${e.data}): ${e.motivo}`).join("\n")}>
                    NF {p.evidencias[0].nota} · {p.evidencias[0].fornecedor} · {p.evidencias[0].motivo}{p.evidencias.length > 1 ? ` (+${p.evidencias.length - 1})` : ""}
                  </div>
                )}
              </td>
              <td className={p.ajustado ? "text-emerald-700" : ""}>{regra(p)}</td>
            </tr>
          ))}
          {!visiveis.length && <tr><td colSpan={7} className="py-6 text-center text-slate-500">Nenhum produto nesta lista.</td></tr>}
        </tbody>
      </table>
    </form>
  );
}
