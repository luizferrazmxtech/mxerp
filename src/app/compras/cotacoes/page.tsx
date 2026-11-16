import Link from "next/link";
import { prisma } from "@/lib/db";
import { periodoInstantes } from "@/lib/estoque/periodo";
import { Pagina } from "@/components/ui/Pagina";
import Paginacao, { lerPagina } from "@/components/ui/Paginacao";
import SeletorPeriodo from "@/components/ui/SeletorPeriodo";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import { excluirCotacaoAcao } from "@/lib/compras/acoes";
import Icone from "@/components/Icone";
import { SIT_COTACAO } from "@/lib/compras/tipos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cotações" };


type Sp = { periodo?: string; pde?: string; pate?: string; p?: string; pp?: string };

/** Cotações de compra: pede preço a vários fornecedores, compara e vira compra. */
export default async function Cotacoes({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const base = "/compras/cotacoes";
  const per = periodoInstantes(sp.periodo, sp.pde, sp.pate);
  const where = per.filtro ? { createdAt: per.filtro } : {};
  const { pagina, porPagina, skip, take } = lerPagina(sp);
  const [lista, total, existe] = await Promise.all([
    prisma.cotacao.findMany({ where, orderBy: { numero: "desc" }, skip, take, include: { fornecedores: { select: { respondidoEm: true } }, _count: { select: { itens: true } } } }),
    prisma.cotacao.count({ where }),
    prisma.cotacao.count(),
  ]);
  return (
    <Pagina titulo="Cotações" icone="cotacao" trilha={[{ rotulo: "Cotações", href: base }, { rotulo: "Listar" }]}>
      {!existe ? (
        <div className="cartao px-6 py-10 text-center">
          <Icone nome="cotacao" size={34} />
          <h2 className="mt-2 text-[18px] font-semibold">Cotações de compra</h2>
          <p className="mx-auto max-w-xl text-[13px] text-slate-600">Peça preço a vários fornecedores de uma vez: cada um recebe um link por e-mail, responde os valores e você compara antes de comprar.</p>
          <div className="mx-auto my-6 grid max-w-3xl gap-3 text-left sm:grid-cols-3">
            {[["envios", "Um link por fornecedor", "Cada fornecedor responde os valores numa página própria, sem precisar de login."], ["cotacao", "Compare as respostas", "Veja lado a lado o preço de cada item e o total de cada fornecedor."], ["carrinho", "Vire compra num clique", "A melhor resposta vira uma compra com os itens e valores preenchidos."]].map(([i, t, x]) => (
              <div key={t} className="rounded border border-slate-200 p-4"><Icone nome={i} size={20} /><b className="mt-1 block text-[14px]">{t}</b><span className="text-[12px] text-slate-600">{x}</span></div>
            ))}
          </div>
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
              <thead><tr><th className="w-20">Código</th><th className="w-28">Data</th><th className="w-28">Prazo</th><th className="text-right">Itens</th><th className="text-right">Respostas</th><th className="w-36 text-center">Situação</th><th className="w-28 text-right">Ações</th></tr></thead>
              <tbody>
                {lista.map((c) => {
                  const [r, k] = SIT_COTACAO[c.situacao] ?? SIT_COTACAO.ABERTA;
                  return (
                    <tr key={c.id}>
                      <td>{c.numero}</td><td>{c.data.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td><td>{c.prazo?.toLocaleDateString("pt-BR", { timeZone: "UTC" }) ?? "—"}</td>
                      <td className="text-right">{c._count.itens}</td><td className="text-right">{c.fornecedores.filter((f) => f.respondidoEm).length} de {c.fornecedores.length}</td>
                      <td className="text-center"><span className={`pilula ${k}`}>{r}</span></td>
                      <td><div className="flex justify-end gap-1">
                        <Link href={`${base}/${c.id}`} className="btn-icone" title="Visualizar"><Icone nome="ver" size={13} /></Link>
                        {c.situacao === "ABERTA" && <Link href={`${base}/${c.id}/editar`} className="btn-icone" title="Editar"><Icone nome="editar" size={13} /></Link>}
                        <BotaoExcluir acao={excluirCotacaoAcao.bind(null, c.id)} pergunta={`Excluir a cotação nº ${c.numero}? As respostas dos fornecedores também são apagadas.`} />
                      </div></td>
                    </tr>
                  );
                })}
                {!lista.length && <tr><td colSpan={7} className="py-10 text-center text-slate-500">Nenhuma cotação no período.</td></tr>}
              </tbody>
            </table>
            <Paginacao base={base} params={sp} total={total} pagina={pagina} porPagina={porPagina} />
          </div>
        </>
      )}
    </Pagina>
  );
}
