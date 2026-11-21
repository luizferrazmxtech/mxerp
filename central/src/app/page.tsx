import Link from "next/link";
import { prisma } from "@/lib/db";
import { ler } from "@/lib/config";
import { diaSP, moeda, dataHoraBR } from "@/lib/datas";
import { situacaoLicenca, ROTULO_LICENCA, type SituacaoLicenca } from "@/lib/regua";
import { valorDoCliente } from "@/lib/faturas";
import { listarBackups } from "@/lib/backups";
import { Pagina, Resumo, Bloco, Pilula, Aviso } from "@/components/ui";
import { TIPOS, type TipoTarefa } from "@/lib/tarefas";

export const dynamic = "force-dynamic";

export default async function Painel() {
  const hoje = diaSP();
  const [todos, regua, tarefas, inter] = await Promise.all([
    prisma.cliente.findMany({ include: { plano: true, faturas: { where: { situacao: "ABERTA" } } }, orderBy: { nome: "asc" } }),
    ler("regua"), prisma.tarefa.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { cliente: { select: { nome: true } } } }), ler("inter"),
  ]);
  const clientes = todos.filter((c) => !c.interno);
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
  const nAtraso = cont.AVISO + cont.SO_LEITURA + cont.BLOQUEADO;
  // último backup de cada sistema (inclusive o da casa): mais de 1 dia sem cópia acende o alerta
  const backups = await Promise.all(todos.filter((c) => c.situacao === "ATIVO").map(async (c) => ({ c, ultimo: (await listarBackups(c.slug))[0] ?? null })));
  const semBackup = backups.filter((b) => !b.ultimo || Date.now() - b.ultimo.quando.getTime() > 36 * 3600000);
  return (
    <Pagina titulo="Painel da revenda" icone="painel" trilha={[{ rotulo: "Painel" }]} sub={`${ativos.length} cliente(s) ativo(s) de ${clientes.length}`}>
      {!inter && <Aviso tipo="alerta">Configure o Banco Inter da Central em <Link className="sublinhado" href="/configuracoes">Configurações</Link> para os boletos saírem sozinhos.</Aviso>}
      <Resumo cartoes={[
        { rotulo: "Receita mensal", valor: moeda(mrr), icone: "dinheiro", cor: "tinta", legenda: `${ativos.length} cliente(s) ativo(s)` },
        { rotulo: "Em dia", valor: cont.EM_DIA, icone: "ok", cor: "verde", pct: ativos.length ? (cont.EM_DIA / ativos.length) * 100 : 0, href: "/clientes" },
        { rotulo: "Com atraso", valor: nAtraso, icone: "atrasado", cor: "vermelho", pct: ativos.length ? (nAtraso / ativos.length) * 100 : 0, href: "/clientes?filtro=atraso" },
        { rotulo: "Vencido em aberto", valor: moeda(emAberto), icone: "hoje", cor: "amarelo", href: "/faturas?filtro=vencidas" },
      ]} />
      <div className="grid gap-3 xl:grid-cols-2">
        <Bloco titulo={<>Clientes com <b>atraso</b></>} icone="atrasado" corpo="">
          {atrasados.length === 0 ? <p className="p-4 text-slate-500">Ninguém em atraso.</p> : (
            <table className="tabela"><thead><tr><th>Cliente</th><th>Atraso</th><th>Situação</th></tr></thead><tbody>
              {atrasados.map(({ c, l }) => <tr key={c.id}><td><Link className="sublinhado" href={`/clientes/${c.id}`}>{c.nome}</Link></td><td>{l.diasAtraso} dia(s)</td><td><Pilula valor={l.situacao} rotulo={ROTULO_LICENCA[l.situacao]} /></td></tr>)}
            </tbody></table>
          )}
        </Bloco>
        <Bloco titulo={<>Situação dos <b>backups</b></>} icone="backup" corpo="">
          {backups.length === 0 ? <p className="p-4 text-slate-500">Nenhum sistema ainda.</p> : (
            <table className="tabela"><thead><tr><th>Sistema</th><th>Última cópia</th></tr></thead><tbody>
              {backups.map(({ c, ultimo }) => (
                <tr key={c.id}>
                  <td><Link className="sublinhado" href={`/clientes/${c.id}?aba=backups`}>{c.nome}</Link></td>
                  <td>{ultimo ? dataHoraBR(ultimo.quando) : "nenhuma"} {semBackup.some((s) => s.c.id === c.id) && <Pilula valor="ERRO" rotulo="atrasado" />}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </Bloco>
      </div>
      <Bloco titulo={<>Últimas <b>tarefas da VPS</b></>} icone="tarefas" corpo="" acoes={<Link className="btn-sec" href="/tarefas">Ver todas</Link>}>
        {tarefas.length === 0 ? <p className="p-4 text-slate-500">Nenhuma ainda.</p> : (
          <table className="tabela"><thead><tr><th>Quando</th><th>Tarefa</th><th>Cliente</th><th>Situação</th></tr></thead><tbody>
            {tarefas.map((t) => <tr key={t.id}><td className="whitespace-nowrap">{dataHoraBR(t.createdAt)}</td><td>{TIPOS[t.tipo as TipoTarefa] ?? t.tipo}</td><td>{t.cliente?.nome ?? "Todos"}</td><td><Pilula valor={t.situacao} /></td></tr>)}
          </tbody></table>
        )}
      </Bloco>
    </Pagina>
  );
}
