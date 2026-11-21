"use client";

import Link from "next/link";
import { useActionState } from "react";
import { itensCarroOsAcao, type Resultado } from "@/lib/os/acoes";

/**
 * Painel "Itens no carro" da OS: para cada peça, de onde ela sai (estoque da loja ou carro de uma equipe).
 * Normalmente usado ao mandar a OS para execução: o que a equipe já leva no carro sai do estoque do carro.
 */
export default function FormItensCarro({ osId, numero, itens, carros, voltar, bloqueio }: {
  osId: string; numero: number; voltar: string; bloqueio?: string;
  itens: { id: string; nome: string; codigo: string; quantidade: string; localOrigemId: string | null; livrePorCarro: Record<string, number> }[];
  carros: { localId: string; nome: string; daOs: boolean }[];
}) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(itensCarroOsAcao, null);
  const q = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
  const opcao = (c: (typeof carros)[number], i: (typeof itens)[number]) => <option key={c.localId} value={c.localId}>{c.nome} ({q(i.livrePorCarro[c.localId] ?? 0)} no carro)</option>;
  return (
    <div className="cartao mb-3 p-4">
      <div className="mb-1 font-semibold">Itens no carro da OS nº {numero}</div>
      <p className="mb-3 text-[13px] text-slate-600">Marque as peças que a equipe já leva no carro: elas saem do estoque do carro e não da loja. Para abastecer o carro, use uma <Link href="/estoque/transferencias/adicionar" className="text-sky-700 underline">transferência</Link> (não gera venda).</p>
      {bloqueio && <div className="mb-3 rounded bg-amber-50 px-3 py-2 text-[13px] text-amber-900">{bloqueio}</div>}
      {!carros.length ? (
        <div className="rounded bg-slate-50 px-3 py-2 text-[13px] text-slate-600">Nenhuma equipe tem carro com estoque. Crie em <Link href="/estoque/locais" className="text-sky-700 underline">Estoque › Locais</Link>.</div>
      ) : (
        <form action={acao}>
          <input type="hidden" name="osId" value={osId} />
          <table className="tabela">
            <thead><tr><th>Produto</th><th className="w-28 text-right">Quantidade</th><th className="w-72">Sai de</th></tr></thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.id}>
                  <td><span className="font-mono text-[11px] text-slate-500">{i.codigo}</span> {i.nome}</td>
                  <td className="text-right">{i.quantidade}</td>
                  <td>
                    <select name={`origem_${i.id}`} defaultValue={i.localOrigemId ?? ""} className="campo" disabled={!!bloqueio}>
                      <option value="">Estoque da loja</option>
                      {carros.filter((c) => c.daOs || c.localId === i.localOrigemId).map((c) => opcao(c, i))}
                      {carros.some((c) => !c.daOs && c.localId !== i.localOrigemId) && (
                        <optgroup label="Outras equipes">{carros.filter((c) => !c.daOs && c.localId !== i.localOrigemId).map((c) => opcao(c, i))}</optgroup>
                      )}
                    </select>
                  </td>
                </tr>
              ))}
              {!itens.length && <tr><td colSpan={3} className="py-6 text-center text-slate-500">A OS não tem produtos.</td></tr>}
            </tbody>
          </table>
          <div className="mt-3 flex justify-end gap-2">
            <Link href={voltar} className="btn-sec">Fechar</Link>
            {!bloqueio && itens.length > 0 && <button className="btn" disabled={pendente}>{pendente ? "Salvando…" : "Salvar"}</button>}
          </div>
        </form>
      )}
      {r && <div className={`mt-3 rounded px-3 py-2 text-[13px] ${r.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{r.mensagem}</div>}
    </div>
  );
}
