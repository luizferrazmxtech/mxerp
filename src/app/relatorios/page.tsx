import Link from "next/link";
import { Pagina } from "@/components/ui/Pagina";
import Icone from "@/components/Icone";
import Suspenso from "@/components/ui/Suspenso";
import SeletorPeriodo from "@/components/ui/SeletorPeriodo";
import { urlCom } from "@/components/ui/BarraLista";
import { GraficoColunas } from "@/components/inicio/Graficos";
import { brl, pct } from "@/components/relatorios/Barra";
import { paramsDe, periodoRelatorio } from "@/lib/relatorios/periodo";
import { painelRelatorios, variacao } from "@/lib/relatorios/painel";
import { data } from "@/lib/ui/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Relatórios" };

const RELATORIOS = [
  { href: "/relatorios/lucro", icone: "dinheiro", titulo: "Lucro das vendas e OS", texto: "Receita, custo das peças, lucro e margem por documento, cliente, vendedor, produto ou serviço." },
  { href: "/relatorios/curva-abc", icone: "grafico", titulo: "Curva ABC", texto: "Produtos, serviços ou clientes que fazem 80% (A), 15% (B) e 5% (C) do faturamento, da quantidade ou do lucro." },
  { href: "/relatorios/comissoes", icone: "percentual", titulo: "Comissões", texto: "Comissão de vendedores e técnicos pelo % do cadastro, com o valor já liberado conforme o recebimento." },
  { href: "/relatorios/tempo-os", icone: "relogio", titulo: "Situação × tempo das OS", texto: "Quanto tempo as OS ficam em cada situação, tempo total por técnico e OS entregues fora da previsão." },
  { href: "/financeiro/dre", icone: "dre", titulo: "DRE gerencial", texto: "Resultado mês a mês por competência ou caixa, com filtro por centro de custo." },
  { href: "/financeiro/fluxo", icone: "financeiro", titulo: "Fluxo de caixa", texto: "Saldo, entradas e saídas realizadas e previstas por dia e por mês." },
  { href: "/estoque/custos", icone: "estoque", titulo: "Custos e margens", texto: "Custo, preço e margem de cada produto em estoque." },
];

const COR = { faturamento: "#018e83", lucro: "#2f6fd6", anoAnterior: "#94a3b8" };

/** "▲ 12% sobre o período anterior" com seta + texto (nunca só cor). */
function Variacao({ v, rotulo, inverter = false, pontos = false }: { v: number | null; rotulo: string; inverter?: boolean; pontos?: boolean }) {
  if (v === null) return <span className="text-slate-500">sem base em {rotulo}</span>;
  const bom = inverter ? v < 0 : v > 0;
  const cor = Math.abs(v) < 0.005 ? "text-slate-500" : bom ? "text-emerald-700" : "text-red-600";
  const seta = Math.abs(v) < 0.005 ? "=" : v > 0 ? "▲" : "▼";
  return <span className={cor}>{seta} {pontos ? `${(Math.abs(v) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.` : pct(Math.abs(v))} <span className="text-slate-500">sobre {rotulo}</span></span>;
}

function Cartao({ rotulo, valor, v, base, legenda, pontos }: { rotulo: string; valor: string; v: number | null; base: string; legenda?: string; pontos?: boolean }) {
  return (
    <div className="cartao px-4 py-3">
      <div className="text-[13px] font-semibold text-[#495057]">{rotulo}</div>
      <div className="mt-1 text-[20px] font-semibold text-[#212529]">{valor}</div>
      <div className="text-[12px]"><Variacao v={v} rotulo={base} pontos={pontos} /></div>
      {legenda && <div className="text-[12px] text-slate-500">{legenda}</div>}
    </div>
  );
}

/** Barras horizontais dos maiores (clientes, produtos): o nome fica em texto, a barra só mostra o tamanho. */
function Ranking({ titulo, r, total, href, vazio }: {
  titulo: string; r: { top: { chave: string; rotulo: string; receita: number; lucro: number }[]; outros: number; qtdOutros: number };
  total: number; href: (chave: string) => string | undefined; vazio: string;
}) {
  const max = Math.max(...r.top.map((x) => x.receita), 1);
  return (
    <div className="cartao p-4">
      <h3 className="mb-3 text-[14px] font-semibold text-slate-700">{titulo}</h3>
      {!r.top.length && <p className="py-6 text-center text-[13px] text-slate-500">{vazio}</p>}
      <ul className="space-y-2.5">
        {r.top.map((x) => {
          const h = href(x.chave);
          const nome = <span className="truncate">{x.rotulo}</span>;
          return (
            <li key={x.chave} title={`${x.rotulo}\nFaturamento: ${brl(x.receita)}\nLucro: ${brl(x.lucro)}${total ? `\n${pct(x.receita / total)} do total` : ""}`}>
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                {h ? <Link href={h} className="truncate text-marca hover:underline">{nome}</Link> : nome}
                <span className="shrink-0 tabular-nums text-slate-700">{brl(x.receita)}</span>
              </div>
              <div className="mt-1 h-2 rounded bg-slate-100"><div className="h-2 rounded" style={{ width: `${(x.receita / max) * 100}%`, background: COR.faturamento }} /></div>
            </li>
          );
        })}
      </ul>
      {r.qtdOutros > 0 && <p className="mt-3 text-[12px] text-slate-500">Outros {r.qtdOutros}: {brl(r.outros)}</p>}
    </div>
  );
}

export default async function Relatorios({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const per = periodoRelatorio(sp);
  const params = paramsDe(sp);
  const vendedorId = sp.vendedor || undefined;
  const d = await painelRelatorios(per, { vendedorId });
  const a = d.atual, b = d.anterior;
  const pa = d.periodoAnterior;
  const mesCheio = pa.de.getUTCDate() === 1 && pa.ate.getUTCMonth() === pa.de.getUTCMonth() && new Date(pa.ate.getTime() + 86400000).getUTCDate() === 1;
  const base = mesCheio ? pa.de.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }) : `${data(pa.de)} a ${data(pa.ate)}`;
  const vendedor = d.vendedores.find((v) => v.id === vendedorId);
  // filtros que seguem para os relatórios ao clicar (vendedor; o período muda para o mês clicado)
  const extra = vendedorId ? { vendedor: vendedorId } : {};
  const doMes = (chave: string, por = "cliente") => urlCom("/relatorios/lucro", {}, { ...extra, periodo: chave, por });
  const comFiltro = (href: string) => (href.startsWith("/relatorios/") ? urlCom(href, params, {}) : href);

  return (
    <Pagina titulo="Relatórios" icone="grafico" trilha={[{ rotulo: "Relatórios" }]}>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-slate-600">Vendas concretizadas e OS concluídas/faturadas da loja selecionada no topo.</span>
        <div className="ml-auto flex items-center gap-2">
          <Suspenso direita classe="btn-sec" botao={<>{vendedor ? vendedor.nome : "Todos os vendedores"} <Icone nome="abaixo" size={13} /></>}>
            <Link href={urlCom("/relatorios", params, { vendedor: undefined })} className={`block px-3 py-[7px] hover:bg-slate-100 ${!vendedorId ? "font-semibold" : ""}`}>Todos os vendedores</Link>
            {d.vendedores.map((v) => (
              <Link key={v.id} href={urlCom("/relatorios", params, { vendedor: v.id })} className={`block px-3 py-[7px] hover:bg-slate-100 ${v.id === vendedorId ? "font-semibold" : ""}`}>{v.nome}</Link>
            ))}
          </Suspenso>
          <SeletorPeriodo base="/relatorios" params={params} />
        </div>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao rotulo={`Faturamento · ${per.rotulo}`} valor={brl(a.receita)} v={variacao(a.receita, b.receita)} base={base} legenda={`Vendas ${brl(a.vendas)} · OS ${brl(a.os)}`} />
        <Cartao rotulo="Lucro bruto" valor={brl(a.lucro)} v={variacao(a.lucro, b.lucro)} base={base} legenda={`Custo das peças ${brl(a.custo)}`} />
        <Cartao rotulo="Margem" valor={pct(a.margem)} v={b.receita ? a.margem - b.margem : null} base={base} pontos legenda={`antes ${pct(b.margem)}`} />
        <Cartao rotulo="Ticket médio" valor={brl(a.ticket)} v={variacao(a.ticket, b.ticket)} base={base} legenda={`${a.documentos.toLocaleString("pt-BR")} vendas/OS (antes ${b.documentos.toLocaleString("pt-BR")})`} />
      </div>

      <div className="cartao mb-3 p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[14px] font-semibold text-slate-700">Faturamento e lucro dos últimos 12 meses</h3>
          <span className="text-[12px] text-slate-500">Clique num mês para abrir o lucro daquele mês por cliente</span>
        </div>
        <GraficoColunas titulo="Faturamento e lucro dos últimos 12 meses" rotulos={d.mensal.map((m) => m.rotulo)} formatar={brl}
          links={d.mensal.map((m) => doMes(m.chave))}
          series={[
            { nome: "Faturamento", cor: COR.faturamento, valores: d.mensal.map((m) => m.receita) },
            { nome: "Lucro bruto", cor: COR.lucro, valores: d.mensal.map((m) => m.lucro) },
            { nome: "Faturamento no mesmo mês do ano anterior", cor: COR.anoAnterior, tipo: "linha", tracejada: true, valores: d.mensal.map((m) => m.anoAnterior) },
          ]} />
        <details className="mt-2 text-[12px]">
          <summary className="cursor-pointer text-marca">Ver em tabela</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>Mês</th><th className="text-right">Faturamento</th><th className="text-right">Lucro</th><th className="text-right">Margem</th><th className="text-right">Ano anterior</th><th className="text-right">Variação</th></tr></thead>
              <tbody>
                {d.mensal.map((m) => {
                  const v = variacao(m.receita, m.anoAnterior);
                  return (
                    <tr key={m.chave}>
                      <td><Link href={doMes(m.chave)} className="text-marca hover:underline">{m.rotulo}</Link></td>
                      <td className="text-right">{brl(m.receita)}</td><td className="text-right">{brl(m.lucro)}</td><td className="text-right">{pct(m.margem)}</td>
                      <td className="text-right">{brl(m.anoAnterior)}</td>
                      <td className={`text-right ${v === null ? "text-slate-400" : v >= 0 ? "text-emerald-700" : "text-red-600"}`}>{v === null ? "—" : `${v >= 0 ? "▲" : "▼"} ${pct(Math.abs(v))}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <div className="mb-5 grid gap-3 lg:grid-cols-3">
        <Ranking titulo="Maiores clientes" r={d.clientes} total={a.receita} vazio="Nada vendido no período."
          href={(id) => (id === "-" ? undefined : `/clientes/${id}`)} />
        <Ranking titulo="Produtos mais vendidos" r={d.produtos} total={a.receita} vazio="Nenhum produto vendido no período."
          href={() => urlCom("/relatorios/lucro", params, { por: "produto" })} />
        <Ranking titulo="Serviços mais vendidos" r={d.servicos} total={a.receita} vazio="Nenhum serviço no período."
          href={() => urlCom("/relatorios/lucro", params, { por: "servico" })} />
      </div>

      <h3 className="mb-2 text-[14px] font-semibold text-slate-700">Todos os relatórios</h3>
      <div className="grid gap-3 md:grid-cols-3">
        {RELATORIOS.map((r) => (
          <Link key={r.href} href={comFiltro(r.href)} className="cartao flex gap-3 p-4 hover:border-marca">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-marca"><Icone nome={r.icone} size={18} /></span>
            <span><b className="block">{r.titulo}</b><span className="text-[12px] text-slate-500">{r.texto}</span><span className="mt-1 block text-[12px] text-marca">Abrir relatório ›</span></span>
          </Link>
        ))}
      </div>
    </Pagina>
  );
}
