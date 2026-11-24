import Link from "next/link";
import { caixasAbertos } from "@/lib/pdv/caixa";
import { dataSP, horaSP } from "@/lib/ui/format";
import Icone from "@/components/Icone";

/**
 * Faixa "Caixa 3 aberto por Fulano desde 23/11 09:40" nas telas do balcão, para ficar claro em qual caixa as vendas
 * entram. Com mais de um aberto (sobra de antes da regra de um caixa por empresa), avisa para fechar os outros.
 */
export default async function AvisoCaixa() {
  const abertos = await caixasAbertos();
  if (!abertos.length) {
    return (
      <div className="no-print mb-3 flex flex-wrap items-center gap-2 rounded border border-slate-300 bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
        <Icone nome="caixa" size={15} /> Nenhum caixa aberto. <Link href="/pdv" className="font-semibold text-marca hover:underline">Abrir caixa</Link>
      </div>
    );
  }
  const varios = abertos.length > 1;
  return (
    <div className={`no-print mb-3 rounded border px-3 py-2 text-[13px] ${varios ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`}>
      {varios && <p className="mb-1 font-semibold">Há {abertos.length} caixas abertos. A empresa trabalha com um caixa só: confira e feche o que sobrou. As vendas novas entram no {abertos[0].numero ? `caixa ${abertos[0].numero}` : "mais antigo"}, a não ser que você tenha aberto um deles.</p>}
      {abertos.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-x-2">
          <Icone nome="caixa" size={15} />
          <b>Caixa {c.numero ?? ""} aberto</b>
          <span>por {c.usuario.nome} desde {dataSP(c.abertoEm)} {horaSP(c.abertoEm)}</span>
          <Link href={`/vendas/caixas/${c.id}`} className="font-semibold underline">ver</Link>
          {varios && <Link href={`/vendas/caixas/${c.id}?acao=fechar`} className="font-semibold underline">fechar</Link>}
        </div>
      ))}
    </div>
  );
}
