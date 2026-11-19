import Link from "next/link";
import { prisma } from "@/lib/db";
import { diaSP, periodoDia, rotuloMesCurto } from "@/lib/datas";
import { fluxoCaixa, fluxoMensal, type LinhaFluxo } from "@/lib/financeiro/fluxo";
import { brl, data } from "@/lib/ui/format";
import { Pagina } from "@/components/ui/Pagina";
import { GraficoColunas } from "@/components/inicio/Graficos";
import SeletorPeriodo from "@/components/ui/SeletorPeriodo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fluxo de caixa" };

const ABAS = [["saldo", "Saldo"], ["diario", "Diário"], ["mensal", "Estatísticas"]] as const;
const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function Cartao({ rotulo, valor, cor = "", dica }: { rotulo: string; valor: number; cor?: string; dica?: string }) {
  return (
    <div className="cartao p-4">
      <div className="text-xs text-slate-500">{rotulo}</div>
      <div className={`text-lg font-semibold ${cor || (valor < 0 ? "text-red-600" : "")}`}>{brl(valor)}</div>
      {dica && <div className="text-[11px] text-slate-500">{dica}</div>}
    </div>
  );
}

function Extrato({ linhas }: { linhas: LinhaFluxo[] }) {
  return (
    <table className="tabela">
      <thead><tr><th className="w-24">Data</th><th>Lançamento</th><th>Plano de contas</th><th>Centro de custo</th><th>Conta</th><th className="w-28">Situação</th><th className="text-right">Valor</th></tr></thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.id + l.realizado} className={l.tipo === "RECEBER" ? "[&>td]:!bg-emerald-50/60" : "[&>td]:!bg-rose-50/60"}>
            <td>{data(l.data)}</td>
            <td>{l.descricao}{l.pessoa && <div className="text-[11px] text-slate-500">{l.pessoa}</div>}</td>
            <td className="text-[12px] text-slate-600">{l.categoria}</td>
            <td className="text-[12px] text-slate-600">{l.centro}</td>
            <td className="text-[12px] text-slate-600">{l.conta}</td>
            <td className="text-[12px]">{l.realizado ? (l.tipo === "RECEBER" ? "Recebido" : "Pago") : l.vencido ? <span className="text-red-600">Atrasado</span> : "Previsto"}</td>
            <td className={`text-right ${l.tipo === "PAGAR" ? "text-red-600" : "text-emerald-700"}`}>{l.tipo === "PAGAR" ? "−" : ""}{brl(l.valor)}</td>
          </tr>
        ))}
        {!linhas.length && <tr><td colSpan={7} className="py-8 text-center text-slate-500">Nada no período.</td></tr>}
      </tbody>
    </table>
  );
}

export default async function Fluxo({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const aba = ABAS.some(([k]) => k === sp.aba) ? sp.aba! : "saldo";
  const hoje = diaSP();
  const per = periodoDia(sp.periodo ?? "mes", sp.pde, sp.pate) ?? { de: new Date(Date.UTC(hoje.getUTCFullYear(), 0, 1)), ate: new Date(Date.UTC(hoje.getUTCFullYear(), 11, 31)), rotulo: `Ano de ${hoje.getUTCFullYear()}` };
  const [contas, centros] = await Promise.all([
    prisma.contaBancaria.findMany({ where: { ativa: true }, orderBy: { nome: "asc" } }),
    prisma.centroCusto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
  ]);
  const filtro = { contaId: sp.conta || undefined, centroCustoId: sp.centro || undefined };
  const f = await fluxoCaixa({ de: per.de, ate: per.ate, hoje, ...filtro });
  const m = aba === "mensal" ? await fluxoMensal(per.ate, 12, filtro) : null;
  const params = Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>;
  const url = (mudar: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...mudar })) if (v) p.set(k, v);
    return `/financeiro/fluxo?${p}`;
  };
  const totalMov = f.recebido + f.pago;

  return (
    <Pagina titulo="Fluxo de caixa" icone="dre" trilha={[{ rotulo: "Financeiro", href: "/financeiro" }, { rotulo: "Fluxo de caixa" }]}>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        {ABAS.map(([k, r]) => <Link key={k} href={url({ aba: k })} className={k === aba ? "aba aba-ativa" : "aba"}>{r}</Link>)}
        <form className="ml-auto flex flex-wrap items-center gap-2">
          {Object.entries(params).filter(([k]) => !["conta", "centro"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <select name="conta" defaultValue={sp.conta ?? ""} className="campo w-44" aria-label="Conta bancária">
            <option value="">Todas as contas</option>
            {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select name="centro" defaultValue={sp.centro ?? ""} className="campo w-44" aria-label="Centro de custo">
            <option value="">Todos os centros</option>
            {centros.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <button className="btn-sec">Filtrar</button>
        </form>
        <SeletorPeriodo base="/financeiro/fluxo" params={params} />
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Cartao rotulo={filtro.centroCustoId ? "Saldo anterior (centro)" : "Saldo anterior"} valor={f.saldoAnterior} />
        <Cartao rotulo="Recebimentos" valor={f.recebido} cor="text-emerald-700" dica={`${totalMov ? Math.round((f.recebido / totalMov) * 100) : 0}% do movimento · a receber ${brl(f.aReceber)}`} />
        <Cartao rotulo="Pagamentos" valor={f.pago} cor="text-red-600" dica={`a pagar ${brl(f.aPagar)}`} />
        <Cartao rotulo="Saldo" valor={f.saldo} dica="saldo anterior + recebido − pago" />
        <Cartao rotulo="Saldo previsto" valor={f.saldoPrevisto} dica="saldo + a receber − a pagar no período" />
      </div>
      {(f.atrasadoReceber > 0 || f.atrasadoPagar > 0) && (
        <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          Contas vencidas antes do período ainda em aberto (fora do previsto): a receber {brl(f.atrasadoReceber)} · a pagar {brl(f.atrasadoPagar)}.
          {" "}<Link href="/financeiro?f=vencidos" className="underline">Ver vencidos</Link>
        </p>
      )}
      {filtro.contaId === undefined && <p className="mb-3 text-[11px] text-slate-500">Com todas as contas, as transferências entre contas não entram (o dinheiro só mudou de lugar). Escolha uma conta para ver o extrato dela com as transferências.</p>}

      {aba === "saldo" && <div className="cartao overflow-x-auto"><Extrato linhas={f.linhas} /></div>}

      {aba === "diario" && (
        <>
          <div className="cartao mb-3 p-4">
            <h2 className="mb-2 text-[15px]">Acompanhe o <b>saldo</b> dia a dia</h2>
            <GraficoColunas titulo="Saldo por dia" formatar={brl} rotulos={f.dias.map((d) => String(d.dia.getUTCDate()).padStart(2, "0"))}
              series={[
                { nome: "Entradas", cor: "#2e9d4f", valores: f.dias.map((d) => d.entradas) },
                { nome: "Saídas", cor: "#d9534f", valores: f.dias.map((d) => -d.saidas) },
                { nome: "Saldo realizado", cor: "#2f6fd6", tipo: "linha", valores: f.dias.map((d) => (d.dia <= hoje ? d.saldo : d.previsto)) },
                { nome: "Saldo previsto", cor: "#94a3b8", tipo: "linha", tracejada: true, valores: f.dias.map((d) => d.previsto) },
              ]} />
          </div>
          <div className="space-y-3">
            {f.dias.filter((d) => d.linhas.length).map((d) => (
              <div key={d.dia.toISOString()} className="cartao overflow-x-auto">
                <div className="flex flex-wrap items-center gap-3 border-b bg-[#f7f7f7] px-3 py-2 text-[13px]">
                  <b>{data(d.dia)}</b><span className="text-slate-500">{SEMANA[d.dia.getUTCDay()]} · {d.linhas.length} lançamento{d.linhas.length > 1 ? "s" : ""}</span>
                  <span className="ml-auto">Saldo no fim do dia: <b className={d.previsto < 0 ? "text-red-600" : ""}>{brl(d.dia <= hoje ? d.saldo : d.previsto)}</b>{d.dia > hoje && <span className="text-slate-500"> (previsto)</span>}</span>
                </div>
                <Extrato linhas={d.linhas} />
              </div>
            ))}
          </div>
        </>
      )}

      {aba === "mensal" && m && (
        <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
          <div className="cartao p-4">
            <h2 className="mb-2 text-[15px]">Acompanhe o <b>fluxo mensal</b> (realizado, 12 meses)</h2>
            <GraficoColunas titulo="Fluxo mensal" formatar={brl} rotulos={m.porMes.map((x) => rotuloMesCurto(x.mes))}
              series={[
                { nome: "Recebimentos", cor: "#2e9d4f", valores: m.porMes.map((x) => x.receber) },
                { nome: "Pagamentos", cor: "#d9534f", valores: m.porMes.map((x) => x.pagar) },
                { nome: "Saldo do mês", cor: "#2f6fd6", tipo: "linha", valores: m.porMes.map((x) => x.saldo) },
              ]} />
            <div className="mt-2 flex gap-6 text-[13px]">
              <span>Saldo dos 12 meses: <b>{brl(m.porMes.reduce((s, x) => s + x.saldo, 0))}</b></span>
              <span>Média mensal: <b>{brl(m.porMes.reduce((s, x) => s + x.saldo, 0) / 12)}</b></span>
            </div>
          </div>
          <div className="cartao p-4">
            <h2 className="mb-2 text-[15px]">Veja o <b>movimento</b> por conta</h2>
            {m.porConta.map((c) => {
              const tot = m.porConta.reduce((s, x) => s + x.receber + x.pagar, 0) || 1;
              return (
                <div key={c.conta} className="mb-2 text-[12px]">
                  <div className="flex justify-between"><span>{c.conta}</span><span>{Math.round(((c.receber + c.pagar) / tot) * 100)}%</span></div>
                  <div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-[#2f6fd6]" style={{ width: `${((c.receber + c.pagar) / tot) * 100}%` }} /></div>
                  <div className="flex justify-between text-slate-500"><span className="text-emerald-700">+{brl(c.receber)}</span><span className="text-red-600">−{brl(c.pagar)}</span></div>
                </div>
              );
            })}
            {!m.porConta.length && <p className="text-[12px] text-slate-500">Sem movimento.</p>}
          </div>
        </div>
      )}
    </Pagina>
  );
}
