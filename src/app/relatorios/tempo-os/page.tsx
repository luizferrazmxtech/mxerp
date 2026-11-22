import Link from "next/link";
import { duracao, tempoOs } from "@/lib/relatorios/relatorios";
import { paramsDe, periodoRelatorio } from "@/lib/relatorios/periodo";
import { BarrasH } from "@/components/relatorios/Graficos";
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
  const gargalo = r.situacoes[0];
  const totalSit = r.situacoes.reduce((t, s) => t + s.horas, 0);
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
        <div>
          <BarrasH titulo={<>Onde as OS ficam mais tempo paradas{gargalo && <span className="ml-2 text-[12px] font-normal text-amber-700">gargalo: {gargalo.situacao}</span>}</>}
            series={[{ nome: "Tempo total", cor: "#e8730c" }]} formatar={duracao} destaque={gargalo?.situacao} vazio="Sem histórico de situações."
            linhas={r.situacoes.map((s) => ({ chave: s.situacao, rotulo: s.situacao, detalhe: `${s.vezes}x · média ${duracao(s.media)}`, valores: [s.horas],
              total: `${duracao(s.horas)} (${totalSit ? Math.round((s.horas / totalSit) * 100) : 0}%)` }))} />
          <p className="mt-1 text-[12px] text-slate-500">Soma do tempo que as OS do período passaram em cada situação. A maior barra é onde vale agir primeiro.</p>
        </div>
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Técnico</th><th className="text-right">OS</th><th className="text-right">Tempo médio</th><th className="text-right">Fora da previsão</th></tr></thead>
            <tbody>{r.tecnicos.map((t) => <tr key={t.tecnico}><td>{t.tecnico}</td><td className="text-right">{t.os}</td><td className="text-right">{duracao(t.media)}</td><td className="text-right">{t.atrasadas}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      {r.tecnicos.length > 1 && (
        <div className="mb-3">
          <BarrasH titulo="Tempo médio por técnico (entrada → saída)" series={[{ nome: "Tempo médio", cor: "#018e83" }]} formatar={duracao}
            linhas={r.tecnicos.map((t) => ({ chave: t.tecnico, rotulo: t.tecnico, detalhe: `${t.os} OS${t.atrasadas ? ` · ${t.atrasadas} fora da previsão` : ""}`, valores: [t.media] }))} />
        </div>
      )}
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
