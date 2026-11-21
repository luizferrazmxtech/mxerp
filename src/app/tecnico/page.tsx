import Link from "next/link";
import { prisma } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth/atual";
import { cor } from "@/lib/orcamentos/tipos";
import { rotuloPrioridade } from "@/lib/os/tipos";
import { ehGerencia, osDoTecnico } from "@/lib/os/tecnico";
import Icone from "@/components/Icone";
import SeletorTecnico from "@/components/tecnico/SeletorTecnico";

export const dynamic = "force-dynamic";
export const metadata = { title: "Minhas OS" };

const URGENTE = new Set(["URGENTE", "MUITO_URGENTE"]);
const dia = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

/** Tela do técnico (celular/tablet): as OS em que ele é técnico ou que são da equipe dele. */
export default async function MinhasOs({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const u = await exigirUsuario();
  const gerencia = ehGerencia(u);
  const [lista, tecnicos] = await Promise.all([
    osDoTecnico(u, { tecnicoId: sp.tec, todas: sp.ver === "todas", q: sp.q }),
    gerencia ? prisma.usuario.findMany({ where: { ativo: true, OR: [{ tecnico: true }, { papel: "TECNICO" }] }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }) : [],
  ]);
  const link = (m: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...m }).filter((x): x is [string, string] => !!x[1]));
    return `/tecnico${p.size ? `?${p}` : ""}`;
  };
  return (
    <div className="mx-auto max-w-3xl px-3 pb-24 pt-3">
      <div className="mb-3 flex items-center gap-2">
        <h1 className="flex items-center gap-2 text-[20px] font-semibold"><Icone nome="os" size={20} /> {gerencia && !sp.tec ? "OS em aberto" : "Minhas OS"}</h1>
        <span className="ml-auto text-[13px] text-slate-500">{lista.length} OS</span>
      </div>

      <form className="mb-3 flex gap-2" action="/tecnico">
        {sp.ver && <input type="hidden" name="ver" value={sp.ver} />}
        {sp.tec && <input type="hidden" name="tec" value={sp.tec} />}
        <input name="q" defaultValue={sp.q} placeholder="Nº da OS, cliente ou equipamento" className="campo h-11 flex-1 text-[15px]" inputMode="search" />
        <button className="btn h-11 px-4" aria-label="Buscar"><Icone nome="buscar" size={18} /></button>
      </form>

      <div className="mb-3 flex flex-wrap gap-2">
        <div className="flex overflow-hidden rounded-md border bg-white text-[14px]">
          <Link href={link({ ver: undefined })} className={`px-4 py-2 ${sp.ver !== "todas" ? "bg-topo text-white" : ""}`}>Em aberto</Link>
          <Link href={link({ ver: "todas" })} className={`px-4 py-2 ${sp.ver === "todas" ? "bg-topo text-white" : ""}`}>Últimos 30 dias</Link>
        </div>
        {gerencia && <SeletorTecnico atual={sp.tec ?? ""} tecnicos={tecnicos} />}
        <Link href={`/tecnico/estoque${gerencia && sp.tec ? `?tec=${sp.tec}` : ""}`} className="ml-auto flex items-center gap-1 rounded-md border bg-white px-3 py-2 text-[14px]"><Icone nome="estoque" size={16} /> {gerencia && sp.tec ? "Estoque do técnico" : "Meu estoque"}</Link>
      </div>

      <ul className="space-y-2">
        {lista.map((o) => {
          const itens = [...o.produtos, ...o.servicos];
          const feitos = itens.filter((i) => i.instalado).length;
          const c = cor(o.situacaoCfg?.cor ?? "cinza");
          const endereco = [o.cliente.logradouro && `${o.cliente.logradouro}${o.cliente.numero ? `, ${o.cliente.numero}` : ""}`, o.cliente.bairro, o.cliente.cidade].filter(Boolean).join(" · ");
          return (
            <li key={o.id}>
              <Link href={`/tecnico/${o.id}`} className={`block rounded-lg border bg-white p-3 shadow-sm active:bg-slate-50 ${o.prioridade && URGENTE.has(o.prioridade) ? "border-l-4 border-l-red-500" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-[16px]">OS {o.numero}</b>
                  <span className={`pilula ${c.pilula}`}>{o.situacaoCfg?.nome ?? o.situacao}</span>
                  {o.prioridade && <span className={`text-[12px] ${URGENTE.has(o.prioridade) ? "font-semibold text-red-600" : "text-slate-500"}`}>{rotuloPrioridade(o.prioridade)}</span>}
                  <span className="ml-auto text-[12px] text-slate-500">{dia(o.entrada)}{o.previsao ? ` → ${dia(o.previsao)}` : ""}</span>
                </div>
                <div className="mt-1 text-[15px] font-medium">{o.cliente.nome}</div>
                {endereco && <div className="text-[13px] text-slate-500">{endereco}</div>}
                {o.equipamentos.length > 0 && <div className="mt-1 text-[13px] text-slate-700">{o.equipamentos.map((e) => [e.equipamento, e.marca, e.modelo].filter(Boolean).join(" ")).join(" · ")}</div>}
                <div className="mt-2 flex items-center gap-2 text-[12px] text-slate-600">
                  {itens.length > 0 ? (
                    <>
                      <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${(feitos / itens.length) * 100}%` }} /></div>
                      <span>{feitos}/{itens.length} instalados</span>
                    </>
                  ) : <span>Sem itens lançados</span>}
                  {o.equipe && <span className="rounded bg-slate-100 px-1.5 py-0.5"><Icone nome="equipe" size={11} className="mr-1 inline" />{o.equipe.nome}</span>}
                </div>
              </Link>
            </li>
          );
        })}
        {!lista.length && (
          <li className="rounded-lg border border-dashed bg-white p-6 text-center text-[14px] text-slate-500">
            {sp.q ? "Nenhuma OS encontrada." : "Nenhuma OS para você agora. As OS em que você for técnico ou da equipe aparecem aqui."}
          </li>
        )}
      </ul>
    </div>
  );
}
