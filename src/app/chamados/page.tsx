import Link from "next/link";
import { prisma } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth/atual";
import { ABERTOS, COR_STATUS, filtroChamados, horasTexto, resumoChamados, ROTULO_PRIORIDADE, ROTULO_STATUS } from "@/lib/chamados/chamados";
import { dataSP, horaSP } from "@/lib/ui/format";
import { Pagina, Pilula } from "@/components/ui/Pagina";
import Resumo from "@/components/ui/Resumo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Atendimentos e chamados" };

const COR_PRIORIDADE = { BAIXA: "text-slate-500", NORMAL: "text-slate-700", ALTA: "text-amber-700 font-semibold", URGENTE: "text-red-700 font-semibold" } as const;

export default async function Chamados({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const sp = await searchParams;
  const f = { status: sp.status, responsavelId: sp.resp, q: sp.q, prioridade: sp.prioridade };
  const [lista, r, usuarios] = await Promise.all([
    prisma.chamado.findMany({
      where: filtroChamados(f, u.id), include: { cliente: { select: { nome: true } }, responsavel: { select: { nome: true } }, os: { select: { numero: true } } },
      orderBy: [{ prazo: "asc" }, { numero: "desc" }], take: 300,
    }),
    resumoChamados(u.id),
    prisma.usuario.findMany({ where: { ativo: true, acessoSistema: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  const agora = new Date();
  const link = (p: Record<string, string | undefined>) => `/chamados?${new URLSearchParams(Object.entries({ ...sp, ...p }).filter(([, v]) => v) as [string, string][])}`;
  return (
    <Pagina titulo="Atendimentos e chamados" icone="atendimento" trilha={[{ rotulo: "Atendimentos" }]}
      acoes={<Link href="/chamados/novo" className="btn">Novo chamado</Link>}>
      <div className="space-y-4">
      <Resumo cartoes={[
        { rotulo: "Em aberto", valor: String(r.abertos), legenda: `${r.urgentes} urgente(s)`, icone: "atendimento", cor: "tinta", pct: r.abertos ? 100 : 0, href: "/chamados", ativo: !sp.status && !sp.resp },
        { rotulo: "Atrasados", valor: String(r.atrasados), legenda: "prazo já passou", icone: "atrasado", cor: "vermelho", pct: r.abertos ? (r.atrasados / r.abertos) * 100 : 0, href: "/chamados?status=atrasados", ativo: sp.status === "atrasados" },
        { rotulo: "Sem responsável", valor: String(r.semResponsavel), legenda: "ninguém assumiu", icone: "alerta", cor: "amarelo", pct: r.abertos ? (r.semResponsavel / r.abertos) * 100 : 0, href: "/chamados?resp=sem", ativo: sp.resp === "sem" },
        { rotulo: "Comigo", valor: String(r.meus), legenda: "abertos com você", icone: "pessoa", cor: "azul", pct: r.abertos ? (r.meus / r.abertos) * 100 : 0, href: "/chamados?resp=meus", ativo: sp.resp === "meus" },
        { rotulo: "Resolvidos em 30 dias", valor: String(r.resolvidos30), legenda: `1ª resposta ${horasTexto(r.horasPrimeiraResposta)} · solução ${horasTexto(r.horasResolucao)}`, icone: "confirmado", cor: "verde", ...(r.noPrazo != null ? { pct: r.noPrazo * 100 } : {}) },
      ]} />

      <form className="cartao flex flex-wrap items-end gap-3 p-3">
        <label><span className="rotulo">Situação</span>
          <select name="status" defaultValue={sp.status ?? "abertos"} className="campo w-44">
            <option value="abertos">Em aberto</option><option value="atrasados">Atrasados</option>
            {Object.entries(ROTULO_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            <option value="todos">Todos</option>
          </select></label>
        <label><span className="rotulo">Responsável</span>
          <select name="resp" defaultValue={sp.resp ?? ""} className="campo w-44">
            <option value="">Todos</option><option value="meus">Comigo</option><option value="sem">Sem responsável</option>
            {usuarios.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select></label>
        <label><span className="rotulo">Prioridade</span>
          <select name="prioridade" defaultValue={sp.prioridade ?? ""} className="campo w-32">
            <option value="">Todas</option>{Object.entries(ROTULO_PRIORIDADE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label className="min-w-48 flex-1"><span className="rotulo">Buscar</span><input name="q" defaultValue={sp.q} className="campo" placeholder="nº, assunto, cliente, contato" /></label>
        <button className="btn-sec">Filtrar</button>
      </form>

      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th className="w-16">Nº</th><th>Assunto</th><th>Cliente</th><th>Prioridade</th><th>Situação</th><th>Responsável</th><th>Prazo</th><th>Aberto em</th></tr></thead>
          <tbody>
            {lista.map((c) => {
              const atrasado = ABERTOS.includes(c.status) && c.prazo && c.prazo < agora;
              return (
                <tr key={c.id}>
                  <td><Link href={`/chamados/${c.id}`} className="text-marca-escura hover:underline">{c.numero}</Link></td>
                  <td><Link href={`/chamados/${c.id}`} className="hover:underline">{c.assunto}</Link>{c.os && <span className="ml-1 text-[11px] text-slate-500">OS {c.os.numero}</span>}</td>
                  <td className="text-slate-600">{c.cliente?.nome ?? c.contato}</td>
                  <td className={COR_PRIORIDADE[c.prioridade]}>{ROTULO_PRIORIDADE[c.prioridade]}</td>
                  <td><Pilula rotulo={ROTULO_STATUS[c.status]} cor={COR_STATUS[c.status]} /></td>
                  <td>{c.responsavel?.nome ?? <Link href={link({ resp: "sem" })} className="text-slate-400">ninguém</Link>}</td>
                  <td className={atrasado ? "font-semibold text-red-600" : ""}>{c.prazo ? `${dataSP(c.prazo)} ${horaSP(c.prazo)}` : "—"}</td>
                  <td className="text-slate-500">{dataSP(c.createdAt)} {horaSP(c.createdAt)}</td>
                </tr>
              );
            })}
            {!lista.length && <tr><td colSpan={8} className="py-8 text-center text-slate-500">Nenhum chamado com esses filtros.</td></tr>}
          </tbody>
        </table>
      </div>
      </div>
    </Pagina>
  );
}
