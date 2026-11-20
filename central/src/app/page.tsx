import Link from "next/link";
import { prisma } from "@/lib/db";
import { ler } from "@/lib/config";
import { diaSP, moeda, dataHoraBR } from "@/lib/datas";
import { situacaoLicenca, ROTULO_LICENCA, type SituacaoLicenca } from "@/lib/regua";
import { valorDoCliente } from "@/lib/faturas";
import { Pagina, Resumo, Bloco, Pilula } from "@/components/ui";
import { TIPOS, type TipoTarefa } from "@/lib/tarefas";

export const dynamic = "force-dynamic";

export default async function Painel() {
  const hoje = diaSP();
  const [clientes, regua, tarefas, inter] = await Promise.all([
    prisma.cliente.findMany({ include: { plano: true, faturas: { where: { situacao: "ABERTA" } } }, orderBy: { nome: "asc" } }),
    ler("regua"), prisma.tarefa.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { cliente: { select: { nome: true } } } }), ler("inter"),
  ]);
  const ativos = clientes.filter((c) => c.situacao === "ATIVO");
  const mrr = ativos.reduce((s, c) => s + valorDoCliente(c), 0);
  const cont: Record<SituacaoLicenca, number> = { EM_DIA: 0, AVISO: 0, SO_LEITURA: 0, BLOQUEADO: 0 };
  const atrasados = [];
  for (const c of ativos) {
    const l = situacaoLicenca(c, c.faturas.filter((f) => f.vencimento <= hoje), hoje, regua);
    cont[l.situacao]++;
    if (l.situacao !== "EM_DIA") atrasados.push({ c, l });
  }
  const emAberto = ativos.flatMap((c) => c.faturas).filter((f) => f.vencimento <= hoje).reduce((s, f) => s + Number(f.valor), 0);
  return (
    <Pagina titulo="Painel da revenda" sub={`${ativos.length} cliente(s) ativo(s) de ${clientes.length}`}>
      {!inter && <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2">Configure o Banco Inter da Central em <Link className="sublinhado" href="/configuracoes">Configurações</Link> para os boletos saírem sozinhos.</div>}
      <Resumo itens={[
        { rotulo: "Receita mensal", valor: moeda(mrr) },
        { rotulo: "Em dia", valor: cont.EM_DIA, cor: "#1f9d55", href: "/clientes" },
        { rotulo: "Atrasados", valor: cont.AVISO + cont.SO_LEITURA + cont.BLOQUEADO, cor: "#dc2626", href: "/clientes?filtro=atraso" },
        { rotulo: "Vencido em aberto", valor: moeda(emAberto), cor: "#d97706", href: "/faturas?filtro=vencidas" },
      ]} />
      <Bloco titulo="Clientes com atraso">
        {atrasados.length === 0 ? <p className="text-slate-500">Ninguém em atraso.</p> : (
          <table className="tabela"><thead><tr><th>Cliente</th><th>Atraso</th><th>Situação</th></tr></thead><tbody>
            {atrasados.map(({ c, l }) => <tr key={c.id}><td><Link className="sublinhado" href={`/clientes/${c.id}`}>{c.nome}</Link></td><td>{l.diasAtraso} dia(s)</td><td><Pilula valor={l.situacao} rotulo={ROTULO_LICENCA[l.situacao]} /></td></tr>)}
          </tbody></table>
        )}
      </Bloco>
      <Bloco titulo="Últimas tarefas da VPS" acoes={<Link className="btn-sec" href="/tarefas">Ver todas</Link>}>
        {tarefas.length === 0 ? <p className="text-slate-500">Nenhuma ainda.</p> : (
          <table className="tabela"><thead><tr><th>Quando</th><th>Tarefa</th><th>Cliente</th><th>Situação</th></tr></thead><tbody>
            {tarefas.map((t) => <tr key={t.id}><td>{dataHoraBR(t.createdAt)}</td><td>{TIPOS[t.tipo as TipoTarefa] ?? t.tipo}</td><td>{t.cliente?.nome ?? "Todos"}</td><td><Pilula valor={t.situacao} /></td></tr>)}
          </tbody></table>
        )}
      </Bloco>
    </Pagina>
  );
}
