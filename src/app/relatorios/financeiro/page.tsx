import Link from "next/link";
import { exigirArea } from "@/lib/auth/atual";
import { Pagina } from "@/components/ui/Pagina";
import SeletorPeriodo from "@/components/ui/SeletorPeriodo";
import { urlCom } from "@/components/ui/BarraLista";
import { GraficoColunas } from "@/components/inicio/Graficos";
import { BarrasH, GraficoSaldo } from "@/components/relatorios/Graficos";
import { Kpi, brl, pct } from "@/components/relatorios/Barra";
import { paramsDe, periodoRelatorio } from "@/lib/relatorios/periodo";
import { despesasPorCategoria, inadimplencia, maoDeObraSobreReceita, saldoProjetado } from "@/lib/relatorios/financeiro";
import { abreviar } from "@/lib/inicio/escala";
import { diaSP, rotuloMesCurto } from "@/lib/datas";
import { data } from "@/lib/ui/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Painel financeiro" };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const curto = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

export default async function PainelFinanceiro({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirArea("/financeiro");
  const sp = await searchParams;
  const per = periodoRelatorio(sp);
  const params = paramsDe(sp);
  const hoje = diaSP();
  const mesAnterior = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const [saldo, inad, desp, mo] = await Promise.all([saldoProjetado(90, hoje), inadimplencia(hoje), despesasPorCategoria(per), maoDeObraSobreReceita(mesAnterior, 12)]);
  const periodoLista = sp.periodo ? { periodo: sp.periodo, pde: sp.pde, pate: sp.pate } : {};
  const moUltimo = mo.at(-1);

  return (
    <Pagina titulo="Painel financeiro" icone="financeiro" trilha={[{ rotulo: "Relatórios", href: "/relatorios" }, { rotulo: "Painel financeiro" }]}>
      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/financeiro/contas"><Kpi rotulo="Saldo hoje (todas as contas)" valor={brl(saldo.hoje)} /></Link>
        <Link href="/financeiro/fluxo"><Kpi rotulo="Saldo previsto em 90 dias" valor={brl(saldo.final)} cor={saldo.final < 0 ? "text-red-600" : ""}
          dica={saldo.primeiroNegativo ? `fica negativo em ${data(saldo.primeiroNegativo.dia)}` : `menor saldo ${brl(saldo.menor.saldo)} em ${curto(saldo.menor.dia)}`} /></Link>
        <Link href="/financeiro?tipo=RECEBER&periodo=todos&f=vencidos"><Kpi rotulo="A receber vencido" valor={brl(inad.total)} cor={inad.total ? "text-red-600" : ""} dica={`${inad.contas} conta(s) em atraso`} /></Link>
        <Link href="/financeiro?tipo=PAGAR&periodo=todos&f=vencidos"><Kpi rotulo="A pagar vencido" valor={brl(saldo.atrasadoPagar)} cor={saldo.atrasadoPagar ? "text-red-600" : ""} dica="contas suas em atraso" /></Link>
      </div>

      <div className="cartao mb-3 p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[14px] font-semibold text-slate-700">Saldo projetado dos próximos 90 dias</h3>
          <span className="text-[12px] text-slate-500">saldo de hoje + contas a receber − contas a pagar, pelo vencimento · contas já vencidas não entram</span>
        </div>
        <GraficoSaldo titulo="Saldo projetado" formatar={brl} abreviar={abreviar}
          pontos={saldo.pontos.map((p) => ({ rotulo: curto(p.dia), valor: p.saldo, detalhe: p.entradas || p.saidas ? `Entra ${brl(p.entradas)} · sai ${brl(p.saidas)}` : undefined }))} />
        {saldo.primeiroNegativo && (
          <p className="mt-2 text-[13px] text-red-700">⚠ O saldo fica negativo em {data(saldo.primeiroNegativo.dia)} ({brl(saldo.primeiroNegativo.saldo)}). <Link href={`/financeiro/fluxo?periodo=periodo&pde=${iso(hoje)}&pate=${iso(saldo.primeiroNegativo.dia)}`} className="underline">Ver o fluxo até lá</Link></p>
        )}
      </div>

      <div className="mb-3 grid gap-3 lg:grid-cols-2">
        <BarrasH titulo={<>Inadimplência por tempo de atraso <span className="ml-1 text-[12px] font-normal text-slate-500">clique para ver as contas</span></>}
          series={[{ nome: "Em atraso", cor: "#dc2626" }]} formatar={brl} vazio="Nenhuma conta a receber vencida. 🎉"
          linhas={inad.total ? inad.faixas.map((f) => ({ chave: f.chave, rotulo: f.rotulo, detalhe: `${f.contas} conta(s)`, valores: [f.valor],
            href: urlCom("/financeiro", {}, { tipo: "RECEBER", f: "vencidos", periodo: "periodo", pde: iso(f.vencDe), pate: iso(f.vencAte) }) })) : []} />
        <BarrasH titulo="Quem mais deve" series={[{ nome: "Em atraso", cor: "#dc2626" }]} formatar={brl} vazio="Ninguém em atraso."
          linhas={inad.devedores.map((d) => ({ chave: d.id ?? "-", rotulo: d.nome, detalhe: `${d.contas} conta(s) · desde ${data(d.maisAntigo)}`, valores: [d.valor],
            href: d.id ? urlCom("/financeiro", {}, { tipo: "RECEBER", f: "vencidos", periodo: "todos", cli: d.id }) : undefined }))} />
      </div>

      <div className="mb-3 grid gap-3 lg:grid-cols-2">
        <div>
          <BarrasH titulo={<span className="flex flex-wrap items-center gap-2">Despesas por categoria <span className="text-[12px] font-normal text-slate-500">total {brl(desp.total)}, pelo vencimento</span><span className="no-print font-normal"><SeletorPeriodo base="/relatorios/financeiro" params={params} /></span></span>}
            series={[{ nome: "Despesa", cor: "#e8730c" }]} formatar={brl} vazio="Nenhuma conta a pagar no período."
            linhas={desp.linhas.slice(0, 12).map((l) => ({ chave: l.id, rotulo: l.nome, detalhe: `${l.contas} conta(s)`, valores: [l.valor],
              total: `${brl(l.valor)} · ${desp.total ? pct(l.valor / desp.total) : "0%"}`,
              href: urlCom("/financeiro", {}, { tipo: "PAGAR", cat: l.id, ...periodoLista }) }))} />
        </div>
        <div className="cartao p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[14px] font-semibold text-slate-700">Mão de obra sobre a receita</h3>
            <Link href="/financeiro/mao-de-obra" className="text-[12px] text-marca hover:underline">Painel de mão de obra ›</Link>
          </div>
          <GraficoColunas titulo="Mão de obra em % da receita" formatar={(v) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
            rotulos={mo.map((m) => rotuloMesCurto(m.mes))} links={mo.map((m) => `/financeiro/mao-de-obra?mes=${m.mes}`)}
            series={[{ nome: "% da receita", cor: "#2f6fd6", valores: mo.map((m) => (m.pct == null ? 0 : Math.round(m.pct * 1000) / 10)) }]} />
          {moUltimo && <p className="mt-1 text-[12px] text-slate-500">{rotuloMesCurto(moUltimo.mes)}: {brl(moUltimo.maoDeObra)} de mão de obra para {brl(moUltimo.receita)} de receita (competência).</p>}
        </div>
      </div>
    </Pagina>
  );
}
