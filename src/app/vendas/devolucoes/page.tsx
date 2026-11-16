import Link from "next/link";
import { prisma } from "@/lib/db";
import { periodoDia } from "@/lib/datas";
import { num2, dataSP } from "@/lib/ui/format";
import { Pagina } from "@/components/ui/Pagina";
import SeletorPeriodo from "@/components/ui/SeletorPeriodo";
import Paginacao, { lerPagina } from "@/components/ui/Paginacao";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trocas e devoluções" };

const MES = (d: Date) => d.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

export default async function Devolucoes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const per = periodoDia(sp.periodo, sp.pde, sp.pate);
  const where = {
    ...(per ? { createdAt: { gte: new Date(per.de.getTime() + 3 * 3600_000), lt: new Date(per.ate.getTime() + 27 * 3600_000) } } : {}),
    ...(sp.q ? { OR: [{ numero: Number(sp.q) || -1 }, { venda: { numero: Number(sp.q) || -1 } }] } : {}),
  };
  const { pagina, porPagina, skip, take } = lerPagina(sp);
  const [lista, total, ultimo] = await Promise.all([
    prisma.devolucao.findMany({ where, orderBy: { numero: "desc" }, skip, take, include: { venda: { select: { id: true, numero: true, cliente: { select: { nome: true } } } }, vale: true } }),
    prisma.devolucao.count({ where }),
    prisma.devolucao.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const mesUltimo = ultimo ? `${ultimo.createdAt.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7)}` : null;
  return (
    <Pagina titulo="Trocas e devoluções" icone="atualizar" trilha={[{ rotulo: "Trocas e devoluções", href: "/vendas/devolucoes" }, { rotulo: "Listar" }]}>
      {sp.ok && <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">Troca/devolução nº {sp.ok} registrada. Os produtos já voltaram ao estoque.</div>}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/vendas/devolucoes/adicionar" className="btn"><Icone nome="mais" size={15} /> Adicionar</Link>
        <Link href="/vendas/vales" className="btn-sec"><Icone nome="etiqueta" size={15} /> Vale-compras</Link>
        <div className="ml-auto flex items-center gap-2">
          <SeletorPeriodo base="/vendas/devolucoes" params={sp} />
          <form action="/vendas/devolucoes" className="flex">
            {sp.periodo && <input type="hidden" name="periodo" value={sp.periodo} />}
            <input name="q" defaultValue={sp.q} placeholder="Nº da troca ou da venda" className="campo w-52 rounded-r-none" />
            <button className="btn rounded-l-none px-2.5" title="Buscar"><Icone nome="buscar" size={15} /></button>
          </form>
        </div>
      </div>
      {!lista.length ? (
        <div className="cartao flex flex-col items-center px-4 py-12 text-center">
          <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-600"><Icone nome="atualizar" size={30} /></span>
          <h2 className="text-[18px] font-semibold">Nenhuma troca ou devolução {per ? `em ${per.rotulo.toLowerCase()}` : ""}</h2>
          {ultimo && <p className="text-[13px] text-slate-500">O último registro é de {MES(ultimo.createdAt)}</p>}
          <div className="mt-4 flex gap-2">
            {mesUltimo && <Link href={`/vendas/devolucoes?periodo=${mesUltimo}`} className="btn-sec">Ver {MES(ultimo!.createdAt)}</Link>}
            <Link href="/vendas/devolucoes/adicionar" className="btn"><Icone nome="mais" size={15} /> Adicionar troca ou devolução</Link>
          </div>
        </div>
      ) : (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead><tr><th className="w-16">Nº</th><th className="w-28">Tipo</th><th className="w-24">Venda</th><th>Cliente</th><th className="w-28">Data</th><th className="w-36">Vale-compras</th><th className="w-32 text-right">Total</th></tr></thead>
            <tbody>{lista.map((d) => (
              <tr key={d.id}><td>{d.numero}</td><td>{d.tipo === "TROCA" ? "Troca" : "Devolução"}</td><td><Link href={`/vendas/${d.venda.id}?aba=devolucoes`} className="text-marca hover:underline">#{d.venda.numero}</Link></td>
                <td>{d.venda.cliente?.nome ?? "Consumidor"}</td><td>{dataSP(d.createdAt)}</td><td>{d.vale?.codigo ?? "—"}</td><td className="text-right">{num2(d.total)}</td></tr>
            ))}</tbody>
          </table>
          <Paginacao base="/vendas/devolucoes" params={sp} total={total} pagina={pagina} porPagina={porPagina} />
        </div>
      )}
    </Pagina>
  );
}
