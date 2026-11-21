import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { exigirArea } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { configPagSeguroTela } from "@/lib/pagseguro/pagseguro";
import { conciliarAgoraAcao, ignorarTransacaoAcao, reconsiderarTransacaoAcao } from "@/lib/pagseguro/acoes";
import { mesAnterior, mesAtual } from "@/lib/fiscal/impostos";
import { brl, dataHora } from "@/lib/ui/format";
import { Pagina, Pilula, RodapeLista } from "@/components/ui/Pagina";
import Resumo from "@/components/ui/Resumo";
import BotaoAcao from "@/components/ui/BotaoAcao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conciliação PagSeguro" };

const SIT: Record<string, [string, string]> = {
  SEM_CONTA: ["Sem conta no sistema", "border-red-300 bg-red-50 text-red-700"], CONCILIADA: ["A receber", "border-amber-300 bg-amber-50 text-amber-800"],
  RECEBIDA: ["Recebida", "border-emerald-300 bg-emerald-50 text-emerald-700"], IGNORADA: ["Ignorada", "border-slate-300 bg-slate-100 text-slate-500"],
};
const dataSP = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" }); // colunas @db.Date
const MEIO: Record<string, string> = { CREDITO: "Crédito", DEBITO: "Débito", PIX: "PIX", OUTRO: "Outro" };
const nomeMes = (c: string) => { const t = new Date(`${c}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); return t[0].toUpperCase() + t.slice(1); };
const proximo = (c: string) => { const [a, m] = c.split("-").map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`; };

/** Financeiro → Conciliação PagSeguro: vendas da maquininha e PIX lidas do EDI e a conta a receber de cada uma. */
export default async function PagSeguroPagina({ searchParams }: { searchParams: Promise<{ mes?: string; situacao?: string }> }) {
  await exigirArea("/pagseguro");
  const sp = await searchParams;
  const comp = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : mesAtual();
  const [a, m] = comp.split("-").map(Number);
  const where: Prisma.TransacaoPagSeguroWhereInput = { dataVenda: { gte: new Date(Date.UTC(a, m - 1, 1, 3)), lt: new Date(Date.UTC(m === 12 ? a + 1 : a, m === 12 ? 0 : m, 1, 3)) } };
  const sit = sp.situacao && SIT[sp.situacao] ? sp.situacao : "";
  const [c, todas] = await Promise.all([configPagSeguroTela(), prisma.transacaoPagSeguro.findMany({ where, orderBy: [{ dataVenda: "desc" }, { parcela: "asc" }], take: 1000 })]);
  const lista = sit ? todas.filter((t) => t.situacao === sit) : todas;
  const lancs = new Map((await prisma.lancamento.findMany({ where: { id: { in: lista.map((t) => t.lancamentoId).filter((x): x is string => !!x) } }, select: { id: true, descricao: true, origemTipo: true, origemId: true } })).map((l) => [l.id, l]));
  const validas = todas.filter((t) => t.situacao !== "IGNORADA");
  const soma = (ts: typeof todas, k: "valorBruto" | "taxa" | "valorLiquido") => ts.reduce((s, t) => s + Number(t[k]), 0);
  const aReceber = validas.filter((t) => !t.pagaEm);
  const semConta = todas.filter((t) => t.situacao === "SEM_CONTA");
  const link = (p: Record<string, string>) => `/pagseguro?${new URLSearchParams({ mes: comp, ...(sit ? { situacao: sit } : {}), ...p })}`;
  const filtro = (s: string) => ({ href: sit === s ? `/pagseguro?mes=${comp}` : `/pagseguro?mes=${comp}&situacao=${s}`, ativo: sit === s });
  const bruto = soma(validas, "valorBruto");
  const docLink = (l?: { origemTipo: string | null; origemId: string | null; descricao: string }) =>
    !l ? null : l.origemTipo === "VENDA" ? `/vendas/${l.origemId}` : l.origemTipo === "OS" ? `/os/${l.origemId}` : null;

  return (
    <Pagina titulo="Conciliação PagSeguro" icone="cartao" trilha={[{ rotulo: "Financeiro", href: "/financeiro" }, { rotulo: "Conciliação PagSeguro" }]}
      acoes={<><Link href="/pagseguro/configuracoes" className="btn-sec">Configurar</Link>{c.edi && <BotaoAcao acao={conciliarAgoraAcao} icone="atualizar" className="btn-sec">Conciliar agora</BotaoAcao>}</>}>
      {!c.edi && <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">A conciliação pelo EDI está desligada. <Link href="/pagseguro/configuracoes" className="underline">Informe o usuário e o token do EDI</Link> para trazer as vendas da maquininha com a taxa real.</p>}
      <div className="mb-3 flex items-center justify-end gap-1">
        <Link href={link({ mes: mesAnterior(comp) })} className="btn-sec">‹</Link>
        <span className="min-w-36 text-center text-[14px] font-semibold">{nomeMes(comp)}</span>
        <Link href={link({ mes: proximo(comp) })} className="btn-sec">›</Link>
      </div>
      <Resumo cartoes={[
        { rotulo: "Vendido no PagSeguro", valor: brl(bruto), legenda: `${validas.length} transaç${validas.length === 1 ? "ão" : "ões"} (parcelas)`, icone: "total", cor: "tinta", pct: 100 },
        { rotulo: "Taxas", valor: brl(soma(validas, "taxa")), legenda: bruto ? `${((soma(validas, "taxa") / bruto) * 100).toFixed(2).replace(".", ",")}% do vendido` : "—", icone: "percentual", cor: "roxo", pct: bruto ? (soma(validas, "taxa") / bruto) * 100 : 0 },
        { rotulo: "A receber", valor: brl(soma(aReceber, "valorLiquido")), legenda: "líquido, nas datas de repasse", icone: "hoje", cor: "amarelo", pct: bruto ? (soma(aReceber, "valorBruto") / bruto) * 100 : 0, ...filtro("CONCILIADA") },
        { rotulo: "Recebido", valor: brl(soma(validas.filter((t) => t.pagaEm), "valorLiquido")), legenda: "já caiu na conta PagSeguro", icone: "confirmado", cor: "verde", pct: bruto ? (soma(validas.filter((t) => t.pagaEm), "valorBruto") / bruto) * 100 : 0, ...filtro("RECEBIDA") },
        { rotulo: "Sem conta no sistema", valor: String(semConta.length), legenda: semConta.length ? "vendas na maquininha sem venda no MXERP" : "tudo conciliado", icone: "atrasado", cor: "vermelho", pct: validas.length ? (semConta.length / validas.length) * 100 : 0, ...filtro("SEM_CONTA") },
      ]} />
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Data da venda</th><th>Meio</th><th>Cartão / NSU</th><th className="text-right">Bruto</th><th className="text-right">Taxa</th><th className="text-right">Líquido</th><th>Repasse</th><th>Conta no sistema</th><th>Situação</th><th className="w-24"></th></tr></thead>
          <tbody>
            {lista.map((t) => {
              const l = t.lancamentoId ? lancs.get(t.lancamentoId) : undefined;
              const href = docLink(l);
              const [rot, cor] = SIT[t.situacao] ?? SIT.SEM_CONTA;
              return (
                <tr key={t.id}>
                  <td>{dataHora(t.dataVenda)}</td>
                  <td>{MEIO[t.meio] ?? t.meio}{t.totalParcelas > 1 && <span className="text-[11px] text-slate-500"> {t.parcela}/{t.totalParcelas}</span>}</td>
                  <td className="text-[12px]">{t.cartao ?? "—"}{t.nsu && <div className="text-[11px] text-slate-500">NSU {t.nsu}</div>}</td>
                  <td className="text-right">{brl(t.valorBruto)}</td>
                  <td className="text-right text-slate-600">{brl(t.taxa)}</td>
                  <td className="text-right font-semibold">{brl(t.valorLiquido)}</td>
                  <td>{t.pagaEm ? <span className="text-emerald-700">{dataSP(t.pagaEm)}</span> : t.dataPrevista ? `previsto ${dataSP(t.dataPrevista)}` : "—"}</td>
                  <td>{l ? (href ? <Link href={href} className="text-marca hover:underline">{l.descricao}</Link> : l.descricao) : <span className="text-slate-400">—</span>}</td>
                  <td><Pilula rotulo={rot} cor={cor} /></td>
                  <td className="text-right">
                    {t.situacao === "SEM_CONTA" && <BotaoAcao acao={ignorarTransacaoAcao.bind(null, t.id)} className="btn-sec py-1 text-[12px]" confirmar="Ignorar esta transação? Ela não será mais conciliada.">Ignorar</BotaoAcao>}
                    {t.situacao === "IGNORADA" && <BotaoAcao acao={reconsiderarTransacaoAcao.bind(null, t.id)} className="btn-sec py-1 text-[12px]">Conciliar</BotaoAcao>}
                  </td>
                </tr>
              );
            })}
            {!lista.length && <tr><td colSpan={10} className="py-8 text-center text-slate-500">Nenhuma transação {sit ? "nesta situação" : "neste mês"}.</td></tr>}
          </tbody>
        </table>
        <RodapeLista total={lista.length} mostrando={lista.length} />
      </div>
      <p className="mt-2 text-[12px] text-slate-500">&quot;Sem conta no sistema&quot;: a venda foi passada na maquininha mas não achamos a conta a receber (forma do PagSeguro, mesmo valor, parcela e dia). Lance a venda no PDV com a forma do PagSeguro e ela se liga na próxima conciliação.</p>
    </Pagina>
  );
}
