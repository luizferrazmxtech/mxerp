import Link from "next/link";
import { prisma } from "@/lib/db";
import { brl, dataSP } from "@/lib/ui/format";
import { Pagina } from "@/components/ui/Pagina";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vale-compras" };

export default async function Vales({ searchParams }: { searchParams: Promise<{ todos?: string }> }) {
  const sp = await searchParams;
  const lista = await prisma.valeCompra.findMany({ where: sp.todos ? {} : { saldo: { gt: 0 } }, orderBy: { createdAt: "desc" }, include: { devolucao: { select: { numero: true, venda: { select: { id: true, numero: true } } } } } });
  const clientes = new Map((await prisma.pessoa.findMany({ where: { id: { in: lista.map((v) => v.clienteId).filter((x): x is string => !!x) } }, select: { id: true, nome: true } })).map((p) => [p.id, p.nome]));
  return (
    <Pagina titulo="Vale-compras" icone="etiqueta" trilha={[{ rotulo: "Trocas e devoluções", href: "/vendas/devolucoes" }, { rotulo: "Vale-compras" }]}>
      <div className="mb-3 flex items-center gap-2 text-[13px]">
        <Link href="/vendas/vales" className={`aba ${!sp.todos ? "aba-ativa" : ""}`}>Com saldo</Link><Link href="/vendas/vales?todos=1" className={`aba ${sp.todos ? "aba-ativa" : ""}`}>Todos</Link>
        <span className="ml-auto text-slate-500">O vale nasce de uma troca. Abater o vale no pagamento do PDV entra numa próxima etapa.</span>
      </div>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th className="w-28">Código</th><th>Cliente</th><th className="w-36">Origem</th><th className="w-28">Emitido em</th><th className="w-32 text-right">Valor</th><th className="w-32 text-right">Saldo</th></tr></thead>
          <tbody>
            {lista.map((v) => <tr key={v.id}><td className="font-mono">{v.codigo}</td><td>{v.clienteId ? clientes.get(v.clienteId) : "Consumidor"}</td>
              <td>{v.devolucao ? <Link href={`/vendas/${v.devolucao.venda.id}?aba=devolucoes`} className="text-marca hover:underline">Troca nº {v.devolucao.numero}</Link> : "—"}</td>
              <td>{dataSP(v.createdAt)}</td><td className="text-right">{brl(v.valor)}</td><td className="text-right font-semibold">{brl(v.saldo)}</td></tr>)}
            {!lista.length && <tr><td colSpan={6} className="py-10 text-center text-slate-500"><Icone nome="etiqueta" size={22} className="mx-auto mb-1" />Nenhum vale-compras {sp.todos ? "" : "com saldo"}.</td></tr>}
          </tbody>
        </table>
      </div>
    </Pagina>
  );
}
