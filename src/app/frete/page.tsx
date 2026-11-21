import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { exigirArea } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { configFreteTela } from "@/lib/frete/melhorEnvio";
import { SITUACOES_ENVIO, linkRastreio } from "@/lib/frete/tipos";
import { mesAnterior, mesAtual } from "@/lib/fiscal/impostos";
import { brl, dataHora } from "@/lib/ui/format";
import { Pagina, Pilula, RodapeLista } from "@/components/ui/Pagina";
import Resumo from "@/components/ui/Resumo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Envios (Melhor Envio)" };

const nomeMes = (c: string) => { const t = new Date(`${c}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); return t[0].toUpperCase() + t.slice(1); };
const proximo = (c: string) => { const [a, m] = c.split("-").map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`; };
const GRUPOS: Record<string, string[]> = { postar: ["PAGA", "GERADA"], transito: ["POSTADA"], entregues: ["ENTREGUE"], problema: ["ERRO", "NAO_ENTREGUE", "CARRINHO"] };

/** Vendas → Envios: todas as etiquetas do Melhor Envio do mês, com a situação do rastreio. */
export default async function EnviosPagina({ searchParams }: { searchParams: Promise<{ mes?: string; grupo?: string; q?: string }> }) {
  await exigirArea("/frete");
  const sp = await searchParams;
  const comp = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : mesAtual();
  const [a, m] = comp.split("-").map(Number);
  const de = new Date(Date.UTC(a, m - 1, 1, 3)), ate = new Date(Date.UTC(m === 12 ? a + 1 : a, m === 12 ? 0 : m, 1, 3));
  const q = sp.q?.trim();
  const doMes: Prisma.EnvioFreteWhereInput = q
    ? { OR: [{ rastreio: { contains: q, mode: "insensitive" } }, { protocolo: { contains: q, mode: "insensitive" } }, { venda: { cliente: { nome: { contains: q, mode: "insensitive" } } } }, ...(/^\d+$/.test(q) ? [{ venda: { numero: Number(q) } }] : [])] }
    : { createdAt: { gte: de, lt: ate } };
  const grupo = sp.grupo && GRUPOS[sp.grupo] ? sp.grupo : "";
  const [c, todos] = await Promise.all([
    configFreteTela(),
    prisma.envioFrete.findMany({ where: doMes, orderBy: { createdAt: "desc" }, take: 500, include: { venda: { select: { id: true, numero: true, cliente: { select: { id: true, nome: true } } } } } }),
  ]);
  const envios = grupo ? todos.filter((e) => GRUPOS[grupo].includes(e.situacao)) : todos;
  const validos = todos.filter((e) => e.situacao !== "CANCELADA");
  const conta = (g: string) => todos.filter((e) => GRUPOS[g].includes(e.situacao)).length;
  const pct = (n: number) => (validos.length ? (n / validos.length) * 100 : 0);
  const link = (p: Record<string, string | undefined>) => {
    const base: Record<string, string | undefined> = { mes: comp, grupo: grupo || undefined, ...p };
    return `/frete?${new URLSearchParams(Object.entries(base).filter((x): x is [string, string] => !!x[1]))}`;
  };
  const cartao = (g: string) => ({ href: grupo === g ? link({ grupo: "" }) : link({ grupo: g }), ativo: grupo === g });

  return (
    <Pagina titulo="Envios (Melhor Envio)" icone="frete" trilha={[{ rotulo: "Vendas", href: "/vendas" }, { rotulo: "Envios" }]}
      acoes={<Link href="/frete/configuracoes" className="btn-sec">Configurar</Link>}>
      {!c.ativo && <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">O frete pelo Melhor Envio está desligado. <Link href="/frete/configuracoes" className="underline">Configure o token</Link> para cotar e comprar etiquetas nas vendas.</p>}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form className="flex items-center gap-2"><input name="q" defaultValue={q} placeholder="Rastreio, venda ou cliente" className="campo h-8 w-64 text-[12px]" /><button className="btn-sec h-8 text-[12px]">Buscar</button></form>
        {!q && (
          <div className="ml-auto flex items-center gap-1">
            <Link href={link({ mes: mesAnterior(comp) })} className="btn-sec">‹</Link>
            <span className="min-w-36 text-center text-[14px] font-semibold">{nomeMes(comp)}</span>
            <Link href={link({ mes: proximo(comp) })} className="btn-sec">›</Link>
          </div>
        )}
      </div>
      <Resumo cartoes={[
        { rotulo: "Etiquetas no mês", valor: brl(validos.reduce((s, e) => s + Number(e.valor), 0)), legenda: `${validos.length} etiqueta${validos.length === 1 ? "" : "s"} (sem as canceladas)`, icone: "total", cor: "tinta", pct: 100 },
        { rotulo: "A postar", valor: String(conta("postar")), legenda: "etiqueta pronta, falta levar", icone: "hoje", cor: "amarelo", pct: pct(conta("postar")), ...cartao("postar") },
        { rotulo: "Em trânsito", valor: String(conta("transito")), legenda: "postadas", icone: "frete", cor: "azul", pct: pct(conta("transito")), ...cartao("transito") },
        { rotulo: "Entregues", valor: String(conta("entregues")), legenda: "confirmadas pela transportadora", icone: "confirmado", cor: "verde", pct: pct(conta("entregues")), ...cartao("entregues") },
        { rotulo: "Com problema", valor: String(conta("problema")), legenda: "erro, sem saldo ou não entregue", icone: "atrasado", cor: "vermelho", pct: pct(conta("problema")), ...cartao("problema") },
      ]} />
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Venda</th><th>Cliente</th><th>Serviço</th><th>Rastreio</th><th>Comprada em</th><th className="text-right">Custo</th><th>Situação</th></tr></thead>
          <tbody>
            {envios.map((e) => {
              const s = SITUACOES_ENVIO[e.situacao] ?? SITUACOES_ENVIO.ERRO;
              const r = linkRastreio(e);
              return (
                <tr key={e.id}>
                  <td><Link href={`/vendas/${e.venda.id}?aba=entrega`} className="font-semibold text-marca hover:underline">#{e.venda.numero}</Link></td>
                  <td>{e.venda.cliente ? <Link href={`/clientes/${e.venda.cliente.id}`} className="hover:underline">{e.venda.cliente.nome}</Link> : "—"}</td>
                  <td>{e.transportadora} {e.servicoNome}{e.prazoDias ? <div className="text-[11px] text-slate-500">{e.prazoDias} dias úteis</div> : null}</td>
                  <td>{e.rastreio ? (r ? <a href={r} target="_blank" rel="noreferrer" className="font-mono text-marca hover:underline">{e.rastreio}</a> : <span className="font-mono">{e.rastreio}</span>) : <span className="text-slate-400">—</span>}</td>
                  <td>{dataHora(e.createdAt)}{e.usuarioNome && <div className="text-[11px] text-slate-500">{e.usuarioNome}</div>}</td>
                  <td className="text-right">{brl(e.valor)}</td>
                  <td><Pilula rotulo={s.rotulo} cor={s.cor} />{e.erro && <div className="max-w-56 truncate text-[11px] text-red-700" title={e.erro}>{e.erro}</div>}
                    {e.consultadaEm && <div className="text-[11px] text-slate-500">consultado {dataHora(e.consultadaEm)}</div>}</td>
                </tr>
              );
            })}
            {!envios.length && <tr><td colSpan={7} className="py-8 text-center text-slate-500">Nenhuma etiqueta {q ? "encontrada" : "neste mês"}.</td></tr>}
          </tbody>
        </table>
        <RodapeLista total={envios.length} mostrando={envios.length} />
      </div>
    </Pagina>
  );
}
