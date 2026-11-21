import Link from "next/link";
import { prisma } from "@/lib/db";
import { todasAsLojas } from "@/lib/empresa/loja";
import { num2 } from "@/lib/ui/format";
import { periodoInstantes } from "@/lib/estoque/periodo";
import { Pagina } from "@/components/ui/Pagina";
import Paginacao, { lerPagina } from "@/components/ui/Paginacao";
import SeletorPeriodo from "@/components/ui/SeletorPeriodo";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transferências de estoque" };

type Sp = { periodo?: string; pde?: string; pate?: string; p?: string; pp?: string };

/** Transferências de estoque entre lojas (depósitos). */
export default async function Transferencias({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const base = "/estoque/transferencias";
  const per = periodoInstantes(sp.periodo, sp.pde, sp.pate);
  const where = per.filtro ? { createdAt: per.filtro } : {};
  const { pagina, porPagina, skip, take } = lerPagina(sp);
  const [lista, total, existe, depositos] = await Promise.all([
    prisma.transferenciaEstoque.findMany({ where, orderBy: { numero: "desc" }, skip, take, include: { _count: { select: { itens: true } } } }),
    prisma.transferenciaEstoque.count({ where }),
    prisma.transferenciaEstoque.count(),
    todasAsLojas(() => prisma.deposito.findMany({ select: { id: true, nome: true } })),
  ]);
  const nome = new Map(depositos.map((d) => [d.id, d.nome]));
  return (
    <Pagina titulo="Transferências" icone="transferir" trilha={[{ rotulo: "Transferências", href: base }, { rotulo: "Listar" }]}>
      {!existe ? (
        <div className="cartao px-6 py-10 text-center">
          <Icone nome="transferir" size={34} />
          <h2 className="mt-2 text-[18px] font-semibold">Transferências de estoque</h2>
          <p className="mx-auto max-w-xl text-[13px] text-slate-600">Mande produtos de uma loja para outra, ou abasteça o carro do técnico, sem gerar venda.</p>
          <ul className="mx-auto my-5 max-w-md space-y-1 text-left text-[13px] text-slate-700">
            <li>✓ O estoque das duas lojas é atualizado na hora</li>
            <li>✓ Fica o histórico de quem transferiu, quando e o quê</li>
            <li>✓ Impressão A4 para acompanhar a mercadoria</li>
          </ul>
          <Link href={`${base}/adicionar`} className="btn"><Icone nome="mais" size={15} /> Adicionar</Link>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Link href={`${base}/adicionar`} className="btn"><Icone nome="mais" size={15} /> Adicionar</Link>
            <div className="ml-auto"><SeletorPeriodo base={base} params={sp} /></div>
          </div>
          <div className="cartao overflow-x-auto">
            <table className="tabela">
              <thead><tr><th className="w-20">Código</th><th>Origem</th><th>Destino</th><th className="w-24 text-right">Itens</th><th className="w-32 text-right">Valor total</th><th className="w-36">Cadastrado em</th><th className="w-24 text-right">Ações</th></tr></thead>
              <tbody>
                {lista.map((t) => (
                  <tr key={t.id}>
                    <td>{t.numero}</td><td className="uppercase">{nome.get(t.origemDepositoId)}</td><td className="uppercase">{nome.get(t.destinoDepositoId)}</td>
                    <td className="text-right">{t._count.itens}</td><td className="text-right">{num2(t.total)}</td>
                    <td className="text-[12px]">{t.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</td>
                    <td><div className="flex justify-end gap-1">
                      <Link href={`${base}/${t.id}`} className="btn-icone" title="Visualizar"><Icone nome="ver" size={13} /></Link>
                      <a href={`${base}/${t.id}/imprimir`} target="_blank" className="btn-icone" title="Imprimir A4"><Icone nome="imprimir" size={13} /></a>
                    </div></td>
                  </tr>
                ))}
                {!lista.length && <tr><td colSpan={7} className="py-10 text-center text-slate-500">Nenhuma transferência no período.</td></tr>}
              </tbody>
            </table>
            <Paginacao base={base} params={sp} total={total} pagina={pagina} porPagina={porPagina} />
          </div>
        </>
      )}
    </Pagina>
  );
}
