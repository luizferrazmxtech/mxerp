import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AUDITADOS } from "@/lib/auditoria/registro";
import { paramsDe, periodoRelatorio } from "@/lib/relatorios/periodo";
import { dataHora } from "@/lib/ui/format";
import { Pagina } from "@/components/ui/Pagina";
import SeletorPeriodo from "@/components/ui/SeletorPeriodo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registro de auditoria" };

const ACAO: Record<string, string> = { CRIAR: "Adicionar", ALTERAR: "Editar", EXCLUIR: "Excluir", ENTRAR: "Login", FALHA: "Login recusado" };
const COR: Record<string, string> = { CRIAR: "text-emerald-700", ALTERAR: "text-sky-700", EXCLUIR: "text-red-700", FALHA: "text-red-700" };
const modulo = (e: string) => AUDITADOS[e]?.rotulo ?? (e === "Migracao" ? "migração" : e === "Login" ? "acesso" : e);
const mostrar = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)).slice(0, 200);

export default async function Auditoria({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const per = periodoRelatorio(sp);
  const params = paramsDe(sp);
  const where: Prisma.RegistroAuditoriaWhereInput = {
    createdAt: { gte: new Date(per.de.getTime() + 3 * 3600000), lt: new Date(per.ate.getTime() + 27 * 3600000) },
    ...(sp.usuario ? { usuarioId: sp.usuario } : {}),
    ...(sp.entidade ? { entidade: sp.entidade } : {}),
    ...(sp.id ? { entidadeId: sp.id } : {}),
    ...(sp.acao ? { acao: sp.acao } : {}),
    ...(sp.q ? { descricao: { contains: sp.q, mode: "insensitive" } } : {}),
  };
  const [lista, total, usuarios] = await Promise.all([
    prisma.registroAuditoria.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.registroAuditoria.count({ where }),
    prisma.usuario.findMany({ where: { acessoSistema: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
  ]);
  return (
    <Pagina titulo="Registro de auditoria" icone="lista" trilha={[{ rotulo: "Configurações" }, { rotulo: "Registro de auditoria" }]}>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <form className="flex flex-wrap gap-2">
          {Object.entries(params).filter(([k]) => ["periodo", "pde", "pate"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <select name="usuario" defaultValue={sp.usuario ?? ""} className="campo w-44" aria-label="Usuário"><option value="">Todos os usuários</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select>
          <select name="entidade" defaultValue={sp.entidade ?? ""} className="campo w-48" aria-label="Módulo">
            <option value="">Todos os módulos</option>
            {[...Object.keys(AUDITADOS), "Login", "Migracao"].sort((a, b) => modulo(a).localeCompare(modulo(b))).map((e) => <option key={e} value={e}>{modulo(e)}</option>)}
          </select>
          <select name="acao" defaultValue={sp.acao ?? ""} className="campo w-36" aria-label="Ação"><option value="">Todas as ações</option>{Object.entries(ACAO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input name="q" defaultValue={sp.q} placeholder="Buscar na descrição" className="campo w-52" />
          {sp.id && <input type="hidden" name="id" value={sp.id} />}
          <button className="btn-sec">Filtrar</button>
        </form>
        <div className="ml-auto"><SeletorPeriodo base="/auditoria" params={params} /></div>
      </div>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th className="w-36">Data/hora</th><th className="w-40">Usuário</th><th>Descrição</th><th className="w-36">Módulo</th><th className="w-24">Ação</th><th className="w-28">IP</th></tr></thead>
          <tbody>
            {lista.map((r) => {
              const campos = r.campos && typeof r.campos === "object" ? Object.entries(r.campos as Record<string, unknown>).filter(([k]) => k !== "ids" && k !== "dados") : [];
              return (
                <tr key={r.id} className="align-top">
                  <td className="text-[12px]">{dataHora(r.createdAt)}</td>
                  <td>{r.usuarioNome ?? <span className="text-slate-400">sistema</span>}</td>
                  <td>
                    {r.descricao}
                    {campos.length > 0 && (
                      <details className="text-[12px] text-slate-600"><summary className="cursor-pointer text-marca">ver campos ({campos.length})</summary>
                        <table className="mt-1"><tbody>{campos.map(([k, v]) => {
                          const [a, d] = Array.isArray(v) ? v : [undefined, v];
                          return <tr key={k}><td className="pr-2 font-medium">{k}</td><td className="pr-2 text-red-700 line-through">{r.acao === "CRIAR" ? "" : mostrar(a)}</td><td className="text-emerald-700">{r.acao === "EXCLUIR" ? "" : mostrar(d)}</td></tr>;
                        })}</tbody></table>
                      </details>
                    )}
                  </td>
                  <td className="text-[12px]">{modulo(r.entidade)}</td>
                  <td className={`text-[12px] ${COR[r.acao] ?? ""}`}>{ACAO[r.acao] ?? r.acao}</td>
                  <td className="text-[12px] text-slate-500">{r.ip}</td>
                </tr>
              );
            })}
            {!lista.length && <tr><td colSpan={6} className="py-8 text-center text-slate-500">Nenhum registro no período.</td></tr>}
          </tbody>
        </table>
        <div className="border-t px-3 py-2.5 text-[12px] text-slate-600">Registros <span className="mx-1 text-slate-300">|</span> <b>{total}</b> no total{total > lista.length && ` (mostrando os ${lista.length} mais recentes; use os filtros)`}</div>
      </div>
    </Pagina>
  );
}
