import Link from "next/link";
import { prisma } from "@/lib/db";
import { excluirGrupoAcao } from "@/lib/itens/auxiliares";
import { Pagina } from "@/components/ui/Pagina";
import BarraCadastro, { AcoesLinha } from "@/components/ui/BarraCadastro";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import { FormGrupo } from "@/components/itens/FormsAuxiliares";
import RodapeLista from "@/components/itens/RodapeLista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Grupos de produtos" };

export default async function Grupos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const todos = await prisma.grupoProduto.findMany({ orderBy: { nome: "asc" }, include: { _count: { select: { produtos: true } } } });
  const nomeDe = (g: { nome: string; paiId: string | null }) => (g.paiId ? `${todos.find((x) => x.id === g.paiId)?.nome ?? ""} › ${g.nome}` : g.nome);
  const lista = todos.filter((g) => !sp.q || nomeDe(g).toLowerCase().includes(sp.q.toLowerCase())).sort((a, b) => nomeDe(a).localeCompare(nomeDe(b), "pt-BR"));
  const editando = sp.editar ? todos.find((x) => x.id === sp.editar) : undefined;
  return (
    <Pagina titulo="Grupos de produtos" icone="auxiliares" trilha={[{ rotulo: "Grupos de produtos", href: "/grupos-produtos" }, { rotulo: "Listar" }]}>
      <BarraCadastro base="/grupos-produtos" params={sp} adicionar={{ href: "/grupos-produtos?novo=1" }} placeholder="Buscar" avancada={false} />
      {(sp.novo === "1" || editando) && <FormGrupo key={editando?.id ?? "novo"} g={editando} grupos={todos.filter((g) => !g.paiId).map((g) => ({ id: g.id, nome: g.nome }))} />}
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Nome</th><th className="w-28 text-right">Produtos</th><th className="w-28 text-right">Ações</th></tr></thead>
          <tbody>
            {lista.map((g) => (
              <tr key={g.id}>
                <td><Link href={`/grupos-produtos?editar=${g.id}`} className="hover:underline">{nomeDe(g)}</Link></td>
                <td className="text-right"><Link href={`/produtos?busca=1&grupo=${g.id}`} className="text-marca hover:underline">{g._count.produtos}</Link></td>
                <td><AcoesLinha editar={`/grupos-produtos?editar=${g.id}`} excluir={<BotaoExcluir acao={excluirGrupoAcao.bind(null, g.id)} pergunta={`Excluir o grupo ${g.nome}?`} />} /></td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={3} className="py-8 text-center text-slate-500">Nenhum grupo encontrado.</td></tr>}
          </tbody>
        </table>
        <RodapeLista total={lista.length} />
      </div>
    </Pagina>
  );
}
