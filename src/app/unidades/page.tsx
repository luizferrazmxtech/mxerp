import Link from "next/link";
import { prisma } from "@/lib/db";
import { excluirUnidadeAcao } from "@/lib/itens/auxiliares";
import { Pagina } from "@/components/ui/Pagina";
import BarraCadastro, { AcoesLinha } from "@/components/ui/BarraCadastro";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import { FormUnidade } from "@/components/itens/FormsAuxiliares";
import RodapeLista from "@/components/itens/RodapeLista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unidades de produtos" };

export default async function Unidades({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const cont = sp.q ? { contains: sp.q, mode: "insensitive" as const } : undefined;
  const lista = await prisma.unidade.findMany({ where: cont ? { OR: [{ nome: cont }, { sigla: cont }] } : {}, orderBy: [{ nome: "asc" }] });
  const editando = sp.editar ? lista.find((x) => x.id === sp.editar) : undefined;
  return (
    <Pagina titulo="Unidades de produtos" icone="auxiliares" trilha={[{ rotulo: "Unidades de produtos", href: "/unidades" }, { rotulo: "Listar" }]}>
      <BarraCadastro base="/unidades" params={sp} adicionar={{ href: "/unidades?novo=1" }} placeholder="Buscar" avancada={false} />
      {(sp.novo === "1" || editando) && <FormUnidade key={editando?.id ?? "novo"} u={editando} />}
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Nome</th><th className="w-32">Sigla</th><th className="w-28 text-right">Ações</th></tr></thead>
          <tbody>
            {lista.map((u) => (
              <tr key={u.id}>
                <td><Link href={`/unidades?editar=${u.id}`} className="hover:underline">{u.nome}</Link>{u.padrao && <span className="ml-2 rounded bg-slate-100 px-1.5 text-[10px]">Padrão</span>}</td>
                <td>{u.sigla}</td>
                <td><AcoesLinha editar={`/unidades?editar=${u.id}`} excluir={<BotaoExcluir acao={excluirUnidadeAcao.bind(null, u.id)} pergunta={`Excluir a unidade ${u.sigla}?`} />} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <RodapeLista total={lista.length} />
      </div>
    </Pagina>
  );
}
