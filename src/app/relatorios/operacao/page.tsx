import Link from "next/link";
import { Pagina } from "@/components/ui/Pagina";
import SeletorPeriodo from "@/components/ui/SeletorPeriodo";
import { GraficoColunas } from "@/components/inicio/Graficos";
import { BarrasH } from "@/components/relatorios/Graficos";
import { Kpi, brl, pct } from "@/components/relatorios/Barra";
import BotaoImprimir from "@/app/os/[id]/separacao/BotaoImprimir";
import { paramsDe, periodoRelatorio } from "@/lib/relatorios/periodo";
import { clientesNovosERecorrentes, estoqueParado, osPorTecnicoEEquipamento, vendasPorCanal } from "@/lib/relatorios/operacao";
import { tempoOs, duracao } from "@/lib/relatorios/relatorios";
import { data, qtd } from "@/lib/ui/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operação e clientes" };

const COR = { canal: "#018e83", tipo: "#2f6fd6", os: "#e8730c", parado: "#94a3b8", novos: "#1fa855", recorrentes: "#2f6fd6" };

export default async function Operacao({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const per = periodoRelatorio(sp);
  const params = paramsDe(sp);
  const [canal, os, tempo, estoque, clientes] = await Promise.all([
    vendasPorCanal(per), osPorTecnicoEEquipamento(per), tempoOs(per), estoqueParado(90), clientesNovosERecorrentes(),
  ]);
  const doMes = clientes.meses.at(-1)!;

  return (
    <Pagina titulo="Operação e clientes" icone="grafico" trilha={[{ rotulo: "Relatórios", href: "/relatorios" }, { rotulo: "Operação e clientes" }]}>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-slate-600">{per.rotulo} · canais e OS no período; estoque e clientes sempre até hoje</span>
        <div className="ml-auto flex items-center gap-2"><BotaoImprimir /><SeletorPeriodo base="/relatorios/operacao" params={params} /></div>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi rotulo="Faturamento no período" valor={brl(canal.total)} dica={`${canal.canais.length} canal(is) de venda`} />
        <Kpi rotulo="Tempo médio de conserto" valor={duracao(tempo.resumo.mediaHoras)} dica={`${tempo.resumo.os} OS entregues · ${tempo.resumo.atrasadas} fora da previsão`} />
        <Link href="/estoque"><Kpi rotulo="Valor em estoque (custo)" valor={brl(estoque.valorEstoque)} dica={`${estoque.itensComSaldo} produto(s) com saldo`} /></Link>
        <Kpi rotulo="Parado há mais de 90 dias" valor={brl(estoque.valorParado)} cor={estoque.valorParado ? "text-amber-700" : ""}
          dica={`${estoque.parados.length} produto(s) · ${estoque.valorEstoque ? pct(estoque.valorParado / estoque.valorEstoque) : "0%"} do estoque`} />
      </div>

      <h2 className="mb-2 mt-4 text-[15px] font-semibold text-slate-700">Vendas</h2>
      <div className="mb-3 grid gap-3 lg:grid-cols-2">
        <BarrasH titulo="Faturamento por canal de venda" series={[{ nome: "Faturamento", cor: COR.canal }]} formatar={brl} vazio="Nada vendido no período."
          linhas={canal.canais.map((c) => ({ chave: c.chave, rotulo: c.chave, detalhe: `${c.documentos} venda(s)/OS`, valores: [c.receita],
            total: `${brl(c.receita)} · ${canal.total ? pct(c.receita / canal.total) : "0%"}` }))} />
        <BarrasH titulo="Faturamento por tipo" series={[{ nome: "Faturamento", cor: COR.tipo }]} formatar={brl} vazio="Nada vendido no período."
          linhas={canal.tipos.map((t) => ({ chave: t.chave, rotulo: t.rotulo, detalhe: `${t.documentos} documento(s)`, valores: [t.receita],
            href: t.chave === "OS" ? "/os" : t.chave === "BALCAO" ? "/pdv" : "/vendas",
            total: `${brl(t.receita)} · ${canal.total ? pct(t.receita / canal.total) : "0%"}` }))} />
      </div>

      <h2 className="mb-2 mt-4 text-[15px] font-semibold text-slate-700">Ordens de serviço</h2>
      <div className="mb-3 grid gap-3 lg:grid-cols-2">
        <BarrasH titulo="Faturamento das OS por técnico" series={[{ nome: "Serviços", cor: COR.os }, { nome: "Peças", cor: "#fbbf77" }]} formatar={brl} vazio="Nenhuma OS concluída no período."
          linhas={os.tecnicos.map((t) => ({ chave: t.chave, rotulo: t.nome, detalhe: `${t.os} OS · ticket ${brl(t.ticket)}`, valores: [t.servicos, Math.max(t.receita - t.servicos, 0)] }))} />
        <BarrasH titulo="OS que entraram por equipamento" series={[{ nome: "OS", cor: "#475569" }]} formatar={(v) => `${v} OS`} vazio="Nenhuma OS com equipamento no período."
          linhas={os.equipamentos.map((e) => ({ chave: e.equipamento, rotulo: e.equipamento, detalhe: `${e.concluidas} concluída(s)`, valores: [e.os],
            href: `/os?periodo=todos&q=${encodeURIComponent(e.equipamento)}` }))} />
      </div>

      <h2 className="mb-2 mt-4 text-[15px] font-semibold text-slate-700">Clientes</h2>
      <div className="mb-3 grid gap-3 lg:grid-cols-5">
        <div className="cartao p-4 lg:col-span-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[14px] font-semibold text-slate-700">Clientes que compraram por mês</h3>
            <span className="text-[12px] text-slate-500">{doMes.rotulo}: {doMes.novos} novo(s), {doMes.recorrentes} que já eram clientes · {clientes.ativos} ativos nos últimos 90 dias</span>
          </div>
          <GraficoColunas titulo="Clientes novos e recorrentes por mês" rotulos={clientes.meses.map((m) => m.rotulo)} empilhar formatar={(v) => `${v} cliente(s)`}
            series={[{ nome: "Já eram clientes", cor: COR.recorrentes, valores: clientes.meses.map((m) => m.recorrentes) }, { nome: "Novos", cor: COR.novos, valores: clientes.meses.map((m) => m.novos) }]} />
        </div>
        <div className="cartao overflow-x-auto lg:col-span-2">
          <div className="border-b px-4 py-3">
            <h3 className="text-[14px] font-semibold text-slate-700">Pararam de comprar</h3>
            <p className="text-[12px] text-slate-500">Compraram 2 vezes ou mais e não voltam há mais de 90 dias (até 1 ano). Bom para ligar ou mandar uma oferta.</p>
          </div>
          <table className="tabela">
            <thead><tr><th>Cliente</th><th className="text-right">Compras</th><th className="text-right">Total</th><th className="text-right">Última</th></tr></thead>
            <tbody>
              {clientes.sumiram.slice(0, 10).map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/clientes/${c.id}`} className="text-marca hover:underline">{c.nome}</Link></td>
                  <td className="text-right">{c.compras}</td><td className="text-right">{brl(c.total)}</td>
                  <td className="text-right" title={`${c.dias} dias atrás`}>{data(c.ultima)}</td>
                </tr>
              ))}
              {!clientes.sumiram.length && <tr><td colSpan={4} className="py-6 text-center text-slate-500">Nenhum cliente sumido. 👍</td></tr>}
            </tbody>
          </table>
          {clientes.sumiram.length > 10 && <p className="px-4 py-2 text-[12px] text-slate-500">e mais {clientes.sumiram.length - 10} cliente(s)</p>}
        </div>
      </div>

      <h2 className="mb-2 mt-4 text-[15px] font-semibold text-slate-700">Estoque parado há mais de 90 dias</h2>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Produto</th><th className="text-right">Saldo</th><th className="text-right">Custo</th><th className="text-right">Valor parado</th><th className="text-right">Última saída</th></tr></thead>
          <tbody>
            {estoque.parados.slice(0, 30).map((p) => (
              <tr key={p.id}>
                <td><Link href={`/produtos/${p.id}`} className="text-marca hover:underline">{p.nome}</Link><span className="ml-2 text-[12px] text-slate-500">{p.codigo}</span></td>
                <td className="text-right">{qtd(p.quantidade)}</td><td className="text-right">{brl(p.custo)}</td><td className="text-right">{brl(p.valor)}</td>
                <td className="text-right">{p.ultimaSaida ? `${data(p.ultimaSaida)} (${p.dias} dias)` : "nunca saiu"}</td>
              </tr>
            ))}
            {!estoque.parados.length && <tr><td colSpan={5} className="py-6 text-center text-slate-500">Nenhum produto parado. Tudo girando.</td></tr>}
          </tbody>
        </table>
        {estoque.parados.length > 30 && <p className="px-4 py-2 text-[12px] text-slate-500">Mostrando os 30 de maior valor de {estoque.parados.length}.</p>}
      </div>
    </Pagina>
  );
}
