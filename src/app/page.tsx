import Link from "next/link";
import { prisma } from "@/lib/db";
import { brl } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function Inicio() {
  const [abertas, falta, reservadoValor] = await Promise.all([
    prisma.ordemServico.aggregate({
      where: { situacao: { in: ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_PECA", "AGUARDANDO_APROVACAO"] } },
      _count: true,
      _sum: { total: true },
    }),
    prisma.reserva.findMany({
      where: { status: "ATIVA", localId: null },
      include: { produto: { select: { id: true, codigo: true, nome: true } } },
      orderBy: { createdAt: "asc" },
      take: 20,
    }),
    prisma.$queryRaw<{ v: number | null }[]>`
      SELECT SUM(r.quantidade * p.custo)::float v FROM "Reserva" r JOIN "Produto" p ON p.id = r."produtoId"
       WHERE r.status = 'ATIVA' AND r."localId" IS NOT NULL`,
  ]);
  const oss = await prisma.ordemServico.findMany({
    where: { id: { in: falta.map((f) => f.origemId) } },
    select: { id: true, numero: true },
  });
  const num = new Map(oss.map((o) => [o.id, o.numero]));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Início</h1>
      <div className="grid gap-3 md:grid-cols-3">
        <Link href="/os" className="cartao p-4 hover:border-marca">
          <div className="text-xs text-slate-500">OS em aberto</div>
          <div className="text-2xl font-semibold">{abertas._count}</div>
          <div className="text-xs text-slate-500">{brl(abertas._sum.total)} a faturar</div>
        </Link>
        <div className="cartao p-4">
          <div className="text-xs text-slate-500">Peças reservadas (custo)</div>
          <div className="text-2xl font-semibold">{brl(reservadoValor[0]?.v ?? 0)}</div>
        </div>
        <div className="cartao p-4">
          <div className="text-xs text-slate-500">Itens em falta nas OS</div>
          <div className={`text-2xl font-semibold ${falta.length ? "text-red-600" : ""}`}>{falta.length}</div>
        </div>
      </div>
      {falta.length > 0 && (
        <section className="cartao">
          <h2 className="border-b px-4 py-3 font-semibold">Comprar / repor (pedido em OS sem estoque)</h2>
          <table className="tabela">
            <tbody>
              {falta.map((f) => (
                <tr key={f.id}>
                  <td><Link href={`/estoque/produto/${f.produto.id}`} className="text-marca hover:underline">{f.produto.codigo} · {f.produto.nome}</Link></td>
                  <td className="text-right">{Number(f.quantidade)}</td>
                  <td><Link href={`/os/${f.origemId}`} className="hover:underline">OS {num.get(f.origemId)}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
