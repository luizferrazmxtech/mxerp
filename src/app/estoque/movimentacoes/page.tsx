import Link from "next/link";
import { prisma } from "@/lib/db";
import { whereProdutos, ordemProdutos, type ParamsLista } from "@/lib/itens/filtros";
import { estoquesDe } from "@/lib/itens/produtos";
import { num2, qtd } from "@/lib/ui/format";
import { Pagina } from "@/components/ui/Pagina";
import Paginacao, { Ordenar, lerPagina } from "@/components/ui/Paginacao";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Movimentações de estoque" };

/** Movimentações (Gestão Click › Estoque): a lista de produtos com o botão ⇄ que abre as entradas e saídas de cada um. */
export default async function Movimentacoes({ searchParams }: { searchParams: Promise<ParamsLista> }) {
  const sp = await searchParams;
  const base = "/estoque/movimentacoes";
  const where = await whereProdutos(sp);
  const { pagina, porPagina, skip, take } = lerPagina(sp);
  const [lista, total] = await Promise.all([
    prisma.produto.findMany({ where, orderBy: [ordemProdutos(sp.o), { id: "asc" }], skip, take, select: { id: true, codigo: true, nome: true, precoVenda: true, unidade: true, controlaEstoque: true } }),
    prisma.produto.count({ where }),
  ]);
  const est = await estoquesDe(lista.map((p) => p.id));
  return (
    <Pagina titulo="Movimentações de estoque" icone="transferir" trilha={[{ rotulo: "Movimentações", href: base }, { rotulo: "Listar" }]}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-slate-600">Escolha o produto para ver as entradas e saídas no período.</span>
        <form action={base} className="ml-auto flex">
          <input name="q" defaultValue={sp.q} placeholder="Buscar por código, nome ou código de barras" className="campo w-72 rounded-r-none" />
          <button className="btn rounded-l-none px-2.5" title="Buscar"><Icone nome="buscar" size={15} /></button>
        </form>
      </div>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr>
            <Ordenar base={base} params={sp} campo="codigo" className="w-36">Código</Ordenar>
            <Ordenar base={base} params={sp} campo="nome">Nome</Ordenar>
            <Ordenar base={base} params={sp} campo="valor" className="w-32 text-right">Valor</Ordenar>
            <th className="w-28 text-right">Estoque</th><th className="w-20 text-right">Ações</th>
          </tr></thead>
          <tbody>
            {lista.map((p) => {
              const e = est.get(p.id)!;
              return (
                <tr key={p.id}>
                  <td className="font-mono text-[12px]">{p.codigo}</td>
                  <td><Link href={`/produtos/${p.id}`} className="hover:underline">{p.nome}</Link></td>
                  <td className="text-right">{num2(p.precoVenda)}</td>
                  <td className={`text-right ${p.controlaEstoque && e.fisico <= 0 ? "text-red-600" : ""}`}>{p.controlaEstoque ? `${qtd(e.fisico)} ${p.unidade}` : "—"}</td>
                  <td className="text-right"><Link href={`/produtos/${p.id}?aba=movimentacoes`} className="btn-icone" title="Movimentações"><Icone nome="transferir" size={13} /></Link></td>
                </tr>
              );
            })}
            {!lista.length && <tr><td colSpan={5} className="py-10 text-center text-slate-500">Nenhum produto encontrado.</td></tr>}
          </tbody>
        </table>
        <Paginacao base={base} params={sp} total={total} pagina={pagina} porPagina={porPagina} />
      </div>
    </Pagina>
  );
}
