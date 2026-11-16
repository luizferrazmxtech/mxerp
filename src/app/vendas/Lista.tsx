import Link from "next/link";
import type { Prisma, SituacaoVenda, TipoVenda } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SITUACOES_VENDA } from "@/lib/vendas/vendas";
import { mesSP } from "@/lib/datas";
import { dataSP, horaSP, num2 } from "@/lib/ui/format";
import { Pagina, Pilula, RodapeLista } from "@/components/ui/Pagina";
import BarraLista, { LinkSuspenso, urlCom } from "@/components/ui/BarraLista";
import Suspenso from "@/components/ui/Suspenso";
import Icone from "@/components/Icone";

export type ParamsVendas = { m?: string; busca?: string; q?: string; s?: string; n?: string };

/** Lista de vendas no padrão do Gestão Click (Vendas de produtos e Balcão). */
export default async function ListaVendas({ tipo, sp }: { tipo: TipoVenda; sp: ParamsVendas }) {
  const balcao = tipo === "BALCAO";
  const base = balcao ? "/vendas/balcao" : "/vendas";
  const where: Prisma.VendaWhereInput = { tipo };
  const filtrando = Boolean(sp.q || sp.s);
  if (sp.m !== "todos" && !filtrando) {
    const mes = mesSP(sp.m);
    where.data = { gte: mes.inicio, lt: mes.fim };
  }
  if (sp.s) where.situacao = sp.s as SituacaoVenda;
  if (sp.q) {
    const n = Number(sp.q);
    where.OR = [
      ...(Number.isInteger(n) ? [{ numero: n }] : []),
      { cliente: { nome: { contains: sp.q, mode: "insensitive" } } },
      { cliente: { fantasia: { contains: sp.q, mode: "insensitive" } } },
    ];
  }
  const limite = Math.min(Number(sp.n) || 100, 2000);
  const [lista, total, soma] = await Promise.all([
    prisma.venda.findMany({ where, include: { cliente: { select: { nome: true, fantasia: true } }, vendedor: { select: { nome: true } } }, orderBy: { numero: "desc" }, take: limite }),
    prisma.venda.count({ where }),
    prisma.venda.aggregate({ where: { ...where, situacao: { not: "CANCELADA" } }, _sum: { total: true } }),
  ]);
  const notas = await prisma.notaFiscal.findMany({
    where: { origemTipo: "VENDA", origemId: { in: lista.map((v) => v.id) }, status: "AUTORIZADA", modelo: { in: ["NFE", "NFCE"] } },
    select: { origemId: true, numero: true, modelo: true, id: true },
  });
  const notaDe = new Map(notas.map((n) => [n.origemId, n]));
  const sit = new Map(SITUACOES_VENDA.map((x) => [x.valor, x]));
  const params = { ...sp } as Record<string, string | undefined>;

  return (
    <Pagina titulo={balcao ? "Vendas balcão" : "Vendas de produtos"} icone={balcao ? "balcao" : "carrinho"}
      trilha={[{ rotulo: balcao ? "Vendas balcão" : "Vendas de produtos", href: base }, { rotulo: "Listar" }]}>
      <BarraLista
        base={base}
        params={params}
        adicionar={balcao ? undefined : { href: "/vendas/nova" }}
        extra={balcao ? <Link href="/pdv" className="btn"><Icone nome="pdv" size={15} /> Vender</Link> : undefined}
        maisAcoes={<>
          {!balcao && <LinkSuspenso href="/pdv" icone="pdv">Abrir o PDV</LinkSuspenso>}
          <LinkSuspenso href={urlCom(base, {}, { s: "ABERTA" })} icone="gerenciar">Em aberto (reservando estoque)</LinkSuspenso>
          <LinkSuspenso href={urlCom(base, {}, { s: "ORCAMENTO" })} icone="notas">Orçamentos</LinkSuspenso>
        </>}
      />
      {sp.busca === "1" && (
        <form className="cartao no-print mb-3 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4" action={base}>
          <input type="hidden" name="busca" value="1" />
          <label className="lg:col-span-2"><span className="rotulo">Nº ou cliente</span><input name="q" defaultValue={sp.q} className="campo" autoFocus /></label>
          <label><span className="rotulo">Situação</span>
            <select name="s" defaultValue={sp.s} className="campo">
              <option value="">Todas</option>
              {SITUACOES_VENDA.map((x) => <option key={x.valor} value={x.valor}>{x.rotulo}</option>)}
            </select></label>
          <div className="flex items-end gap-2"><button className="btn"><Icone nome="buscar" size={15} /> Buscar</button><Link href={`${base}?busca=1`} className="btn-sec">Limpar</Link></div>
        </form>
      )}
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th className="w-16">Nº</th><th className="w-20 text-center">NF-e</th><th>Cliente</th><th className="w-28">Data</th><th className="w-36">Situação</th><th className="w-28 text-right">Valor</th><th className="no-print w-28 text-center">Ações</th></tr></thead>
          <tbody>
            {lista.map((v) => {
              const s = sit.get(v.situacao)!;
              const nf = notaDe.get(v.id);
              return (
                <tr key={v.id}>
                  <td className="text-slate-700">{v.numero}</td>
                  <td className="text-center">{nf ? <Link href={`/fiscal/${nf.id}`} className="text-marca underline">{nf.numero}</Link> : <span className="text-slate-400">—</span>}</td>
                  <td>
                    <Link href={`/vendas/${v.id}`} className="uppercase text-slate-800 underline decoration-slate-400 underline-offset-2 hover:text-marca">{v.cliente?.nome ?? "Consumidor"}</Link>
                    {v.cliente?.fantasia && v.cliente.fantasia !== v.cliente.nome && <div className="text-[12px] uppercase italic text-slate-500">({v.cliente.fantasia})</div>}
                  </td>
                  <td>{dataSP(v.data)}{balcao && <div className="text-[11px] text-slate-400">{horaSP(v.data)}</div>}</td>
                  <td><Pilula rotulo={s.rotulo} cor={s.cor} /></td>
                  <td className="text-right">{num2(v.total)}</td>
                  <td className="no-print">
                    <div className="flex justify-center gap-1">
                      <Link href={`/vendas/${v.id}`} className="btn-icone" title="Visualizar"><Icone nome="ver" size={14} /></Link>
                      <Link href={`/vendas/${v.id}/editar`} className="btn-icone" title="Editar"><Icone nome="editar" size={13} /></Link>
                      <Suspenso direita classe="btn-icone" titulo="Mais opções" botao={<Icone nome="opcoes" size={14} />}>
                        <LinkSuspenso href={`/vendas/${v.id}?aba=pagamento`} icone="dinheiro">Pagamento</LinkSuspenso>
                        <LinkSuspenso href={`/vendas/${v.id}?aba=notas`} icone="notas">Notas fiscais</LinkSuspenso>
                      </Suspenso>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!lista.length && <tr><td colSpan={7} className="py-10 text-center text-slate-500">Nenhuma venda {sp.m === "todos" || filtrando ? "encontrada" : "neste mês"}.</td></tr>}
          </tbody>
        </table>
        <div className="flex items-center">
          <div className="flex-1"><RodapeLista total={total} mostrando={lista.length} mais={urlCom(base, params, { n: String(limite + 200) })} /></div>
          <div className="border-t border-slate-200 px-3 py-2.5 text-[12px] text-slate-600">Total do período: <b>{num2(soma._sum.total)}</b></div>
        </div>
      </div>
    </Pagina>
  );
}
