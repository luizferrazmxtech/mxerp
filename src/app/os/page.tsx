import Link from "next/link";
import type { Prisma, SituacaoOs } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SITUACOES_OS } from "@/lib/os/os";
import { mesSP } from "@/lib/datas";
import { dataSP, horaSP, num2 } from "@/lib/ui/format";
import { Pagina, Pilula, RodapeLista } from "@/components/ui/Pagina";
import BarraLista, { LinkSuspenso, urlCom } from "@/components/ui/BarraLista";
import Suspenso from "@/components/ui/Suspenso";
import Icone from "@/components/Icone";
import { copiarOs } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ordens de serviços" };

type Params = { m?: string; busca?: string; q?: string; s?: string; t?: string; n?: string; falta?: string };

export default async function ListaOs({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const where: Prisma.OrdemServicoWhereInput = {};
  // com busca por texto, situação ou falta, procura em todos os meses (como a busca avançada do Gestão Click)
  const filtrando = Boolean(sp.q || sp.s || sp.t || sp.falta);
  if (sp.m !== "todos" && !filtrando) {
    const mes = mesSP(sp.m);
    where.entrada = { gte: mes.inicio, lt: mes.fim };
  }
  if (sp.s === "abertas") where.situacao = { in: ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_PECA", "AGUARDANDO_APROVACAO"] };
  else if (sp.s) where.situacao = sp.s as SituacaoOs;
  if (sp.t) where.tecnicoId = sp.t;
  if (sp.q) {
    const n = Number(sp.q);
    where.OR = [
      ...(Number.isInteger(n) ? [{ numero: n }] : []),
      { cliente: { nome: { contains: sp.q, mode: "insensitive" } } },
      { cliente: { fantasia: { contains: sp.q, mode: "insensitive" } } },
      { equipamentos: { some: { OR: [{ equipamento: { contains: sp.q, mode: "insensitive" } }, { serie: { contains: sp.q, mode: "insensitive" } }] } } },
    ];
  }
  if (sp.falta) {
    const ids = await prisma.reserva.findMany({ where: { origemTipo: "OS", status: "ATIVA", localId: null }, select: { origemId: true }, distinct: ["origemId"] });
    where.id = { in: ids.map((r) => r.origemId) };
  }
  const limite = Math.min(Number(sp.n) || 100, 2000);
  const [lista, total, tecnicos] = await Promise.all([
    prisma.ordemServico.findMany({
      where,
      include: { cliente: { select: { id: true, nome: true, fantasia: true } } },
      orderBy: { numero: "desc" },
      take: limite,
    }),
    prisma.ordemServico.count({ where }),
    prisma.usuario.findMany({ where: { tecnico: true, ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  // melhoria sobre o Gestão Click: mostra na lista as OS com peça em falta
  const comFalta = new Set(
    (await prisma.reserva.findMany({
      where: { origemTipo: "OS", status: "ATIVA", localId: null, origemId: { in: lista.map((o) => o.id) } },
      select: { origemId: true },
    })).map((r) => r.origemId),
  );
  const sit = new Map(SITUACOES_OS.map((x) => [x.valor, x]));
  const params = { ...sp } as Record<string, string | undefined>;

  return (
    <Pagina titulo="Ordens de serviços" icone="os" trilha={[{ rotulo: "Ordens de serviços", href: "/os" }, { rotulo: "Listar" }]}>
      <BarraLista
        base="/os"
        params={params}
        adicionar={{ href: "/os/nova" }}
        maisAcoes={<>
          <LinkSuspenso href="/os/painel" icone="painel">Painel de OS</LinkSuspenso>
          <LinkSuspenso href={urlCom("/os", {}, { s: "abertas" })} icone="gerenciar">Todas as OS em aberto</LinkSuspenso>
          <LinkSuspenso href={urlCom("/os", {}, { falta: "1" })} icone="alerta">OS com peça em falta</LinkSuspenso>
        </>}
      />

      {sp.busca === "1" && (
        <form className="cartao no-print mb-3 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5" action="/os">
          <input type="hidden" name="busca" value="1" />
          <label className="lg:col-span-2"><span className="rotulo">Nº, cliente, equipamento ou série</span>
            <input name="q" defaultValue={sp.q} className="campo" autoFocus /></label>
          <label><span className="rotulo">Situação</span>
            <select name="s" defaultValue={sp.s} className="campo">
              <option value="">Todas</option>
              <option value="abertas">Todas em aberto</option>
              {SITUACOES_OS.map((x) => <option key={x.valor} value={x.valor}>{x.rotulo}</option>)}
            </select></label>
          <label><span className="rotulo">Técnico</span>
            <select name="t" defaultValue={sp.t} className="campo">
              <option value="">Todos</option>
              {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select></label>
          <div className="flex items-end gap-2">
            <button className="btn"><Icone nome="buscar" size={15} /> Buscar</button>
            <Link href="/os?busca=1" className="btn-sec">Limpar</Link>
          </div>
        </form>
      )}

      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr>
              <th className="w-16">Nº</th><th>Cliente</th><th className="w-28">Entrada</th><th className="w-28">Saída</th>
              <th className="w-44">Situação</th><th className="w-28 text-right">Valor</th><th className="no-print w-28 text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((o) => {
              const s = sit.get(o.situacao)!;
              return (
                <tr key={o.id}>
                  <td className="text-slate-700">{o.numero}</td>
                  <td>
                    <Link href={`/os/${o.id}`} className="uppercase text-slate-800 underline decoration-slate-400 underline-offset-2 hover:text-marca">{o.cliente.nome}</Link>
                    {o.cliente.fantasia && o.cliente.fantasia !== o.cliente.nome && <div className="text-[12px] uppercase italic text-slate-500">({o.cliente.fantasia})</div>}
                  </td>
                  <td>{dataSP(o.entrada)}<div className="text-[11px] text-slate-400">{horaSP(o.entrada)}</div></td>
                  <td>{o.saida ? <>{dataSP(o.saida)}<div className="text-[11px] text-slate-400">{horaSP(o.saida)}</div></> : <span className="text-slate-400">—</span>}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <Pilula rotulo={s.rotulo} cor={s.cor} />
                      {comFalta.has(o.id) && <Pilula rotulo="Peça em falta" cor="border-red-300 bg-red-50 text-red-700" />}
                    </div>
                  </td>
                  <td className="text-right">{num2(o.total)}</td>
                  <td className="no-print">
                    <div className="flex justify-center gap-1">
                      <Link href={`/os/${o.id}`} className="btn-icone" title="Visualizar"><Icone nome="ver" size={14} /></Link>
                      <Link href={`/os/${o.id}/editar`} className="btn-icone" title="Editar"><Icone nome="editar" size={13} /></Link>
                      <Suspenso direita classe="btn-icone" titulo="Mais opções" botao={<Icone nome="opcoes" size={14} />}>
                        <LinkSuspenso href={`/os/${o.id}?acao=situacao`} icone="atualizar">Alterar situação</LinkSuspenso>
                        <LinkSuspenso href={`/os/${o.id}/separacao`} icone="locais">Lista de separação</LinkSuspenso>
                        <LinkSuspenso href={`/os/${o.id}/imprimir`} icone="imprimir">Imprimir</LinkSuspenso>
                        <form action={copiarOs}>
                          <input type="hidden" name="osId" value={o.id} />
                          <button className="flex w-full items-center gap-2 px-3 py-[7px] text-left hover:bg-slate-100"><Icone nome="copiar" size={15} /> Gerar cópia</button>
                        </form>
                      </Suspenso>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!lista.length && <tr><td colSpan={7} className="py-10 text-center text-slate-500">Nenhuma ordem de serviço {sp.m === "todos" || filtrando ? "encontrada" : "neste mês"}.</td></tr>}
          </tbody>
        </table>
        <RodapeLista total={total} mostrando={lista.length} mais={urlCom("/os", params, { n: String(limite + 200) })} />
      </div>
    </Pagina>
  );
}
