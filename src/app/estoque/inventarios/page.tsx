import Link from "next/link";
import { prisma } from "@/lib/db";
import { Pagina } from "@/components/ui/Pagina";
import Paginacao, { lerPagina } from "@/components/ui/Paginacao";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventários" };

const SIT: Record<string, [string, string]> = {
  CONTANDO: ["Em contagem", "border-orange-300 bg-orange-50 text-orange-700"],
  CONCLUIDO: ["Concluído", "border-emerald-300 bg-emerald-50 text-emerald-700"],
  CANCELADO: ["Cancelado", "border-slate-300 bg-slate-50 text-slate-600"],
};

/** Inventários de estoque: contagem por leitor, contagem cega e ajuste automático ao concluir. */
export default async function Inventarios({ searchParams }: { searchParams: Promise<{ p?: string; pp?: string }> }) {
  const sp = await searchParams;
  const base = "/estoque/inventarios";
  const { pagina, porPagina, skip, take } = lerPagina(sp);
  const [lista, total] = await Promise.all([
    prisma.inventario.findMany({ orderBy: { numero: "desc" }, skip, take, include: { _count: { select: { itens: true } } } }),
    prisma.inventario.count(),
  ]);
  const contados = lista.length ? await prisma.inventarioItem.groupBy({ by: ["inventarioId"], where: { inventarioId: { in: lista.map((i) => i.id) }, contado: { not: null } }, _count: true }) : [];
  const nContados = new Map(contados.map((c) => [c.inventarioId, c._count]));
  const botoes = (
    <div className="flex gap-2">
      <Link href={`${base}/adicionar`} className="btn"><Icone nome="mais" size={15} /> Adicionar</Link>
      <Link href="/estoque/ajustes" className="btn-sec"><Icone nome="estoque" size={15} /> Ajustes de estoque</Link>
    </div>
  );
  return (
    <Pagina titulo="Inventários" icone="lista" trilha={[{ rotulo: "Ajustes de estoque", href: "/estoque/ajustes" }, { rotulo: "Inventários" }]}>
      {!total ? (
        <div className="cartao px-6 py-10 text-center">
          <Icone nome="lista" size={34} />
          <h2 className="mt-2 text-[18px] font-semibold">Inventário de estoque</h2>
          <p className="mx-auto max-w-xl text-[13px] text-slate-600">Conte o estoque da loja e acerte o saldo dos produtos de uma vez, sem parar as vendas.</p>
          <div className="mx-auto my-6 grid max-w-3xl gap-3 text-left sm:grid-cols-3">
            {[["leitor", "Contagem por leitor", "Leia o código de barras de cada produto ou digite a quantidade contada."], ["ver", "Contagem cega", "Quem conta não vê o saldo do sistema, para a contagem não ser influenciada."], ["atualizar", "Ajuste automático", "Ao concluir, o estoque é ajustado e o histórico fica guardado nos ajustes."]].map(([i, t, x]) => (
              <div key={t} className="rounded border border-slate-200 p-4"><Icone nome={i} size={20} /><b className="mt-1 block text-[14px]">{t}</b><span className="text-[12px] text-slate-600">{x}</span></div>
            ))}
          </div>
          <div className="flex justify-center">{botoes}</div>
        </div>
      ) : (
        <>
          <div className="mb-3">{botoes}</div>
          <div className="cartao overflow-x-auto">
            <table className="tabela">
              <thead><tr><th className="w-20">Código</th><th>Descrição</th><th className="w-28">Data</th><th>Responsável</th><th className="w-32 text-right">Contados</th><th className="w-36 text-center">Situação</th><th className="w-20 text-right">Ações</th></tr></thead>
              <tbody>{lista.map((i) => {
                const [r, c] = SIT[i.situacao] ?? SIT.CONTANDO;
                return (
                  <tr key={i.id}>
                    <td>{i.numero}</td><td><Link href={`${base}/${i.id}`} className="hover:underline">{i.descricao}</Link>{i.motivo && <div className="text-[11px] text-slate-500">{i.motivo}</div>}</td>
                    <td>{i.data.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td><td className="uppercase">{i.responsavelNome}</td>
                    <td className="text-right">{nContados.get(i.id) ?? 0} de {i._count.itens}</td>
                    <td className="text-center"><span className={`pilula ${c}`}>{r}</span></td>
                    <td className="text-right"><Link href={`${base}/${i.id}`} className="btn-icone" title="Abrir"><Icone nome="ver" size={13} /></Link></td>
                  </tr>
                );
              })}</tbody>
            </table>
            <Paginacao base={base} params={sp} total={total} pagina={pagina} porPagina={porPagina} />
          </div>
        </>
      )}
    </Pagina>
  );
}
