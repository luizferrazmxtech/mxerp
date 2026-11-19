import { prisma } from "@/lib/db";
import { excluirSituacaoVendaAcao, moverSituacaoVendaAcao } from "@/lib/vendas/acoes";
import { cor } from "@/lib/orcamentos/tipos";
import { Pagina } from "@/components/ui/Pagina";
import BarraCadastro, { AcoesLinha } from "@/components/ui/BarraCadastro";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import MoverSituacao from "@/components/orcamentos/MoverSituacao";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Situações de vendas" };

const ESTOQUE: Record<string, string> = { RESERVAR: "Reserva estoque", LANCAR: "Lança estoque", NAO: "Não lança estoque" };

export default async function Situacoes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const lista = await prisma.situacaoVendaConfig.findMany({ where: sp.q ? { nome: { contains: sp.q, mode: "insensitive" } } : {}, orderBy: [{ ordem: "asc" }, { nome: "asc" }], include: { _count: { select: { vendas: true } } } });
  return (
    <Pagina titulo="Situações de vendas" icone="lista" trilha={[{ rotulo: "Vendas", href: "/vendas" }, { rotulo: "Situações" }]}>
      <div className="mb-3 flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] text-sky-800">
        <Icone nome="detalhes" size={15} className="mt-0.5" /> A situação decide o que a venda faz com o estoque (reservar, lançar ou liberar) e se gera contas a receber. Use as setas para definir a ordem.
      </div>
      <BarraCadastro base="/vendas/situacoes" params={sp} adicionar={{ href: "/vendas/situacoes/adicionar" }} placeholder="Buscar" avancada={false} />
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th className="w-20"></th><th>Nome</th><th className="w-36">Cor</th><th className="w-56">Estoque e financeiro</th><th className="w-24">Edição</th><th className="w-24">Listagem</th><th className="w-24">Vendas</th><th className="w-28 text-right">Ações</th></tr></thead>
          <tbody>{lista.map((s, i) => {
            const c = cor(s.cor);
            return (
              <tr key={s.id}>
                <td><MoverSituacao id={s.id} primeira={i === 0} ultima={i === lista.length - 1} acao={moverSituacaoVendaAcao} /></td>
                <td>{s.nome}{s.padrao && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] text-sky-700">Padrão</span>}</td>
                <td><span className={`pilula ${c.pilula}`}>{c.rotulo}</span></td>
                <td>{ESTOQUE[s.estoque]}{s.financeiro && <span className="ml-1 text-slate-500">· gera financeiro</span>}</td>
                <td>{s.permiteEdicao ? "Permite" : "Bloqueia"}</td>
                <td>{s.exibir ? "Exibe" : "Oculta"}</td>
                <td>{s._count.vendas}</td>
                <td><AcoesLinha ver={`/vendas/situacoes/${s.id}`} editar={`/vendas/situacoes/${s.id}`} excluir={<BotaoExcluir acao={excluirSituacaoVendaAcao.bind(null, s.id)} pergunta={`Excluir a situação ${s.nome}?`} />} /></td>
              </tr>
            );
          })}</tbody>
        </table>
        <div className="border-t px-3 py-2.5 text-[12px] text-slate-600"><span className="rounded border px-2 py-1">Registros <span className="mx-1 text-slate-300">|</span> <b>{lista.length}</b> no total</span></div>
      </div>
    </Pagina>
  );
}
