import Link from "next/link";
import { Pagina } from "@/components/ui/Pagina";
import Resumo from "@/components/ui/Resumo";
import { exigirUsuario } from "@/lib/auth/atual";
import { diaSP } from "@/lib/datas";
import { painelMaoDeObra, TIPOS_MAO_DE_OBRA } from "@/lib/financeiro/maoDeObra";
import { brl } from "@/lib/ui/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mão de obra" };

const NOMES_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (m: string) => `${NOMES_MES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const somaMes = (m: string, d: number) => { const [a, x] = m.split("-").map(Number); const n = new Date(Date.UTC(a, x - 1 + d, 1)); return n.toISOString().slice(0, 7); };
// cores das séries (mesma ordem de TIPOS_MAO_DE_OBRA)
const CORES = ["#0c1b25", "#3b82a0", "#1d7a34", "#a2620a", "#8a8f98", "#a8323e"];

export default async function MaoDeObra({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  const sp = await searchParams;
  const hoje = diaSP();
  // padrão: o mês anterior (o salário do mês é pago até o dia 10 do seguinte)
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : somaMes(hoje.toISOString().slice(0, 7), -1);
  const { meses, folha } = await painelMaoDeObra(mes, 12);
  const atual = meses[meses.length - 1];
  const anterior = meses[meses.length - 2];
  const comGasto = meses.filter((m) => m.total > 0);
  const media = comGasto.length ? comGasto.reduce((s, m) => s + m.total, 0) / comGasto.length : 0;
  const maior = Math.max(1, ...meses.map((m) => m.total));
  const pctReceita = atual.receita ? (atual.total / atual.receita) * 100 : 0;
  const variacao = anterior?.total ? ((atual.total - anterior.total) / anterior.total) * 100 : null;
  const alertas = folha.linhas.filter((l) => l.alertas.length);
  const tiposUsados = TIPOS_MAO_DE_OBRA.filter((t) => meses.some((m) => m.porTipo[t.tipo]));

  return (
    <Pagina titulo="Mão de obra" icone="equipe" trilha={[{ rotulo: "Financeiro", href: "/financeiro" }, { rotulo: "Mão de obra" }]}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/financeiro/mao-de-obra?mes=${somaMes(mes, -1)}`} className="btn-sec">‹</Link>
          <span className="min-w-28 text-center text-[15px] font-semibold">Competência {mes.slice(5, 7)}/{mes.slice(0, 4)}</span>
          <Link href={`/financeiro/mao-de-obra?mes=${somaMes(mes, 1)}`} className="btn-sec">›</Link>
          <Link href="/financeiro/conciliacao" className="btn-sec ml-auto">Conciliação bancária</Link>
          <Link href="/funcionarios" className="btn-sec">Funcionários</Link>
        </div>

        <Resumo cartoes={[
          { rotulo: "Gasto com mão de obra", valor: brl(atual.total), legenda: variacao == null ? "no mês" : `${variacao >= 0 ? "+" : ""}${variacao.toFixed(0)}% sobre ${rotuloMes(anterior.mes)}`, icone: "equipe", cor: "tinta" },
          { rotulo: "Sobre a receita", valor: `${pctReceita.toFixed(1).replace(".", ",")}%`, legenda: `receita do mês ${brl(atual.receita)}`, icone: "percentual", cor: pctReceita > 40 ? "vermelho" : pctReceita > 25 ? "amarelo" : "verde", pct: Math.min(100, pctReceita) },
          { rotulo: "Média de 12 meses", valor: brl(media), legenda: `${comGasto.length} mês(es) com gasto`, icone: "grafico", cor: "azul" },
          { rotulo: "Alertas da folha", valor: String(alertas.length), legenda: alertas.length ? "confira abaixo" : "nada fora do normal", icone: "alerta", cor: alertas.length ? "vermelho" : "verde" },
        ]} />

        <section className="cartao p-4">
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <h2 className="text-[15px] font-semibold">Gasto por mês (competência)</h2>
            <div className="flex flex-wrap gap-3 text-[12px] text-slate-600">
              {tiposUsados.map((t) => <span key={t.tipo} className="inline-flex items-center gap-1"><span className="inline-block size-2.5 rounded-sm" style={{ background: CORES[TIPOS_MAO_DE_OBRA.indexOf(t)] }} />{t.rotulo}</span>)}
            </div>
          </div>
          <div className="flex h-56 items-end gap-1.5 overflow-x-auto">
            {meses.map((m) => (
              <Link key={m.mes} href={`/financeiro/mao-de-obra?mes=${m.mes}`} className={`group flex h-full min-w-10 flex-1 flex-col items-center justify-end gap-1 rounded px-0.5 ${m.mes === mes ? "bg-slate-100" : "hover:bg-slate-50"}`}
                title={`${rotuloMes(m.mes)}: ${brl(m.total)}${m.receita ? ` · ${((m.total / m.receita) * 100).toFixed(1)}% da receita` : ""}`}>
                <span className="text-[10px] text-slate-500">{m.total ? `${(m.total / 1000).toFixed(1).replace(".", ",")}k` : ""}</span>
                <div className="flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-t" style={{ height: `${(m.total / maior) * 170}px` }}>
                  {TIPOS_MAO_DE_OBRA.map((t, i) => m.porTipo[t.tipo] ? <div key={t.tipo} style={{ height: `${(m.porTipo[t.tipo] / m.total) * 100}%`, background: CORES[i] }} /> : null)}
                </div>
                <span className={`text-[11px] ${m.mes === mes ? "font-semibold" : "text-slate-600"}`}>{rotuloMes(m.mes)}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-[15px] font-semibold">Folha de {mes.slice(5, 7)}/{mes.slice(0, 4)} por funcionário</h2>
          <div className="cartao overflow-x-auto">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Funcionário</th><th className="text-right">Salário combinado</th>
                  {TIPOS_MAO_DE_OBRA.filter((t) => t.tipo !== "ENCARGOS").map((t) => <th key={t.tipo} className="text-right">{t.rotulo}</th>)}
                  <th className="text-right">Total</th><th className="min-w-56">Conferência</th>
                </tr>
              </thead>
              <tbody>
                {folha.linhas.length === 0 && <tr><td colSpan={9} className="text-slate-500">Nenhum pagamento a funcionário neste mês. Os pagamentos entram pela conciliação bancária (Pix para funcionário cadastrado).</td></tr>}
                {folha.linhas.map((l) => (
                  <tr key={l.id} className={l.alertas.length ? "[&>td]:!bg-red-50/40" : undefined}>
                    <td><Link href={`/funcionarios/${l.id}`} className="hover:underline">{l.nome}</Link></td>
                    <td className="whitespace-nowrap text-right">{l.salario != null ? brl(l.salario) : <Link href={`/funcionarios/${l.id}/editar`} className="text-[12px] underline">informar</Link>}{l.salarioOrigem === "último pago" && <div className="text-[11px] text-slate-500">último pago</div>}</td>
                    {TIPOS_MAO_DE_OBRA.filter((t) => t.tipo !== "ENCARGOS").map((t) => <td key={t.tipo} className="whitespace-nowrap text-right">{l.porTipo[t.tipo] ? brl(l.porTipo[t.tipo]) : <span className="text-slate-400">—</span>}</td>)}
                    <td className="whitespace-nowrap text-right font-semibold">{brl(l.total)}</td>
                    <td className="text-[12px]">{l.alertas.length ? l.alertas.map((a) => <div key={a} className="text-red-700">⚠ {a}</div>) : <span className="text-emerald-700">ok</span>}</td>
                  </tr>
                ))}
              </tbody>
              {folha.linhas.length > 0 && (
                <tfoot>
                  <tr className="font-semibold">
                    <td>Total</td><td />
                    {TIPOS_MAO_DE_OBRA.filter((t) => t.tipo !== "ENCARGOS").map((t) => <td key={t.tipo} className="whitespace-nowrap text-right">{brl(folha.linhas.reduce((s, l) => s + l.porTipo[t.tipo], 0))}</td>)}
                    <td className="whitespace-nowrap text-right">{brl(folha.linhas.reduce((s, l) => s + l.total, 0))}</td><td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="text-[12px] text-slate-500">
            {atual.porTipo.ENCARGOS ? `Encargos e benefícios do mês (FGTS, INSS e outras contas do grupo Salários e encargos): ${brl(atual.porTipo.ENCARGOS)}. ` : ""}
            {folha.semFuncionario ? `${brl(folha.semFuncionario)} em pagamentos de pessoal sem funcionário identificado. ` : ""}
            O salário combinado vem do cadastro do funcionário; sem ele, vale o último salário pago. Salário do mês tem até o dia 10 do mês seguinte para ser pago.
          </p>
        </section>
      </div>
    </Pagina>
  );
}
