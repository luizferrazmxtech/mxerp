import Link from "next/link";
import type { Prisma, SituacaoVenda } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SITUACOES_VENDA } from "@/lib/vendas/vendas";
import { brl, dataHora } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function ListaVendas({ searchParams }: { searchParams: Promise<{ q?: string; s?: string }> }) {
  const { q = "", s = "" } = await searchParams;
  const where: Prisma.VendaWhereInput = {};
  if (s) where.situacao = s as SituacaoVenda;
  if (q) {
    const n = Number(q);
    where.OR = [...(Number.isInteger(n) ? [{ numero: n }] : []), { cliente: { nome: { contains: q, mode: "insensitive" } } }];
  }
  const lista = await prisma.venda.findMany({ where, include: { cliente: { select: { nome: true } } }, orderBy: { numero: "desc" }, take: 100 });
  const sit = new Map(SITUACOES_VENDA.map((x) => [x.valor, x]));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Vendas</h1>
        <div className="flex flex-wrap gap-2">
          <form className="flex gap-2">
            <input name="q" defaultValue={q} placeholder="Nº ou cliente" className="campo w-56" />
            <select name="s" defaultValue={s} className="campo w-48">
              <option value="">Todas</option>
              {SITUACOES_VENDA.map((x) => <option key={x.valor} value={x.valor}>{x.rotulo}</option>)}
            </select>
            <button className="btn-sec">Filtrar</button>
          </form>
          <Link href="/pdv" className="btn-sec">PDV</Link>
          <Link href="/vendas/nova" className="btn">+ Novo pedido</Link>
        </div>
      </div>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Nº</th><th>Tipo</th><th>Cliente</th><th>Data</th><th>Situação</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {lista.map((v) => (
              <tr key={v.id} className="hover:bg-slate-50">
                <td><Link href={`/vendas/${v.id}`} className="font-semibold text-marca hover:underline">{v.numero}</Link></td>
                <td>{v.tipo === "BALCAO" ? "Balcão" : "Pedido"}</td>
                <td>{v.cliente?.nome ?? <span className="text-slate-400">consumidor</span>}</td>
                <td>{dataHora(v.data)}</td>
                <td><span className={`rounded px-2 py-0.5 text-xs ${sit.get(v.situacao)?.cor}`}>{sit.get(v.situacao)?.rotulo}</span></td>
                <td className="text-right">{brl(v.total)}</td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={6} className="py-8 text-center text-slate-500">Nenhuma venda.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
