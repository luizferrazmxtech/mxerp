import Link from "next/link";
import { prisma } from "@/lib/db";
import { excluirEtiquetaAcao } from "@/lib/itens/auxiliares";
import { paginaDe } from "@/lib/itens/etiquetas";
import { Pagina } from "@/components/ui/Pagina";
import BarraCadastro, { AcoesLinha } from "@/components/ui/BarraCadastro";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import Icone from "@/components/Icone";
import RodapeLista from "@/components/itens/RodapeLista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Etiquetas" };

export default async function Etiquetas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const lista = await prisma.modeloEtiqueta.findMany({ where: sp.q ? { nome: { contains: sp.q, mode: "insensitive" } } : {}, orderBy: { nome: "asc" } });
  return (
    <Pagina titulo="Etiquetas" icone="etiqueta" trilha={[{ rotulo: "Etiquetas", href: "/etiquetas" }, { rotulo: "Listar" }]}>
      <BarraCadastro base="/etiquetas" params={sp} adicionar={{ href: "/etiquetas/adicionar", rotulo: "Adicionar modelo" }} placeholder="Buscar" avancada={false} />
      <div className="mb-3"><Link href="/produtos?acao=etiquetas" className="btn-sec"><Icone nome="imprimir" size={14} /> Gerar etiquetas</Link></div>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Nome</th><th>Tamanho da página</th><th className="w-28 text-right">Ações</th></tr></thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.id}>
                <td><Link href={`/etiquetas/${e.id}`} className="hover:underline">{e.nome}</Link></td>
                <td>{e.padrao} · {paginaDe(e.pagina).rotulo} · {e.colunas * e.linhas} por folha</td>
                <td><AcoesLinha editar={`/etiquetas/${e.id}`} excluir={<BotaoExcluir acao={excluirEtiquetaAcao.bind(null, e.id)} pergunta={`Excluir o modelo ${e.nome}?`} />} /></td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={3} className="py-8 text-center text-slate-500">Nenhum modelo cadastrado.</td></tr>}
          </tbody>
        </table>
        <RodapeLista total={lista.length} />
      </div>
    </Pagina>
  );
}
