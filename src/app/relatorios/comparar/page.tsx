import Link from "next/link";
import { Pagina } from "@/components/ui/Pagina";
import BotaoImprimir from "@/app/os/[id]/separacao/BotaoImprimir";
import Favoritos from "@/components/relatorios/Favoritos";
import { brl, pct } from "@/components/relatorios/Barra";
import { compararPeriodos, variacao } from "@/lib/relatorios/painel";
import { diaSP, periodoDia } from "@/lib/datas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Comparar meses" };

const COR = { a: "#018e83", b: "#94a3b8" };
const chaveMes = (d: Date) => d.toISOString().slice(0, 7);

function Delta({ a, b, pontos = false }: { a: number; b: number; pontos?: boolean }) {
  const v = pontos ? a - b : variacao(a, b);
  if (v === null) return <span className="text-slate-400">—</span>;
  const cor = Math.abs(v) < 0.005 ? "text-slate-500" : v > 0 ? "text-emerald-700" : "text-red-600";
  const txt = pontos ? `${(Math.abs(v) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.` : pct(Math.abs(v));
  return <span className={cor}>{Math.abs(v) < 0.005 ? "=" : v > 0 ? "▲" : "▼"} {txt}</span>;
}

/** Tabela "A × B" com barras pareadas (cor do mês A e do mês B) e a variação. */
function Lado({ titulo, linhas, ra, rb, href }: {
  titulo: string; linhas: { chave: string; rotulo: string; a: number; b: number }[]; ra: string; rb: string; href?: (chave: string) => string | undefined;
}) {
  const max = Math.max(1, ...linhas.flatMap((l) => [l.a, l.b]));
  return (
    <div className="cartao overflow-x-auto">
      <h3 className="border-b px-4 py-3 text-[14px] font-semibold text-slate-700">{titulo}</h3>
      <table className="tabela">
        <thead><tr><th></th><th className="text-right">{ra}</th><th className="text-right">{rb}</th><th className="text-right">Variação</th></tr></thead>
        <tbody>
          {linhas.map((l) => {
            const h = href?.(l.chave);
            return (
              <tr key={l.chave}>
                <td className="min-w-40">
                  {h ? <Link href={h} className="text-marca hover:underline">{l.rotulo}</Link> : l.rotulo}
                  <div className="mt-1 space-y-[2px]" aria-hidden>
                    <div className="h-1.5 rounded" style={{ width: `${(l.a / max) * 100}%`, background: COR.a }} />
                    <div className="h-1.5 rounded" style={{ width: `${(l.b / max) * 100}%`, background: COR.b }} />
                  </div>
                </td>
                <td className="text-right tabular-nums">{brl(l.a)}</td><td className="text-right tabular-nums">{brl(l.b)}</td>
                <td className="text-right"><Delta a={l.a} b={l.b} /></td>
              </tr>
            );
          })}
          {!linhas.length && <tr><td colSpan={4} className="py-6 text-center text-slate-500">Nada nos dois meses.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default async function Comparar({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const hoje = diaSP();
  const padraoA = chaveMes(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1)));
  const ka = /^\d{4}-\d{2}$/.test(sp.a ?? "") ? sp.a! : padraoA;
  const [ya, ma] = ka.split("-").map(Number);
  const kb = /^\d{4}-\d{2}$/.test(sp.b ?? "") ? sp.b! : chaveMes(new Date(Date.UTC(ya, ma - 2, 1)));
  const pa = periodoDia(ka)!, pb = periodoDia(kb)!;
  const r = await compararPeriodos(pa, pb, { vendedorId: sp.vendedor || undefined });
  const ra = pa.rotulo, rb = pb.rotulo;
  const anoPassado = `${ya - 1}-${String(ma).padStart(2, "0")}`;

  const linhasTotais: [string, number, number, "brl" | "pct" | "n"][] = [
    ["Faturamento", r.a.receita, r.b.receita, "brl"], ["Vendas (pedidos e balcão)", r.a.vendas, r.b.vendas, "brl"], ["Ordens de serviço", r.a.os, r.b.os, "brl"],
    ["Custo das peças", r.a.custo, r.b.custo, "brl"], ["Lucro bruto", r.a.lucro, r.b.lucro, "brl"], ["Margem", r.a.margem, r.b.margem, "pct"],
    ["Vendas/OS concluídas", r.a.documentos, r.b.documentos, "n"], ["Ticket médio", r.a.ticket, r.b.ticket, "brl"],
  ];
  const fmt = (v: number, t: "brl" | "pct" | "n") => (t === "brl" ? brl(v) : t === "pct" ? pct(v) : v.toLocaleString("pt-BR"));

  return (
    <Pagina titulo="Comparar meses" icone="comparar" trilha={[{ rotulo: "Relatórios", href: "/relatorios" }, { rotulo: "Comparar meses" }]}>
      <form className="no-print mb-3 flex flex-wrap items-end gap-2" action="/relatorios/comparar">
        {sp.vendedor && <input type="hidden" name="vendedor" value={sp.vendedor} />}
        <label><span className="rotulo flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COR.a }} />Mês</span><input type="month" name="a" defaultValue={ka} className="campo" /></label>
        <span className="pb-2 text-slate-500">×</span>
        <label><span className="rotulo flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COR.b }} />Comparar com</span><input type="month" name="b" defaultValue={kb} className="campo" /></label>
        <button className="btn">Comparar</button>
        <Link href={`/relatorios/comparar?a=${ka}&b=${anoPassado}`} className="btn-sec">Mesmo mês do ano passado</Link>
        <div className="ml-auto flex items-center gap-2"><Favoritos /><BotaoImprimir /></div>
      </form>

      <div className="cartao mb-3 overflow-x-auto">
        <table className="tabela">
          <thead><tr><th></th><th className="text-right">{ra}</th><th className="text-right">{rb}</th><th className="text-right">Diferença</th><th className="text-right">Variação</th></tr></thead>
          <tbody>
            {linhasTotais.map(([rot, a, b, t]) => (
              <tr key={rot} className={rot === "Faturamento" || rot === "Lucro bruto" ? "font-semibold" : ""}>
                <td>{rot}</td><td className="text-right">{fmt(a, t)}</td><td className="text-right">{fmt(b, t)}</td>
                <td className="text-right">{t === "pct" ? "" : `${a - b >= 0 ? "+" : "−"}${fmt(Math.abs(a - b), t)}`}</td>
                <td className="text-right"><Delta a={a} b={b} pontos={t === "pct"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Lado titulo="Clientes" linhas={r.clientes} ra={ra} rb={rb} href={(id) => (id === "-" ? undefined : `/clientes/${id}`)} />
        <Lado titulo="Produtos" linhas={r.produtos} ra={ra} rb={rb} />
        <Lado titulo="Serviços" linhas={r.servicos} ra={ra} rb={rb} />
        <Lado titulo="Vendedores" linhas={r.vendedores} ra={ra} rb={rb} href={(id) => (id === "-" ? undefined : `/relatorios/comparar?a=${ka}&b=${kb}&vendedor=${id}`)} />
        <Lado titulo="Canais de venda" linhas={r.canais} ra={ra} rb={rb} />
      </div>
    </Pagina>
  );
}
