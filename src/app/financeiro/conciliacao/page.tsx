import Link from "next/link";
import { prisma } from "@/lib/db";
import { sugestoes } from "@/lib/financeiro/extrato";
import { interConfigurado } from "@/lib/financeiro/inter";
import { garantirPadroes } from "@/lib/financeiro/padroes";
import { brl, data } from "@/lib/ui/format";
import { conciliar, desfazer, ignorar, lancarAvulso } from "./actions";
import { ConfirmarSugestoes, EnviarExtrato, PuxarInter } from "./Formularios";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conciliação bancária" };

const DIA = 86400000;

export default async function Conciliacao({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const sp = await searchParams;
  await prisma.$transaction((tx) => garantirPadroes(tx));
  const [contas, pendentes, recentes, categorias, sug, inter] = await Promise.all([
    prisma.contaBancaria.findMany({ where: { ativa: true }, orderBy: { nome: "asc" } }),
    prisma.transacaoBancaria.findMany({ where: { situacao: "PENDENTE" }, include: { contaBancaria: true }, orderBy: { data: "asc" }, take: 300 }),
    prisma.transacaoBancaria.findMany({
      where: { situacao: { in: ["CONCILIADA", "IGNORADA"] } }, include: { contaBancaria: true, lancamentos: { include: { pessoa: true } } },
      orderBy: { data: "desc" }, take: sp.ver === "todas" ? 500 : 30,
    }),
    prisma.categoriaFinanceira.findMany({ orderBy: { nome: "asc" } }),
    sugestoes(),
    prisma.integracaoInter.findUnique({ where: { id: "inter" }, select: { ultimoTesteOk: true, ultimoTesteMsg: true, ultimaSincEm: true, ultimaSincMsg: true } }),
  ]);
  const configurado = await interConfigurado();
  const sugPor = new Map(sug.map((s) => [s.transacaoId, s]));
  // candidatos para escolha manual: contas em aberto do mesmo tipo, valor até 10% de diferença, vencimento perto
  const abertos = pendentes.length
    ? await prisma.lancamento.findMany({
        where: {
          pagoEm: null,
          vencimento: { gte: new Date(pendentes[0].data.getTime() - 90 * DIA), lte: new Date(pendentes[pendentes.length - 1].data.getTime() + 30 * DIA) },
        },
        include: { pessoa: true },
        orderBy: { vencimento: "asc" },
      })
    : [];
  const sugeridos = new Map(abertos.map((l) => [l.id, l]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Conciliação bancária</h1>
        <Link href="/financeiro" className="btn-sec">Voltar ao financeiro</Link>
      </div>
      <p className="max-w-3xl text-sm text-slate-600">
        Cada saída do extrato é casada com uma conta a pagar em aberto de mesmo valor e data próxima. O que casa sem dúvida
        (nome bate, ou só existe uma conta possível) é baixado na hora, com a data e a conta do extrato. Contas a receber
        não são baixadas por valor e data: as de boleto são baixadas sozinhas quando o Inter avisa o pagamento (e a entrada
        do extrato é amarrada pelo nosso número). O resto fica abaixo para você confirmar, escolher outra conta, lançar como
        despesa/receita avulsa (tarifa, rendimento) ou ignorar.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <EnviarExtrato contas={contas} />
        <PuxarInter
          configurado={configurado}
          aviso={inter?.ultimoTesteOk === false ? inter.ultimoTesteMsg : null}
          ultima={inter?.ultimaSincEm ? `Última busca: ${inter.ultimaSincEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })} · ${inter.ultimaSincMsg ?? ""}` : null}
        />
      </div>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">A conciliar ({pendentes.length})</h2>
          <ConfirmarSugestoes n={sug.filter((x) => x.tipo === "PAGAR").length} />
        </div>
        {pendentes.length === 0 ? (
          <p className="cartao p-4 text-sm text-slate-600">Nada pendente.</p>
        ) : (
          <div className="cartao divide-y">
            {pendentes.map((t) => {
              const v = Number(t.valor);
              const tipo = v < 0 ? "PAGAR" : "RECEBER";
              const s = sugPor.get(t.id);
              const sl = s ? sugeridos.get(s.lancamentoId) : null;
              const cands = abertos
                .filter((l) => l.tipo === tipo && Math.abs(Number(l.valor) - Math.abs(v)) <= Math.abs(v) * 0.1 + 0.01)
                .sort((a, b) => Math.abs(a.vencimento.getTime() - t.data.getTime()) - Math.abs(b.vencimento.getTime() - t.data.getTime()))
                .slice(0, 15);
              return (
                <div key={t.id} className="grid gap-2 p-3 text-sm lg:grid-cols-[110px_1fr_120px_2fr]">
                  <div className="text-slate-600">{data(t.data)}<div className="text-xs">{t.contaBancaria.nome}</div></div>
                  <div className="break-words">{t.descricao}</div>
                  <div className={`text-right font-semibold ${v < 0 ? "text-red-600" : "text-emerald-700"}`}>{brl(v)}</div>
                  <div className="space-y-2">
                    {sl && (
                      <form action={conciliar} className="flex flex-wrap items-center gap-2 rounded bg-amber-50 p-2">
                        <input type="hidden" name="transacaoId" value={t.id} />
                        <input type="hidden" name="lancamentoId" value={sl.id} />
                        <span className="flex-1">Sugestão: <b>{sl.descricao}</b>{sl.pessoa ? ` · ${sl.pessoa.nome}` : ""} · venc. {data(sl.vencimento)}</span>
                        <button className="btn">Confirmar</button>
                      </form>
                    )}
                    <form action={conciliar} className="flex flex-wrap gap-2">
                      <input type="hidden" name="transacaoId" value={t.id} />
                      <select name="lancamentoId" className="campo min-w-0 flex-1" required defaultValue="">
                        <option value="" disabled>{cands.length ? "Baixar outra conta…" : "Nenhuma conta parecida em aberto"}</option>
                        {cands.map((l) => <option key={l.id} value={l.id}>{data(l.vencimento)} · {brl(l.valor)} · {l.descricao}{l.pessoa ? ` · ${l.pessoa.nome}` : ""}</option>)}
                      </select>
                      <button className="btn-sec" disabled={!cands.length}>Baixar</button>
                    </form>
                    <div className="flex flex-wrap gap-2">
                      <form action={lancarAvulso} className="flex min-w-0 flex-1 gap-2">
                        <input type="hidden" name="transacaoId" value={t.id} />
                        <select name="categoriaId" className="campo min-w-0 flex-1" required defaultValue="">
                          <option value="" disabled>Lançar como {tipo === "PAGAR" ? "despesa" : "receita"}…</option>
                          {categorias.filter((c) => c.tipo === tipo).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                        <button className="btn-sec">Lançar</button>
                      </form>
                      <form action={ignorar}>
                        <input type="hidden" name="transacaoId" value={t.id} />
                        <button className="btn-sec">Ignorar</button>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Já conciliadas</h2>
          {sp.ver !== "todas" && <Link href="/financeiro/conciliacao?ver=todas" className="text-sm underline">ver mais</Link>}
        </div>
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Data</th><th>Extrato</th><th className="text-right">Valor</th><th>Baixou</th><th></th></tr></thead>
            <tbody>
              {recentes.map((t) => (
                <tr key={t.id}>
                  <td>{data(t.data)}</td>
                  <td>{t.descricao}<div className="text-xs text-slate-500">{t.contaBancaria.nome}</div></td>
                  <td className={`text-right ${Number(t.valor) < 0 ? "text-red-600" : "text-emerald-700"}`}>{brl(t.valor)}</td>
                  <td className="text-slate-600">{t.situacao === "IGNORADA" ? "Ignorada" : t.lancamentos.map((l) => `${l.descricao}${l.pessoa ? ` (${l.pessoa.nome})` : ""}`).join("; ")}</td>
                  <td>
                    <form action={desfazer}>
                      <input type="hidden" name="transacaoId" value={t.id} />
                      <button className="text-sm text-slate-600 underline">desfazer</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
