import Link from "next/link";
import BoletoParcela from "@/components/BoletoParcela";
import { baseLinks, boletosDisponiveis } from "@/lib/financeiro/boletos";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { garantirPadroes } from "@/lib/financeiro/padroes";
import { saldosContas } from "@/lib/financeiro/lancamentos";
import { diaSP, somarDias } from "@/lib/datas";
import { brl, data } from "@/lib/ui/format";
import { baixar, estornar, excluir, novaConta, novoLancamento } from "./actions";

export const dynamic = "force-dynamic";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function Financeiro({ searchParams }: {
  searchParams: Promise<{ tipo?: string; f?: string; de?: string; ate?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const tipo = sp.tipo === "PAGAR" ? "PAGAR" : "RECEBER";
  const f = sp.f ?? "abertos";
  const hoje = diaSP();
  await prisma.$transaction((tx) => garantirPadroes(tx));

  const where: Prisma.LancamentoWhereInput = { tipo };
  if (f === "abertos") where.pagoEm = null;
  if (f === "vencidos") Object.assign(where, { pagoEm: null, vencimento: { lt: hoje } });
  if (f === "pagos") where.pagoEm = { not: null };
  if (sp.de || sp.ate) where.vencimento = { ...(sp.de ? { gte: new Date(sp.de + "T00:00:00Z") } : {}), ...(sp.ate ? { lte: new Date(sp.ate + "T00:00:00Z") } : {}) };
  if (sp.q) where.OR = [{ descricao: { contains: sp.q, mode: "insensitive" } }, { pessoa: { nome: { contains: sp.q, mode: "insensitive" } } }];

  const [lista, contas, categorias, formas, saldos, resumo] = await Promise.all([
    prisma.lancamento.findMany({ where, include: { pessoa: true, categoria: true, contaBancaria: true, formaPagamento: true, boletos: { orderBy: { createdAt: "desc" } } }, orderBy: [{ vencimento: "asc" }], take: 300 }),
    prisma.contaBancaria.findMany({ where: { ativa: true }, orderBy: { nome: "asc" } }),
    prisma.categoriaFinanceira.findMany({ where: { tipo }, orderBy: { nome: "asc" } }),
    prisma.formaPagamento.findMany({ where: { ativa: true }, orderBy: { nome: "asc" } }),
    prisma.$transaction((tx) => saldosContas(tx)),
    prisma.$queryRaw<{ tipo: string; vencido: number; hoje: number; prox7: number }[]>`
      SELECT tipo::text,
             COALESCE(SUM(valor) FILTER (WHERE vencimento < ${hoje}), 0)::float vencido,
             COALESCE(SUM(valor) FILTER (WHERE vencimento = ${hoje}), 0)::float hoje,
             COALESCE(SUM(valor) FILTER (WHERE vencimento > ${hoje} AND vencimento <= ${somarDias(hoje, 7)}), 0)::float prox7
        FROM "Lancamento" WHERE "pagoEm" IS NULL GROUP BY tipo`,
  ]);
  const [interAtivo, baseCliente] = await Promise.all([boletosDisponiveis(), baseLinks()]);
  const r = (t: string) => resumo.find((x) => x.tipo === t) ?? { vencido: 0, hoje: 0, prox7: 0 };
  const total = lista.reduce((s, l) => s + Number(l.valor), 0);
  const link = (p: Record<string, string>) => `/financeiro?${new URLSearchParams({ tipo, f, ...p })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Financeiro</h1>
        <div className="flex gap-2">
          <Link href="/financeiro/conciliacao" className="btn-sec">Conciliação bancária</Link>
          <Link href="/financeiro/dre" className="btn-sec">DRE gerencial</Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="cartao p-4">
          <div className="mb-1 text-xs text-slate-500">Saldos</div>
          {saldos.map((c) => (
            <div key={c.id} className="flex justify-between text-sm"><span>{c.nome}</span><span className={c.saldo < 0 ? "text-red-600" : ""}>{brl(c.saldo)}</span></div>
          ))}
          <div className="mt-1 flex justify-between border-t pt-1 text-sm font-semibold"><span>Total</span><span>{brl(saldos.reduce((s, c) => s + c.saldo, 0))}</span></div>
        </div>
        {(["RECEBER", "PAGAR"] as const).map((t) => (
          <div key={t} className="cartao p-4 text-sm">
            <div className="mb-1 text-xs text-slate-500">{t === "RECEBER" ? "A receber" : "A pagar"}</div>
            <div className="flex justify-between"><span>Vencido</span><span className="text-red-600">{brl(r(t).vencido)}</span></div>
            <div className="flex justify-between"><span>Hoje</span><span>{brl(r(t).hoje)}</span></div>
            <div className="flex justify-between"><span>Próximos 7 dias</span><span>{brl(r(t).prox7)}</span></div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["RECEBER", "PAGAR"] as const).map((t) => (
          <Link key={t} href={`/financeiro?tipo=${t}&f=${f}`} className={t === tipo ? "btn" : "btn-sec"}>{t === "RECEBER" ? "Contas a receber" : "Contas a pagar"}</Link>
        ))}
        <span className="mx-2 text-slate-300">|</span>
        {[["abertos", "Em aberto"], ["vencidos", "Vencidos"], ["pagos", tipo === "PAGAR" ? "Pagos" : "Recebidos"], ["todos", "Todos"]].map(([k, rot]) => (
          <Link key={k} href={link({ f: k })} className={`rounded px-2 py-1 text-sm ${k === f ? "bg-slate-200 font-medium" : "text-slate-600 hover:bg-slate-100"}`}>{rot}</Link>
        ))}
        <form className="ml-auto flex gap-2">
          <input type="hidden" name="tipo" value={tipo} /><input type="hidden" name="f" value={f} />
          <input type="date" name="de" defaultValue={sp.de} className="campo w-40" aria-label="De" />
          <input type="date" name="ate" defaultValue={sp.ate} className="campo w-40" aria-label="Até" />
          <input name="q" defaultValue={sp.q} placeholder="Descrição ou pessoa" className="campo w-48" />
          <button className="btn-sec">Filtrar</button>
        </form>
      </div>

      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Vencimento</th><th>Descrição</th><th>Pessoa</th><th>Categoria</th><th className="text-right">Valor</th><th>Situação</th></tr></thead>
          <tbody>
            {lista.map((l) => {
              const vencido = !l.pagoEm && l.vencimento < hoje;
              return (
                <tr key={l.id}>
                  <td className={vencido ? "font-semibold text-red-600" : ""}>{data(l.vencimento)}</td>
                  <td>{l.descricao}</td>
                  <td className="text-slate-600">{l.pessoa?.nome}</td>
                  <td className="text-xs text-slate-600">{l.categoria.nome}</td>
                  <td className="text-right">{brl(l.valor)}</td>
                  <td className="min-w-80">
                    {l.pagoEm ? (
                      <form action={estornar} className="flex items-center gap-2 text-xs">
                        <input type="hidden" name="id" value={l.id} />
                        <span className="text-emerald-700">{tipo === "PAGAR" ? "pago" : "recebido"} {data(l.pagoEm)} · {brl(l.valorPago)} · {l.contaBancaria?.nome}</span>
                        <button className="text-slate-500 hover:underline">estornar</button>
                      </form>
                    ) : (
                      <form action={baixar} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={l.id} />
                        <input type="date" name="data" defaultValue={iso(hoje)} className="campo w-36 py-1" aria-label="Data" />
                        <select name="contaBancariaId" defaultValue={l.contaBancariaId ?? contas[0]?.id} className="campo w-28 py-1" aria-label="Conta">
                          {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                        <input name="juros" placeholder="juros" className="campo w-16 py-1" />
                        <button className="btn px-2 py-1 text-xs">{tipo === "PAGAR" ? "Pagar" : "Receber"}</button>
                      </form>
                    )}
                    {l.tipo === "RECEBER" && (l.boletos.length > 0 || l.formaPagamento?.boletoInter) && <BoletoParcela parcela={l} cliente={l.pessoa} base={baseCliente} interAtivo={interAtivo} compacto />}
                    {!l.pagoEm && !l.origemTipo && (
                      <form action={excluir}><input type="hidden" name="id" value={l.id} /><button className="text-xs text-red-600 hover:underline">excluir</button></form>
                    )}
                  </td>
                </tr>
              );
            })}
            {!lista.length && <tr><td colSpan={6} className="py-8 text-center text-slate-500">Nada por aqui.</td></tr>}
          </tbody>
          <tfoot><tr><td colSpan={4} className="px-3 py-2 text-right text-sm font-semibold">Total</td><td className="px-3 py-2 text-right font-semibold">{brl(total)}</td><td></td></tr></tfoot>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <form action={novoLancamento} className="cartao grid gap-2 p-4 md:grid-cols-3">
          <h2 className="font-semibold md:col-span-3">Nova conta {tipo === "PAGAR" ? "a pagar" : "a receber"}</h2>
          <input type="hidden" name="tipo" value={tipo} />
          <input name="descricao" required className="campo md:col-span-2" placeholder="Descrição" />
          <input name="valor" required className="campo" placeholder="Valor total" />
          <select name="categoriaId" required className="campo">
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <input type="date" name="vencimento" required defaultValue={iso(hoje)} className="campo" aria-label="Vencimento" />
          <select name="parcelas" className="campo" defaultValue="1">
            {Array.from({ length: 24 }, (_, i) => <option key={i} value={i + 1}>{i + 1}x mensal</option>)}
          </select>
          <select name="formaPagamentoId" className="campo">
            <option value="">Forma de pagamento</option>
            {formas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
          <button className="btn md:col-span-2">Lançar</button>
        </form>
        <form action={novaConta} className="cartao space-y-2 p-4">
          <h2 className="font-semibold">Nova conta bancária</h2>
          <input name="nome" required className="campo" placeholder="Nome (ex.: Inter PJ)" />
          <input name="banco" className="campo" placeholder="Banco" />
          <input name="saldoInicial" className="campo" placeholder="Saldo inicial" />
          <button className="btn-sec w-full">Adicionar</button>
        </form>
      </div>
    </div>
  );
}
