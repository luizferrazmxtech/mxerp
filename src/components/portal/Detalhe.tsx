import { brl, dataHora, qtd } from "@/lib/ui/format";

/** Pares rótulo/valor em grade (2 colunas no celular, 4 no computador). */
export function Dados({ itens }: { itens: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[14px] md:grid-cols-4">
      {itens.filter(([, v]) => v !== null && v !== undefined && v !== "").map(([r, v]) => (
        <div key={r}><dt className="text-[12px] text-slate-500">{r}</dt><dd className="font-medium">{v}</dd></div>
      ))}
    </dl>
  );
}

/** Linha do tempo das situações (do histórico do documento). */
export function LinhaDoTempo({ passos }: { passos: { id: string; situacao: string; quando: Date }[] }) {
  if (!passos.length) return <p className="text-[13px] text-slate-500">Sem movimentações registradas.</p>;
  return (
    <ol className="relative ml-2 space-y-4 border-l-2 border-slate-200 pl-5">
      {passos.map((p, i) => (
        <li key={p.id} className="relative">
          <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${i === passos.length - 1 ? "bg-marca" : "bg-slate-300"}`} />
          <div className={`text-[14px] ${i === passos.length - 1 ? "font-semibold" : ""}`}>{p.situacao}</div>
          <div className="text-[12px] text-slate-500">{dataHora(p.quando)}</div>
        </li>
      ))}
    </ol>
  );
}

type Item = { id: string; nome: string; detalhes: string | null; quantidade: number; valorUnit: number | null; subtotal: number | null };

/** Itens (produtos e serviços): lista no celular, tabela no computador. Sem valores quando a empresa escondeu o total. */
export function Itens({ itens, valores }: { itens: Item[]; valores: boolean }) {
  if (!itens.length) return <p className="px-4 py-6 text-center text-[13px] text-slate-500">Nenhum item.</p>;
  return (
    <>
      <ul className="divide-y divide-slate-100 md:hidden">
        {itens.map((i) => (
          <li key={i.id} className="flex gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{i.nome}</div>
              {i.detalhes && <div className="text-[12px] text-slate-500">{i.detalhes}</div>}
              <div className="text-[12px] text-slate-500">{qtd(i.quantidade)}{valores && i.valorUnit !== null && <> × {brl(i.valorUnit)}</>}</div>
            </div>
            {valores && i.subtotal !== null && <div className="font-semibold">{brl(i.subtotal)}</div>}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="tabela">
          <thead><tr><th>Item</th><th className="w-24 text-right">Qtd.</th>{valores && <><th className="w-32 text-right">Valor unit.</th><th className="w-32 text-right">Subtotal</th></>}</tr></thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.id}>
                <td>{i.nome}{i.detalhes && <div className="text-[12px] text-slate-500">{i.detalhes}</div>}</td>
                <td className="text-right">{qtd(i.quantidade)}</td>
                {valores && <><td className="text-right">{brl(i.valorUnit)}</td><td className="text-right">{brl(i.subtotal)}</td></>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Totais à direita (produtos, serviços, desconto, frete, total). */
export function Totais({ t }: { t: { produtos: number; servicos: number; desconto: number; frete: number; outros?: number; total: number } }) {
  const linhas: [string, number][] = [["Produtos", t.produtos], ["Serviços", t.servicos], ["Frete", t.frete], ["Outros", t.outros ?? 0]];
  return (
    <div className="ml-auto w-full max-w-xs space-y-1 px-4 py-3 text-[14px]">
      {linhas.filter(([, v]) => v).map(([r, v]) => <div key={r} className="flex justify-between"><span className="text-slate-500">{r}</span><span>{brl(v)}</span></div>)}
      {t.desconto > 0 && <div className="flex justify-between text-red-700"><span>Desconto</span><span>− {brl(t.desconto)}</span></div>}
      <div className="flex justify-between border-t border-slate-200 pt-1.5 text-[16px] font-semibold"><span>Total</span><span>{brl(t.total)}</span></div>
    </div>
  );
}
