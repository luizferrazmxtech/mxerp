import Link from "next/link";
import { prisma } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth/atual";
import { pode } from "@/lib/auth/permissoesAcao";
import { caixaAberto } from "@/lib/pdv/caixa";
import { linhasCaixas, whereCaixas, type LinhaCaixa, type ParamsCaixas } from "@/lib/pdv/relatorio";
import { brl, dataSP, horaSP } from "@/lib/ui/format";
import { Pagina, Pilula } from "@/components/ui/Pagina";
import Paginacao, { lerPagina } from "@/components/ui/Paginacao";
import SeletorPeriodo from "@/components/ui/SeletorPeriodo";
import Resumo from "@/components/ui/Resumo";
import Icone from "@/components/Icone";
import BotaoImprimir from "@/components/orcamentos/BotaoImprimir";
import AvisoCaixa from "@/components/vendas/AvisoCaixa";

export const dynamic = "force-dynamic";
export const metadata = { title: "Caixas" };

const BASE = "/vendas/caixas";
const ABERTO = "border-sky-300 bg-sky-50 text-sky-700";
const FECHADO = "border-slate-300 bg-slate-50 text-slate-600";
const quando = (d: Date) => `${dataSP(d)} ${horaSP(d)}`;
const corDif = (d: number | null) => (d == null || Math.abs(d) < 0.01 ? "text-slate-500" : d > 0 ? "text-[#1d7a34]" : "text-[#a8323e]");
const txtDif = (d: number | null) => (d == null ? "—" : Math.abs(d) < 0.01 ? "R$ 0,00" : `${d > 0 ? "+" : "−"}${brl(Math.abs(d))}`);

/** Relatório dos caixas do PDV: abertura, vendas, sangrias, reforços, fechamento e diferença de cada caixa. */
export default async function Caixas({ searchParams }: { searchParams: Promise<ParamsCaixas> }) {
  const sp = await searchParams;
  const u = await exigirUsuario();
  const todos = await pode(u.papel, "pdv.caixas");
  const { where, rotulo } = whereCaixas(sp, { id: u.id, todos });
  const [linhas, meu, operadores, podeSangria] = await Promise.all([
    linhasCaixas(where),
    caixaAberto(u.id),
    todos ? prisma.caixaPdv.findMany({ distinct: ["usuarioId"], select: { usuario: { select: { id: true, nome: true } } } }).then((r) => r.map((x) => x.usuario).sort((a, b) => a.nome.localeCompare(b.nome))) : [],
    pode(u.papel, "pdv.sangria"),
  ]);
  const { pagina, porPagina, skip, take } = lerPagina(sp);
  const pag = linhas.slice(skip, skip + take);
  const soma = (f: (l: LinhaCaixa) => number) => linhas.reduce((s, l) => s + f(l), 0);
  const fechados = linhas.filter((l) => !l.aberto);
  const difs = soma((l) => l.diferenca ?? 0);
  const voltar = `&voltar=${encodeURIComponent(BASE)}`;

  return (
    <Pagina titulo="Caixas" icone="caixa" trilha={[{ rotulo: "Vendas balcão", href: "/vendas/balcao" }, { rotulo: "Caixas" }]}>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        {meu ? (
          <>
            <Link href="/pdv" className="btn"><Icone nome="carrinho" size={15} /> Vender</Link>
            {podeSangria && <Link href={`/pdv?acao=sangria${voltar}`} className="btn-sec">Sangria</Link>}
            {podeSangria && <Link href={`/pdv?acao=reforco${voltar}`} className="btn-sec">Reforço</Link>}
            <Link href={`${BASE}/${meu.id}?acao=fechar`} className="btn-sec"><Icone nome="caixa" size={14} /> Fechar caixa</Link>
          </>
        ) : <Link href="/pdv" className="btn"><Icone nome="caixa" size={15} /> Abrir caixa</Link>}
        <BotaoImprimir />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SeletorPeriodo base={BASE} params={sp} />
          <form action={BASE} className="flex flex-wrap gap-2">
            {Object.entries(sp).filter(([k, v]) => v && !["op", "sit", "q", "p"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            {todos && (
              <select name="op" defaultValue={sp.op ?? ""} className="campo w-auto">
                <option value="">Todos os operadores</option>
                {operadores.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            )}
            <select name="sit" defaultValue={sp.sit ?? ""} className="campo w-auto">
              <option value="">Abertos e fechados</option><option value="aberto">Abertos</option><option value="fechado">Fechados</option>
            </select>
            <div className="flex">
              <input name="q" defaultValue={sp.q} placeholder="Nº do caixa" inputMode="numeric" className="campo w-28 rounded-r-none" />
              <button className="btn rounded-l-none px-2.5" title="Buscar"><Icone nome="buscar" size={15} /></button>
            </div>
          </form>
        </div>
      </div>

      <AvisoCaixa />

      <h2 className="mb-2 hidden text-[16px] font-semibold print:block">Relatório de caixas · {rotulo}</h2>

      <Resumo compacto cartoes={[
        { rotulo: "Caixas no período", valor: String(linhas.length), legenda: `${linhas.length - fechados.length} aberto(s), ${fechados.length} fechado(s)`, icone: "caixa", cor: "tinta" },
        { rotulo: "Vendido", valor: brl(soma((l) => l.vendido)), legenda: `${soma((l) => l.vendas)} venda(s) concretizada(s)`, icone: "vendas", cor: "verde" },
        { rotulo: "Sangrias", valor: brl(soma((l) => l.sangrias)), legenda: "dinheiro retirado da gaveta", icone: "pagar", cor: "amarelo" },
        { rotulo: "Reforços", valor: brl(soma((l) => l.reforcos)), legenda: "troco colocado na gaveta", icone: "receber", cor: "azul" },
        { rotulo: "Diferenças", valor: txtDif(Math.round(difs * 100) / 100), legenda: `${fechados.filter((l) => Math.abs(l.diferenca ?? 0) >= 0.01).length} caixa(s) com sobra ou falta`, icone: "alerta", cor: Math.abs(difs) >= 0.01 ? "vermelho" : "cinza" },
      ]} />

      {/* celular: um cartão por caixa */}
      <div className="space-y-2 md:hidden print:hidden">
        {pag.map((l) => (
          <Link key={l.id} href={`${BASE}/${l.id}`} className="cartao block p-3">
            <div className="flex items-center gap-2">
              <b className="text-[15px]">Caixa {l.numero ?? "—"}</b>
              <Pilula rotulo={l.aberto ? "Aberto" : "Fechado"} cor={l.aberto ? ABERTO : FECHADO} />
              <span className="ml-auto text-[15px] font-bold">{brl(l.vendido)}</span>
            </div>
            <div className="mt-1 text-[12px] text-slate-600">{l.operador.nome} · {quando(l.abertoEm)}{l.fechadoEm ? ` até ${quando(l.fechadoEm)}` : ""}</div>
            <div className="mt-2 grid grid-cols-3 gap-1 text-[12px]">
              <span><span className="block text-slate-500">Abertura</span>{brl(l.abertura)}</span>
              <span><span className="block text-slate-500">Sangrias</span>{brl(l.sangrias)}</span>
              <span><span className="block text-slate-500">Reforços</span>{brl(l.reforcos)}</span>
              <span><span className="block text-slate-500">Dinheiro esperado</span>{brl(l.esperado)}</span>
              <span><span className="block text-slate-500">Contado</span>{l.contado != null ? brl(l.contado) : "—"}</span>
              <span><span className="block text-slate-500">Diferença</span><b className={corDif(l.diferenca)}>{txtDif(l.diferenca)}</b></span>
            </div>
          </Link>
        ))}
        {!pag.length && <div className="cartao p-6 text-center text-slate-500">Nenhum caixa no período.</div>}
      </div>

      <div className="cartao hidden overflow-x-auto md:block print:block">
        <table className="tabela">
          <thead><tr>
            <th className="w-16">Nº</th><th>Operador</th><th>Abertura</th><th>Fechamento</th>
            <th className="text-right">Valor inicial</th><th className="text-right">Vendas</th><th className="text-right">Sangrias</th><th className="text-right">Reforços</th>
            <th className="text-right">Dinheiro esperado</th><th className="text-right">Contado</th><th className="text-right">Diferença</th>
            <th className="w-24">Situação</th><th className="no-print w-12"></th>
          </tr></thead>
          <tbody>
            {pag.map((l) => (
              <tr key={l.id}>
                <td><Link href={`${BASE}/${l.id}`} className="text-marca hover:underline">{l.numero ?? "—"}</Link></td>
                <td>{l.operador.nome}</td>
                <td className="whitespace-nowrap">{quando(l.abertoEm)}</td>
                <td className="whitespace-nowrap">{l.fechadoEm ? quando(l.fechadoEm) : "—"}</td>
                <td className="text-right">{brl(l.abertura)}</td>
                <td className="text-right whitespace-nowrap">{brl(l.vendido)}<span className="block text-[11px] text-slate-500">{l.vendas} venda(s)</span></td>
                <td className="text-right">{brl(l.sangrias)}</td>
                <td className="text-right">{brl(l.reforcos)}</td>
                <td className="text-right">{brl(l.esperado)}</td>
                <td className="text-right">{l.contado != null ? brl(l.contado) : "—"}</td>
                <td className={`text-right font-semibold ${corDif(l.diferenca)}`}>{txtDif(l.diferenca)}</td>
                <td><Pilula rotulo={l.aberto ? "Aberto" : "Fechado"} cor={l.aberto ? ABERTO : FECHADO} /></td>
                <td className="no-print text-right"><Link href={`${BASE}/${l.id}`} className="btn-icone" title="Visualizar"><Icone nome="ver" size={13} /></Link></td>
              </tr>
            ))}
            {!pag.length && <tr><td colSpan={13} className="py-10 text-center text-slate-500">Nenhum caixa no período.</td></tr>}
          </tbody>
          {linhas.length > 0 && (
            <tfoot><tr className="font-semibold">
              <td colSpan={4} className="text-right text-[12px]">Total dos {linhas.length} caixa(s)</td>
              <td className="text-right">{brl(soma((l) => l.abertura))}</td>
              <td className="text-right">{brl(soma((l) => l.vendido))}</td>
              <td className="text-right">{brl(soma((l) => l.sangrias))}</td>
              <td className="text-right">{brl(soma((l) => l.reforcos))}</td>
              <td colSpan={2}></td>
              <td className={`text-right ${corDif(difs)}`}>{txtDif(Math.round(difs * 100) / 100)}</td>
              <td colSpan={2}></td>
            </tr></tfoot>
          )}
        </table>
        <div className="no-print"><Paginacao base={BASE} params={sp} total={linhas.length} pagina={pagina} porPagina={porPagina} /></div>
      </div>
      <div className="no-print mt-2 md:hidden">{linhas.length > take && <Paginacao base={BASE} params={sp} total={linhas.length} pagina={pagina} porPagina={porPagina} />}</div>
      {!todos && <p className="no-print mt-2 text-[12px] text-slate-500">Você vê o caixa aberto e os caixas em que trabalhou. Para ver todos, peça a permissão &quot;Ver todos os caixas&quot;.</p>}
    </Pagina>
  );
}
