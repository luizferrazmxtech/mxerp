import Link from "next/link";
import { prisma } from "@/lib/db";
import { excluirGradeAcao } from "@/lib/itens/auxiliares";
import { Pagina } from "@/components/ui/Pagina";
import BarraCadastro, { AcoesLinha } from "@/components/ui/BarraCadastro";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import RodapeLista from "@/components/itens/RodapeLista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Grades/variações" };

export default async function Grades({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const lista = await prisma.grade.findMany({ where: sp.q ? { nome: { contains: sp.q, mode: "insensitive" } } : {}, orderBy: { nome: "asc" } });
  return (
    <Pagina titulo="Grades/variações" icone="auxiliares" trilha={[{ rotulo: "Grades", href: "/grades" }, { rotulo: "Listar" }]}>
      <BarraCadastro base="/grades" params={sp} adicionar={{ href: "/grades/adicionar" }} placeholder="Buscar" avancada={false} />
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Nome</th><th>Variações</th><th className="w-28 text-right">Ações</th></tr></thead>
          <tbody>
            {lista.map((g) => (
              <tr key={g.id}>
                <td><Link href={`/grades/${g.id}`} className="hover:underline">{g.nome}</Link></td>
                <td className="text-[12px] text-slate-600">{g.variacoes.join(", ")}</td>
                <td><AcoesLinha editar={`/grades/${g.id}`} excluir={<BotaoExcluir acao={excluirGradeAcao.bind(null, g.id)} pergunta={`Excluir a grade ${g.nome}?`} />} /></td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={3} className="py-8 text-center text-slate-500">Nenhuma grade cadastrada.</td></tr>}
          </tbody>
        </table>
        <RodapeLista total={lista.length} />
      </div>
    </Pagina>
  );
}
