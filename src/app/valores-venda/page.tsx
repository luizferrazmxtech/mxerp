import Link from "next/link";
import { prisma } from "@/lib/db";
import { excluirTipoValorAcao } from "@/lib/itens/auxiliares";
import { num2 } from "@/lib/ui/format";
import { Pagina } from "@/components/ui/Pagina";
import BarraCadastro, { AcoesLinha } from "@/components/ui/BarraCadastro";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import Icone from "@/components/Icone";
import RodapeLista from "@/components/itens/RodapeLista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Valores de venda" };

export default async function ValoresVenda({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const lista = await prisma.tipoValor.findMany({ where: sp.q ? { nome: { contains: sp.q, mode: "insensitive" } } : {}, orderBy: { nome: "asc" } });
  const medias = await prisma.produtoValor.groupBy({ by: ["tipoValorId"], where: { ativo: true }, _avg: { lucroUtilizado: true }, _count: true });
  return (
    <Pagina titulo="Valores de venda" icone="valor" trilha={[{ rotulo: "Valores de venda", href: "/valores-venda" }, { rotulo: "Listar" }]}>
      <BarraCadastro base="/valores-venda" params={sp} adicionar={{ href: "/valores-venda/adicionar" }} placeholder="Buscar" avancada={false} />
      <div className="mb-3"><Link href="/produtos?acao=valores" className="btn-sec"><Icone nome="valor" size={14} /> Ajustar valores em massa</Link></div>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Nome</th><th className="w-40 text-right">Lucro (%)</th><th className="w-44 text-right">Média de lucro (%)</th><th className="w-28 text-right">Produtos</th><th className="w-28 text-right">Ações</th></tr></thead>
          <tbody>
            {lista.map((t) => {
              const m = medias.find((x) => x.tipoValorId === t.id);
              return (
                <tr key={t.id}>
                  <td><Link href={`/valores-venda/${t.id}`} className="hover:underline">{t.nome}</Link>{t.padrao && <span className="ml-2 rounded bg-slate-100 px-1.5 text-[10px]">Padrão</span>}{t.porRegras && <span className="ml-2 text-[11px] text-slate-500">através de regras</span>}</td>
                  <td className="text-right">{num2(t.lucro)}</td>
                  <td className="text-right">{m?._avg.lucroUtilizado != null ? num2(m._avg.lucroUtilizado) : "—"}</td>
                  <td className="text-right">{m?._count ?? 0}</td>
                  <td><AcoesLinha editar={`/valores-venda/${t.id}`} excluir={<BotaoExcluir acao={excluirTipoValorAcao.bind(null, t.id)} pergunta={`Excluir o valor de venda ${t.nome}? Os valores dos produtos nessa tabela serão apagados.`} />} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <RodapeLista total={lista.length} />
      </div>
    </Pagina>
  );
}
