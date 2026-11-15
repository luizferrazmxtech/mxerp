import Link from "next/link";
import type { Prisma, SituacaoOs } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SITUACOES_OS } from "@/lib/os/os";
import { brl, dataHora } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function ListaOs({ searchParams }: { searchParams: Promise<{ q?: string; s?: string }> }) {
  const { q = "", s = "" } = await searchParams;
  const where: Prisma.OrdemServicoWhereInput = {};
  if (s) where.situacao = s as SituacaoOs;
  if (q) {
    const n = Number(q);
    where.OR = [
      ...(Number.isInteger(n) ? [{ numero: n }] : []),
      { cliente: { nome: { contains: q, mode: "insensitive" } } },
      { equipamento: { contains: q, mode: "insensitive" } },
    ];
  }
  const lista = await prisma.ordemServico.findMany({
    where,
    include: { cliente: { select: { nome: true } }, tecnico: { select: { nome: true } } },
    orderBy: { numero: "desc" },
    take: 100,
  });
  // OS com peça em falta
  const comFalta = new Set(
    (await prisma.reserva.findMany({
      where: { origemTipo: "OS", status: "ATIVA", localId: null, origemId: { in: lista.map((o) => o.id) } },
      select: { origemId: true },
    })).map((r) => r.origemId),
  );
  const sit = new Map(SITUACOES_OS.map((x) => [x.valor, x]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Ordens de serviço</h1>
        <div className="flex flex-wrap gap-2">
          <form className="flex gap-2">
            <input name="q" defaultValue={q} placeholder="Nº, cliente ou equipamento" className="campo w-64" />
            <select name="s" defaultValue={s} className="campo w-48">
              <option value="">Todas as situações</option>
              {SITUACOES_OS.map((x) => <option key={x.valor} value={x.valor}>{x.rotulo}</option>)}
            </select>
            <button className="btn-sec">Filtrar</button>
          </form>
          <Link href="/os/nova" className="btn">+ Nova OS</Link>
        </div>
      </div>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Nº</th><th>Cliente</th><th>Equipamento</th><th>Técnico</th><th>Entrada</th><th>Situação</th><th className="text-right">Valor</th></tr></thead>
          <tbody>
            {lista.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <td><Link href={`/os/${o.id}`} className="font-semibold text-marca hover:underline">{o.numero}</Link></td>
                <td>{o.cliente.nome}</td>
                <td className="text-slate-600">{o.equipamento}</td>
                <td className="text-slate-600">{o.tecnico?.nome}</td>
                <td>{dataHora(o.entrada)}</td>
                <td>
                  <span className={`rounded px-2 py-0.5 text-xs ${sit.get(o.situacao)?.cor}`}>{sit.get(o.situacao)?.rotulo}</span>
                  {comFalta.has(o.id) && <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">peça em falta</span>}
                </td>
                <td className="text-right">{brl(o.total)}</td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={7} className="py-8 text-center text-slate-500">Nenhuma OS.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
