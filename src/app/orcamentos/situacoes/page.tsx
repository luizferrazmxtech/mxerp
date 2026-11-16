import { prisma } from "@/lib/db";
import { excluirSituacaoAcao } from "@/lib/orcamentos/acoes";
import { cor } from "@/lib/orcamentos/tipos";
import { Pagina } from "@/components/ui/Pagina";
import BarraCadastro, { AcoesLinha } from "@/components/ui/BarraCadastro";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import MoverSituacao from "@/components/orcamentos/MoverSituacao";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Situações de orçamentos" };

export default async function Situacoes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const lista = await prisma.situacaoOrcamento.findMany({ where: sp.q ? { nome: { contains: sp.q, mode: "insensitive" } } : {}, orderBy: [{ ordem: "asc" }, { nome: "asc" }], include: { _count: { select: { orcamentos: true } } } });
  return (
    <Pagina titulo="Situações de orçamentos" icone="lista" trilha={[{ rotulo: "Orçamentos", href: "/orcamentos" }, { rotulo: "Situações" }]}>
      <div className="mb-3 flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] text-sky-800">
        <Icone nome="detalhes" size={15} className="mt-0.5" /> Cada orçamento recebe uma situação, que pode disparar automações como mensagem e assinatura digital. Use as setas para definir a ordem.
      </div>
      <BarraCadastro base="/orcamentos/situacoes" params={sp} adicionar={{ href: "/orcamentos/situacoes/adicionar" }} placeholder="Buscar" avancada={false} />
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th className="w-20"></th><th>Nome</th><th className="w-40">Cor</th><th className="w-28">Listagem</th><th className="w-28">Orçamentos</th><th className="w-28 text-right">Ações</th></tr></thead>
          <tbody>{lista.map((s, i) => {
            const c = cor(s.cor);
            return (
              <tr key={s.id}>
                <td><MoverSituacao id={s.id} primeira={i === 0} ultima={i === lista.length - 1} /></td>
                <td>{s.nome}{s.geraVenda && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] text-emerald-700">Gera venda</span>}</td>
                <td><span className={`pilula ${c.pilula}`}><span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${c.ponto}`} />{c.rotulo}</span></td>
                <td>{s.exibir ? "Exibe" : "Oculta"}</td>
                <td>{s._count.orcamentos}</td>
                <td><AcoesLinha ver={`/orcamentos/situacoes/${s.id}`} editar={`/orcamentos/situacoes/${s.id}`} excluir={<BotaoExcluir acao={excluirSituacaoAcao.bind(null, s.id)} pergunta={`Excluir a situação ${s.nome}?`} />} /></td>
              </tr>
            );
          })}</tbody>
        </table>
        <div className="border-t px-3 py-2.5 text-[12px] text-slate-600"><span className="rounded border px-2 py-1">Registros <span className="mx-1 text-slate-300">|</span> <b>{lista.length}</b> no total</span></div>
      </div>
    </Pagina>
  );
}
