import { prisma } from "@/lib/db";
import { dataHoraBR } from "@/lib/datas";
import { TIPOS, type TipoTarefa } from "@/lib/tarefas";
import { naVps } from "@/lib/clienteZero";
import { Pagina, Pilula, Aviso, Lista } from "@/components/ui";
import Icone from "@/components/Icone";
import { atualizarTodos } from "../acoes";

export const dynamic = "force-dynamic";

export default async function Tarefas({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const sp = await searchParams;
  const tarefas = await prisma.tarefa.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { cliente: { select: { nome: true } } } });
  return (
    <Pagina titulo="Tarefas da VPS" icone="tarefas" trilha={[{ rotulo: "Tarefas da VPS" }]} sub="O que a Central pediu ao servidor e o resultado"
      acoes={<form action={atualizarTodos}><button className="btn" title="Use depois de testar a versão nova no PC"><Icone nome="atualizar" size={15} /> Atualizar todos para a versão nova</button></form>}>
      {sp.ok && <Aviso>{sp.ok}</Aviso>}
      {!naVps() && <Aviso tipo="info">Esta Central está rodando fora da VPS (no PC, para testes). Os pedidos ficam pendentes: só a VPS executa.</Aviso>}
      <Lista total={tarefas.length}>
        <table className="tabela"><thead><tr><th>Pedido</th><th>Tarefa</th><th>Cliente</th><th>Situação</th><th>Resultado</th></tr></thead><tbody>
          {tarefas.length === 0 && <tr><td colSpan={5} className="text-slate-500">Nenhuma tarefa.</td></tr>}
          {tarefas.map((t) => (
            <tr key={t.id}>
              <td className="whitespace-nowrap">{dataHoraBR(t.createdAt)}<div className="text-[12px] text-slate-500">{t.pedidoPor}</div></td>
              <td>{TIPOS[t.tipo as TipoTarefa] ?? t.tipo}</td>
              <td>{t.cliente?.nome ?? "Todos"}</td>
              <td><Pilula valor={t.situacao} />{t.fimEm && <div className="text-[12px] text-slate-500">{dataHoraBR(t.fimEm)}</div>}</td>
              <td><pre className="max-h-40 max-w-xl overflow-auto whitespace-pre-wrap text-[12px]">{t.saida?.slice(-2000)}</pre></td>
            </tr>
          ))}
        </tbody></table>
      </Lista>
    </Pagina>
  );
}
