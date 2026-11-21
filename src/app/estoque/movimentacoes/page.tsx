import Link from "next/link";
import { prisma } from "@/lib/db";
import { whereProdutos, ordemProdutos, type ParamsLista } from "@/lib/itens/filtros";
import { estoquesDe } from "@/lib/itens/produtos";
import { num2, qtd } from "@/lib/ui/format";
import { Pagina } from "@/components/ui/Pagina";
import Paginacao, { Ordenar, lerPagina } from "@/components/ui/Paginacao";
import Icone from "@/components/Icone";
import CelulaEstoque from "@/components/estoque/CelulaEstoque";
import BarraCadastro from "@/components/ui/BarraCadastro";
import { LinkSuspenso } from "@/components/ui/BarraLista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Movimentações de estoque" };

/** Movimentações (Gestão Click › Estoque): a lista de produtos com o botão ⇄ que abre as entradas e saídas de cada um. */
export default async function Movimentacoes({ searchParams }: { searchParams: Promise<ParamsLista> }) {
  const sp = await searchParams;
  const base = "/estoque/movimentacoes";
  const where = await whereProdutos(sp);
  const { pagina, porPagina, skip, take } = lerPagina(sp);
  const [lista, total] = await Promise.all([
    prisma.produto.findMany({ where, orderBy: [ordemProdutos(sp.o), { id: "asc" }], skip, take, select: { id: true, codigo: true, nome: true, precoVenda: true, unidade: true, controlaEstoque: true, estoqueMinimo: true, estoqueMaximo: true } }),
    prisma.produto.count({ where }),
  ]);
  const est = await estoquesDe(lista.map((p) => p.id));
  return (
    <Pagina titulo="Movimentações de estoque" icone="transferir" trilha={[{ rotulo: "Movimentações", href: base }, { rotulo: "Listar" }]}>
      <BarraCadastro base={base} params={sp} avancada={false} placeholder="Código, nome ou código de barras"
        maisAcoes={<>
          <LinkSuspenso href="/estoque" icone="estoque">Consultar estoque</LinkSuspenso>
          <LinkSuspenso href="/estoque/ajustes" icone="ajustes">Ajustes de estoque</LinkSuspenso>
          <LinkSuspenso href="/estoque/transferencias" icone="transferir">Transferências</LinkSuspenso>
        </>} />
      <p className="mb-2 text-[13px] text-slate-500">Escolha o produto e clique em ⇄ para ver as entradas e saídas, com a venda, OS ou compra de cada uma.</p>
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
                  <td>{p.codigo}</td>
                  <td><Link href={`/produtos/${p.id}`} className="hover:underline">{p.nome}</Link></td>
                  <td className="text-right">{num2(p.precoVenda)}</td>
                  <td className="text-right"><CelulaEstoque controla={p.controlaEstoque} fisico={e.fisico} reservado={e.reservado} fisicoCarros={e.fisicoCarros} livreCarros={e.carros} minimo={p.estoqueMinimo} maximo={p.estoqueMaximo} unidade={p.unidade} /></td>
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
