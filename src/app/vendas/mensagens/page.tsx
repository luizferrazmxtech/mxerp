import { prisma } from "@/lib/db";
import { excluirMensagemVendaAcao } from "@/lib/vendas/acoes";
import { Pagina } from "@/components/ui/Pagina";
import BarraCadastro, { AcoesLinha } from "@/components/ui/BarraCadastro";
import BotaoExcluir from "@/components/ui/BotaoExcluir";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mensagens de vendas" };

export default async function Mensagens({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const lista = await prisma.modeloMensagem.findMany({ where: { tipo: "VE", ...(sp.q ? { assunto: { contains: sp.q, mode: "insensitive" } } : {}) }, orderBy: [{ padrao: "desc" }, { assunto: "asc" }] });
  return (
    <Pagina titulo="Mensagens" icone="email" trilha={[{ rotulo: "Vendas", href: "/vendas" }, { rotulo: "Mensagens" }]}>
      <BarraCadastro base="/vendas/mensagens" params={sp} adicionar={{ href: "/vendas/mensagens/adicionar" }} placeholder="Buscar pelo assunto" avancada={false} />
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Assunto</th><th className="w-60">Modelo</th><th className="w-28 text-right">Ações</th></tr></thead>
          <tbody>{lista.map((m) => (
            <tr key={m.id}><td>{m.assunto}{m.padrao && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] text-sky-700">Padrão</span>}</td><td>Venda</td>
              <td><AcoesLinha ver={`/vendas/mensagens/${m.id}`} editar={`/vendas/mensagens/${m.id}`} excluir={<BotaoExcluir acao={excluirMensagemVendaAcao.bind(null, m.id)} pergunta={`Excluir a mensagem ${m.assunto}?`} />} /></td></tr>
          ))}</tbody>
        </table>
        <div className="border-t px-3 py-2.5 text-[12px] text-slate-600"><span className="rounded border px-2 py-1">Registros <span className="mx-1 text-slate-300">|</span> <b>{lista.length}</b> no total</span></div>
      </div>
    </Pagina>
  );
}
