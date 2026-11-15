import Link from "next/link";
import { buscarEstoque } from "@/lib/estoque/consultas";
import { brl, qtd } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function EstoquePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const linhas = await buscarEstoque(q);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Estoque</h1>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Código, nome ou código de barras" className="campo w-72" autoFocus />
          <button className="btn">Buscar</button>
        </form>
      </div>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th>Código</th>
              <th>Produto</th>
              <th>Onde está</th>
              <th className="text-right">Físico</th>
              <th className="text-right">Reservado</th>
              <th className="text-right">Disponível</th>
              <th className="text-right">Preço</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <td className="font-mono text-xs">{l.codigo}</td>
                <td>
                  <Link href={`/estoque/produto/${l.id}`} className="text-marca hover:underline">
                    {l.nome}
                  </Link>
                  {l.falta > 0 && (
                    <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                      faltam {qtd(l.falta)}
                    </span>
                  )}
                </td>
                <td className="text-xs text-slate-600">{l.locais ?? "—"}</td>
                <td className="text-right">{qtd(l.fisico)}</td>
                <td className="text-right text-amber-700">{l.reservado ? qtd(l.reservado) : ""}</td>
                <td className={`text-right font-semibold ${l.disponivel <= 0 ? "text-red-600" : "text-emerald-700"}`}>
                  {qtd(l.disponivel)}
                </td>
                <td className="text-right">{brl(l.precoVenda)}</td>
              </tr>
            ))}
            {!linhas.length && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">Nenhum produto encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
