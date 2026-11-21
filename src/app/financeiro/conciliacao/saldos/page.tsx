import Link from "next/link";
import { Bloco, Pagina } from "@/components/ui/Pagina";
import Resumo from "@/components/ui/Resumo";
import FormAcao from "@/components/financeiro/FormAcao";
import { exigirUsuario } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { diaSP } from "@/lib/datas";
import { conferenciaSaldo } from "@/lib/financeiro/saldos";
import { brl } from "@/lib/ui/format";
import { informarSaldoAcao } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conferência de saldo" };

const dataBr = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export default async function Saldos({ searchParams }: { searchParams: Promise<{ conta?: string; dias?: string }> }) {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  const sp = await searchParams;
  const contas = await prisma.contaBancaria.findMany({ where: { ativa: true, NOT: { nome: "Caixa" } }, orderBy: { nome: "asc" }, select: { id: true, nome: true } });
  const contaId = contas.find((c) => c.id === sp.conta)?.id ?? contas[0]?.id;
  const dias = [30, 60, 90].includes(Number(sp.dias)) ? Number(sp.dias) : 30;
  const r = contaId ? await conferenciaSaldo(contaId, dias) : null;
  const linhas = r ? [...r.linhas].reverse() : []; // mais novo primeiro
  const hoje = r?.linhas[r.linhas.length - 1];
  const temBanco = r?.linhas.some((l) => l.saldoBanco != null);
  const comDif = r?.linhas.filter((l) => l.diferenca != null && Math.abs(l.diferenca) >= 0.01) ?? [];
  // onde a diferença mudou: o dia em que o problema apareceu
  const mudou = new Set<string>();
  if (r) for (let i = 1; i < r.linhas.length; i++) {
    const a = r.linhas[i - 1].diferenca, b = r.linhas[i].diferenca;
    if (a != null && b != null && Math.abs(a - b) >= 0.01) mudou.add(r.linhas[i].data);
  }
  const pendentes = r?.linhas.reduce((s, l) => s + l.pendentes, 0) ?? 0;
  const link = (m: { conta?: string; dias?: number }) => `/financeiro/conciliacao/saldos?${new URLSearchParams({ conta: m.conta ?? contaId ?? "", dias: String(m.dias ?? dias) })}`;

  return (
    <Pagina titulo="Conferência de saldo" icone="dinheiro" trilha={[{ rotulo: "Financeiro", href: "/financeiro" }, { rotulo: "Conciliação bancária", href: "/financeiro/conciliacao" }, { rotulo: "Conferência de saldo" }]}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {contas.map((c) => <Link key={c.id} href={link({ conta: c.id })} className={c.id === contaId ? "btn" : "btn-sec"}>{c.nome}</Link>)}
          <span className="ml-2 text-[13px] text-slate-600">Período:</span>
          {[30, 60, 90].map((d) => <Link key={d} href={link({ dias: d })} className={d === dias ? "btn" : "btn-sec"}>{d} dias</Link>)}
        </div>

        {r && hoje && (
          <Resumo cartoes={[
            { rotulo: "Saldo no banco", valor: hoje.saldoBanco != null ? brl(hoje.saldoBanco) : "—", legenda: hoje.bancoInformado ? "informado hoje" : temBanco ? "calculado pelo extrato" : "informe abaixo ou sincronize o Inter", icone: "financeiro", cor: "tinta" },
            { rotulo: "Saldo no sistema", valor: brl(hoje.saldoSistema), legenda: "saldo inicial + recebido − pago", icone: "conciliacao", cor: "azul" },
            { rotulo: "Diferença hoje", valor: hoje.diferenca != null ? brl(hoje.diferenca) : "—", legenda: hoje.diferenca == null ? "sem saldo do banco" : Math.abs(hoje.diferenca) < 0.01 ? "bate" : "banco − sistema", icone: "alerta", cor: hoje.diferenca == null ? "cinza" : Math.abs(hoje.diferenca) < 0.01 ? "verde" : "vermelho" },
            { rotulo: "Linhas pendentes no período", valor: String(pendentes), legenda: "explicam boa parte da diferença", icone: "prazo", cor: pendentes ? "amarelo" : "verde", href: `/financeiro/conciliacao?conta=${contaId}` },
          ]} />
        )}

        {contaId && (
          <FormAcao acao={informarSaldoAcao} limpar={false}>
            <input type="hidden" name="contaBancariaId" value={contaId} />
            <Bloco icone="editar" titulo={<>Informe o <b>saldo do banco</b></>} subtitulo="O Inter manda o saldo sozinho a cada sincronização. Para outro banco (ou para conferir um dia), digite o saldo do fim do dia que aparece no app ou no extrato do banco.">
              <div className="flex flex-wrap items-end gap-3">
                <label><span className="rotulo">Data</span><input type="date" name="data" className="campo" defaultValue={diaSP().toISOString().slice(0, 10)} required /></label>
                <label><span className="rotulo">Saldo no banco</span><input name="saldo" inputMode="decimal" className="campo w-44 text-right" placeholder="0,00" required /></label>
                <button className="btn">Gravar saldo</button>
              </div>
            </Bloco>
          </FormAcao>
        )}

        {r && (
          <div className="cartao overflow-x-auto">
            <table className="tabela">
              <thead>
                <tr><th>Dia</th><th className="text-right">Movimento no extrato</th><th className="text-right">Movimento no sistema</th><th className="text-right">Saldo no banco</th><th className="text-right">Saldo no sistema</th><th className="text-right">Diferença</th><th>Pendentes</th></tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const dif = l.diferenca != null && Math.abs(l.diferenca) >= 0.01;
                  return (
                    <tr key={l.data} className={mudou.has(l.data) ? "[&>td]:!bg-red-50/60" : undefined}>
                      <td className="whitespace-nowrap">{dataBr(l.data)} <span className="text-[11px] text-slate-500">{SEMANA[new Date(`${l.data}T12:00:00Z`).getUTCDay()]}</span></td>
                      <td className={`whitespace-nowrap text-right ${l.movExtrato < 0 ? "text-red-600" : l.movExtrato > 0 ? "text-emerald-700" : "text-slate-400"}`}>{l.movExtrato ? brl(l.movExtrato) : "—"}</td>
                      <td className={`whitespace-nowrap text-right ${Math.abs(l.movExtrato - l.movSistema) >= 0.01 ? "font-semibold text-amber-800" : "text-slate-600"}`}>{l.movSistema ? brl(l.movSistema) : "—"}</td>
                      <td className="whitespace-nowrap text-right">{l.saldoBanco != null ? brl(l.saldoBanco) : "—"}{l.bancoInformado && <span className="ml-1 etiqueta border-sky-300 bg-sky-50 text-sky-700">informado</span>}</td>
                      <td className="whitespace-nowrap text-right">{brl(l.saldoSistema)}</td>
                      <td className={`whitespace-nowrap text-right font-semibold ${dif ? "text-red-700" : "text-emerald-700"}`}>{l.diferenca == null ? "—" : dif ? brl(l.diferenca) : "ok"}</td>
                      <td>{l.pendentes ? <Link href={`/financeiro/conciliacao?conta=${contaId}`} className="text-[13px] underline">{l.pendentes} ({brl(l.valorPendente)})</Link> : <span className="text-slate-400">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!contaId && <p className="cartao p-4 text-sm text-slate-600">Cadastre uma conta bancária em Financeiro › Contas bancárias.</p>}
        <p className="text-[12px] text-slate-500">
          {comDif.length ? `${comDif.length} dia(s) com diferença. ` : temBanco ? "O saldo bate em todos os dias. " : ""}
          Com um saldo do banco conhecido, os outros dias são calculados pelo extrato. A linha em vermelho é o dia em que a diferença mudou: ali há uma linha do extrato sem conciliar, uma baixa feita à mão com outra data ou conta, ou um lançamento que falta no extrato.
          Movimento do sistema diferente do extrato aparece em destaque.
        </p>
      </div>
    </Pagina>
  );
}
