import Link from "next/link";
import { duracao, tempoOs } from "@/lib/relatorios/relatorios";
import { paramsDe, periodoRelatorio } from "@/lib/relatorios/periodo";
import { Pagina } from "@/components/ui/Pagina";
import { BarraRelatorio, Kpi } from "@/components/relatorios/Barra";
import { dataHora } from "@/lib/ui/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Situação × tempo das OS" };

export default async function TempoOs({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const per = periodoRelatorio(sp);
  const params = paramsDe(sp);
  const r = await tempoOs(per);
  const maxSit = Math.max(1, ...r.situacoes.map((s) => s.media));
  return (
    <Pagina titulo="Situação × tempo das OS" icone="relogio" trilha={[{ rotulo: "Relatórios", href: "/relatorios" }, { rotulo: "Tempo das OS" }]}>
      <BarraRelatorio base="/relatorios/tempo-os" params={params} csv={`/api/relatorios/tempo-os?${new URLSearchParams(params)}`} />
      <p className="mb-2 text-[12px] text-slate-500">{per.rotulo} · OS concluídas ou faturadas com saída no período · tempo corrido (inclui noites e fins de semana)</p>
      <div className="mb-3 grid gap-3 md:grid-cols-4">
        <Kpi rotulo="OS entregues" valor={String(r.resumo.os)} />
        <Kpi rotulo="Tempo médio (entrada → saída)" valor={duracao(r.resumo.mediaHoras)} />
        <Kpi rotulo="Mediana" valor={duracao(r.resumo.medianaHoras)} dica="metade das OS saiu em até esse tempo" />
        <Kpi rotulo="Fora da previsão" valor={String(r.resumo.atrasadas)} cor={r.resumo.atrasadas ? "text-red-600" : ""} />
      </div>
      <div className="mb-3 grid gap-3 lg:grid-cols-2">
        <div className="cartao p-4">
          <h2 className="mb-2 text-[15px]">Tempo médio em cada <b>situação</b></h2>
          {r.situacoes.map((s) => (
            <div key={s.situacao} className="mb-2 text-[12px]">
              <div className="flex justify-between"><span>{s.situacao} <span className="text-slate-400">({s.vezes}x)</span></span><span>{duracao(s.media)}</span></div>
              <div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-[#e8730c]" style={{ width: `${(s.media / maxSit) * 100}%` }} /></div>
            </div>
          ))}
          {!r.situacoes.length && <p className="text-[12px] text-slate-500">Sem histórico de situações.</p>}
        </div>
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Técnico</th><th className="text-right">OS</th><th className="text-right">Tempo médio</th><th className="text-right">Fora da previsão</th></tr></thead>
            <tbody>{r.tecnicos.map((t) => <tr key={t.tecnico}><td>{t.tecnico}</td><td className="text-right">{t.os}</td><td className="text-right">{duracao(t.media)}</td><td className="text-right">{t.atrasadas}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>OS</th><th>Cliente</th><th>Técnico</th><th>Entrada</th><th>Saída</th><th className="text-right">Tempo</th><th>Previsão</th></tr></thead>
          <tbody>
            {r.linhas.map((l) => (
              <tr key={l.id}>
                <td><Link href={`/os/${l.id}`} className="text-marca hover:underline">nº {l.numero}</Link></td><td>{l.cliente}</td><td>{l.tecnico}</td>
                <td>{dataHora(l.entrada)}</td><td>{dataHora(l.saida)}</td><td className="text-right">{duracao(l.horas)}</td>
                <td className={l.atrasada ? "text-red-600" : ""}>{l.previsao ? dataHora(l.previsao) : "—"}{l.atrasada && " (atrasou)"}</td>
              </tr>
            ))}
            {!r.linhas.length && <tr><td colSpan={7} className="py-8 text-center text-slate-500">Nenhuma OS entregue no período.</td></tr>}
          </tbody>
        </table>
      </div>
    </Pagina>
  );
}
