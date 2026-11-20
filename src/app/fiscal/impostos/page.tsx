import Link from "next/link";
import { Pagina, Bloco } from "@/components/ui/Pagina";
import { exigirArea } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { lojaAtual, nomeLoja } from "@/lib/empresa/atual";
import { aliquotasDoMes, estimativaDoMes, mesAnterior, mesAtual } from "@/lib/fiscal/impostos";
import FormAliquotas from "./FormAliquotas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Imposto aproximado (Simples)" };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`;
const nomeMes = (c: string) => { const t = new Date(`${c}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); return t[0].toUpperCase() + t.slice(1); };
const proximo = (c: string) => { const [a, m] = c.split("-").map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`; };

/** Imposto aproximado do Simples Nacional do mês, pela alíquota efetiva por CNAE que o contador informa. */
export default async function Impostos({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await exigirArea("/fiscal");
  const sp = await searchParams;
  const comp = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : mesAtual();
  const e = await lojaAtual();
  if (!e) return <Pagina titulo="Imposto aproximado" icone="notas" trilha={[{ rotulo: "Fiscal" }]}><p>Cadastre a empresa em Configurações › Empresas.</p></Pagina>;
  const [est, aliq, servicos] = await Promise.all([
    estimativaDoMes(e.id, comp), aliquotasDoMes(e.id, comp),
    prisma.servico.findMany({ where: { cnae: { not: null } }, select: { cnae: true }, distinct: ["cnae"] }),
  ]);
  const sugestoes = [...new Set([e.cnae, ...servicos.map((s) => s.cnae)].map((c) => (c ?? "").replace(/\D/g, "")).filter((c) => c.length === 7))];
  return (
    <Pagina titulo="Imposto aproximado (Simples Nacional)" icone="notas" trilha={[{ rotulo: "Fiscal", href: "/fiscal" }, { rotulo: "Imposto aproximado" }]}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={`/fiscal/impostos?mes=${mesAnterior(comp)}`} className="btn-sec">‹</Link>
        <span className="min-w-40 text-center font-semibold">{nomeMes(comp)}</span>
        <Link href={`/fiscal/impostos?mes=${proximo(comp)}`} className="btn-sec">›</Link>
        <span className="ml-2 text-[13px] text-slate-500 uppercase">{nomeLoja(e)}</span>
      </div>
      <div className="mb-3 grid gap-3 md:grid-cols-4">
        <Cartao rotulo="Notas autorizadas no mês" valor={String(est.quantidade)} sub={est.canceladas ? `${est.canceladas} cancelada(s)` : "produção"} />
        <Cartao rotulo="Faturado em notas" valor={brl(est.total)} sub={`NF-e ${brl(est.porModelo.NFE)} · NFC-e ${brl(est.porModelo.NFCE)} · NFS-e ${brl(est.porModelo.NFSE)}`} />
        <Cartao rotulo="Imposto aproximado (DAS)" valor={brl(est.imposto)} sub={est.total ? `alíquota média ${pct(est.imposto / est.total * 100)}` : "—"} destaque />
        <Cartao rotulo="Alíquotas do mês" valor={String(aliq.length)} sub={aliq.length ? "informadas" : "informe abaixo"} />
      </div>
      {est.semAliquota.length > 0 && <p className="mb-3 rounded border border-amber-300 bg-amber-50 p-2 text-[13px] text-amber-800">Sem alíquota para o CNAE {est.semAliquota.join(", ")}: informe abaixo (ou a linha “*”) para entrar no cálculo.</p>}
      <Bloco icone="grafico" titulo={<>Cálculo por <b>atividade (CNAE)</b></>} subtitulo="Soma das notas autorizadas em produção no mês × alíquota efetiva do CNAE. Estimativa: o valor do DAS é o do PGDAS-D do contador." corpo="p-0">
        <table className="tabela">
          <thead><tr><th>CNAE</th><th>Atividade</th><th className="text-right">Notas</th><th className="text-right">Faturamento</th><th className="text-right">Alíquota efetiva</th><th className="text-right">Imposto aproximado</th></tr></thead>
          <tbody>
            {est.linhas.map((l) => (
              <tr key={l.cnae}><td>{l.cnae}</td><td>{l.descricao ?? ""}</td><td className="text-right">{l.notas}</td><td className="text-right">{brl(l.valor)}</td>
                <td className="text-right">{l.aliquota == null ? <span className="text-amber-700">sem alíquota</span> : pct(l.aliquota)}</td><td className="text-right font-semibold">{brl(l.imposto)}</td></tr>
            ))}
            {!est.linhas.length && <tr><td colSpan={6} className="py-6 text-center text-slate-500">Nenhuma nota autorizada em produção neste mês.</td></tr>}
            {est.linhas.length > 0 && <tr className="font-semibold"><td colSpan={3}>Total</td><td className="text-right">{brl(est.total)}</td><td /><td className="text-right">{brl(est.imposto)}</td></tr>}
          </tbody>
        </table>
      </Bloco>
      <Bloco icone="percentual" titulo={<>Alíquotas efetivas de <b>{nomeMes(comp)}</b></>} subtitulo="Copie do e-mail do contador: uma linha por CNAE.">
        <FormAliquotas key={comp} competencia={comp} sugestoes={sugestoes}
          inicial={aliq.map((a) => ({ cnae: a.cnae, descricao: a.descricao ?? "", aliquota: Number(a.aliquota).toLocaleString("pt-BR", { maximumFractionDigits: 4 }) }))} />
      </Bloco>
    </Pagina>
  );
}

function Cartao({ rotulo, valor, sub, destaque }: { rotulo: string; valor: string; sub?: string; destaque?: boolean }) {
  return (
    <div className={`cartao p-3 ${destaque ? "border-marca" : ""}`}>
      <div className="text-[12px] text-slate-500">{rotulo}</div>
      <div className={`text-[20px] font-semibold ${destaque ? "text-marca" : ""}`}>{valor}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}
