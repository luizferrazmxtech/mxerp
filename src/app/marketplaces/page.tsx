import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { exigirArea } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { configMLTela } from "@/lib/marketplaces/mercadolivre";
import { reprocessarPedidoAcao, sincronizarMLAcao } from "@/lib/marketplaces/acoes";
import { etapa, type EtapaPedido } from "@/lib/marketplaces/tipos";
import { cadaPalavra, contem } from "@/lib/busca/palavras";
import { brl, data, dataHora } from "@/lib/ui/format";
import { Pagina, Pilula, RodapeLista } from "@/components/ui/Pagina";
import Resumo, { type Cartao } from "@/components/ui/Resumo";
import BotaoForm from "@/components/marketplaces/BotaoForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pedidos dos marketplaces" };

const ETAPAS_FILTRO: EtapaPedido[] = ["AGUARDANDO_LIBERACAO", "SEM_VINCULO", "ERRO", "LIBERADO", "AGUARDANDO_PAGAMENTO", "CANCELADO", "IGNORADO"];

export default async function PedidosMarketplaces({ searchParams }: { searchParams: Promise<{ etapa?: string; q?: string; pp?: string }> }) {
  await exigirArea("/marketplaces");
  const sp = await searchParams;
  const filtro = ETAPAS_FILTRO.includes(sp.etapa as EtapaPedido) ? (sp.etapa as EtapaPedido) : null;
  const pp = Math.min(1000, Math.max(50, Number(sp.pp) || 100));
  const busca: Prisma.PedidoMarketplaceWhereInput[] = cadaPalavra(sp.q, (p) => [{ externoId: { contains: p } }, { compradorNome: contem(p) }, { compradorApelido: contem(p) }, { erro: contem(p) }]);
  const where: Prisma.PedidoMarketplaceWhereInput = {
    ...(filtro ? (filtro === "ERRO" ? { etapa: { in: ["ERRO", "GERANDO"] } } : { etapa: filtro }) : { etapa: { not: "IGNORADO" } }),
    AND: busca,
  };
  const inicioMes = new Date(); inicioMes.setUTCDate(1); inicioMes.setUTCHours(3, 0, 0, 0);
  const [c, pedidos, total, grupos, liberadosMes] = await Promise.all([
    configMLTela(),
    prisma.pedidoMarketplace.findMany({ where, orderBy: { dataPedido: "desc" }, take: pp }),
    prisma.pedidoMarketplace.count({ where }),
    prisma.pedidoMarketplace.groupBy({ by: ["etapa"], _count: true, _sum: { total: true, liquido: true } }),
    prisma.pedidoMarketplace.aggregate({ where: { etapa: "LIBERADO", liberadoEm: { gte: inicioMes } }, _count: true, _sum: { liquido: true, tarifa: true } }),
  ]);
  const vendas = await prisma.venda.findMany({ where: { id: { in: pedidos.map((p) => p.vendaId).filter((x): x is string => !!x) } }, select: { id: true, numero: true } });
  const numVenda = new Map(vendas.map((v) => [v.id, v.numero]));
  const g = (e: string) => grupos.find((x) => x.etapa === e);
  const qtd = (...es: string[]) => es.reduce((s, e) => s + (g(e)?._count ?? 0), 0);
  const href = (e: EtapaPedido) => `/marketplaces?${new URLSearchParams({ ...(filtro === e ? {} : { etapa: e }), ...(sp.q ? { q: sp.q } : {}) })}`;
  const ativos = qtd("AGUARDANDO_LIBERACAO", "SEM_VINCULO", "ERRO", "GERANDO", "LIBERADO", "AGUARDANDO_PAGAMENTO", "CANCELADO") || 1;
  const cartoes: Cartao[] = [
    { rotulo: "Aguardando liberação", valor: brl(Number(g("AGUARDANDO_LIBERACAO")?._sum.liquido ?? 0)), legenda: `${qtd("AGUARDANDO_LIBERACAO")} pedido(s), valor líquido a receber`, icone: "relogio", cor: "azul", pct: (qtd("AGUARDANDO_LIBERACAO") / ativos) * 100, href: href("AGUARDANDO_LIBERACAO"), ativo: filtro === "AGUARDANDO_LIBERACAO" },
    { rotulo: "Recebidos no mês", valor: brl(Number(liberadosMes._sum.liquido ?? 0)), legenda: `${liberadosMes._count} pedido(s) · tarifas ${brl(Number(liberadosMes._sum.tarifa ?? 0))}`, icone: "confirmado", cor: "verde", href: href("LIBERADO"), ativo: filtro === "LIBERADO" },
    { rotulo: "Falta ligar o produto", valor: String(qtd("SEM_VINCULO")), legenda: "pedido(s) pagos sem venda", icone: "etiqueta", cor: "amarelo", pct: (qtd("SEM_VINCULO") / ativos) * 100, href: href("SEM_VINCULO"), ativo: filtro === "SEM_VINCULO" },
    { rotulo: "Com erro", valor: String(qtd("ERRO", "GERANDO")), legenda: "veja o motivo na lista", icone: "alerta", cor: "vermelho", pct: (qtd("ERRO", "GERANDO") / ativos) * 100, href: href("ERRO"), ativo: filtro === "ERRO" },
    { rotulo: "Cancelados", valor: String(qtd("CANCELADO")), legenda: `${qtd("AGUARDANDO_PAGAMENTO")} aguardando pagamento`, icone: "excluir", cor: "cinza", href: href("CANCELADO"), ativo: filtro === "CANCELADO" },
  ];

  return (
    <Pagina titulo="Pedidos dos marketplaces" icone="lojas" trilha={[{ rotulo: "Vendas", href: "/vendas" }, { rotulo: "Marketplaces" }]}
      acoes={<div className="flex gap-2"><Link href="/marketplaces/anuncios" className="btn-sec h-8 text-[12px]">Anúncios</Link><Link href="/marketplaces/mercado-livre" className="btn-sec h-8 text-[12px]">Mercado Livre</Link></div>}>
      {!c.conectado && (
        <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          O Mercado Livre ainda não está conectado. Configure em <Link href="/marketplaces/mercado-livre" className="underline">Marketplaces › Mercado Livre</Link>.
        </p>
      )}
      <Resumo cartoes={cartoes} />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <form className="flex items-center gap-2">
          {filtro && <input type="hidden" name="etapa" value={filtro} />}
          <input name="q" defaultValue={sp.q} placeholder="Nº do pedido, comprador ou motivo" className="campo h-8 w-72 text-[13px]" />
          <button className="btn-sec h-8 text-[12px]">Buscar</button>
        </form>
        {c.conectado && <span className="ml-auto flex items-center gap-3 text-[12px] text-slate-500">Última busca: {c.ultimaSincEm ? dataHora(c.ultimaSincEm) : "nunca"} <BotaoForm acao={sincronizarMLAcao} rotulo="Sincronizar agora" /></span>}
      </div>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Pedido</th><th>Data</th><th>Comprador</th><th>Itens</th><th className="text-right">Valor</th><th className="text-right">Tarifas</th><th className="text-right">Líquido</th><th>Liberação</th><th>Venda</th><th>Situação</th></tr></thead>
          <tbody>
            {pedidos.map((p) => {
              const itens = ((p.dados as { order_items?: { item: { title: string }; quantity: number }[] }).order_items ?? []);
              const e = etapa(p.etapa);
              const tarifa = p.tarifa != null ? Number(p.tarifa) : p.liquido != null ? Math.max(0, Number(p.total) - Number(p.liquido)) : null;
              return (
                <tr key={p.id}>
                  <td><span className="font-mono text-[13px]">{p.externoId}</span><div className="text-[11px] text-slate-500">Mercado Livre{p.pacoteId ? ` · carrinho ${p.pacoteId}` : ""}</div></td>
                  <td>{data(p.dataPedido)}</td>
                  <td>{p.compradorNome ?? "—"}{p.compradorApelido && <div className="text-[11px] text-slate-500">{p.compradorApelido}</div>}</td>
                  <td className="max-w-72 text-[13px]">{itens.map((i, k) => <div key={k} className="truncate">{i.quantity}× {i.item.title}</div>)}</td>
                  <td className="text-right">{brl(Number(p.total))}</td>
                  <td className="text-right text-red-700">{tarifa != null ? brl(tarifa) : "—"}</td>
                  <td className="text-right font-semibold">{p.liquido != null ? brl(Number(p.liquido)) : "—"}</td>
                  <td>{p.liberadoEm ? <span className="text-emerald-700">{data(p.liberadoEm)}</span> : p.liberacaoPrevista ? <>prevista {data(p.liberacaoPrevista)}</> : "—"}</td>
                  <td>{p.vendaId ? <Link className="text-marca hover:underline" href={`/vendas/${p.vendaId}`}>nº {numVenda.get(p.vendaId) ?? "…"}</Link> : "—"}</td>
                  <td className="min-w-52">
                    <Pilula rotulo={e.rotulo} cor={e.pilula} />
                    {p.erro && <div className="mt-1 text-[11px] text-red-700">{p.erro}</div>}
                    {p.etapa === "SEM_VINCULO" && <div className="mt-1 text-[11px]"><Link className="text-marca underline" href="/marketplaces/anuncios?f=sem">Ligar o produto</Link></div>}
                    {(p.etapa === "ERRO" || p.etapa === "GERANDO") && <div className="mt-1"><BotaoForm acao={reprocessarPedidoAcao} campos={{ id: p.id }} rotulo="Tentar de novo" secundario /></div>}
                  </td>
                </tr>
              );
            })}
            {!pedidos.length && <tr><td colSpan={10} className="py-8 text-center text-slate-500">Nenhum pedido{filtro ? " nesta situação" : ""}.</td></tr>}
          </tbody>
        </table>
        <RodapeLista total={total} mostrando={pedidos.length} mais={`/marketplaces?${new URLSearchParams({ ...(filtro ? { etapa: filtro } : {}), ...(sp.q ? { q: sp.q } : {}), pp: String(pp * 2) })}`} />
      </div>
    </Pagina>
  );
}
