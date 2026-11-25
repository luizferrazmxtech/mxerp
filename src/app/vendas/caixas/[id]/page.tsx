import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth/atual";
import { pode } from "@/lib/auth/permissoesAcao";
import { caixasDoUsuario, linhasCaixas, conferenciaDe } from "@/lib/pdv/relatorio";
import { caixaAberto, resumoCaixa } from "@/lib/pdv/caixa";
import { brl, dataSP, horaSP } from "@/lib/ui/format";
import { Pagina, Pilula } from "@/components/ui/Pagina";
import SemPermissao from "@/components/ui/SemPermissao";
import Icone from "@/components/Icone";
import BotaoImprimir from "@/components/orcamentos/BotaoImprimir";
import FecharCaixa from "@/app/pdv/FecharCaixa";

export const dynamic = "force-dynamic";
export const metadata = { title: "Caixa" };

const quando = (d: Date) => `${dataSP(d)} ${horaSP(d)}`;
const corDif = (d: number | null) => (d == null || Math.abs(d) < 0.01 ? "text-slate-600" : d > 0 ? "text-[#1d7a34]" : "text-[#a8323e]");
const txtDif = (d: number | null) => (d == null ? "—" : Math.abs(d) < 0.01 ? "R$ 0,00" : `${d > 0 ? "+" : "−"}${brl(Math.abs(d))}`);
const SIT: Record<string, string> = { CONCLUIDA: "Concretizada", CANCELADA: "Cancelada", ABERTA: "Em aberto", ORCAMENTO: "Orçamento" };

/** Relatório de um caixa: abertura, conferência do fechamento, sangrias/reforços e vendas. Imprime em uma página. */
export default async function Caixa({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ acao?: string; fechado?: string }> }) {
  const { id } = await params;
  const { acao, fechado } = await searchParams;
  const u = await exigirUsuario();
  const [l] = await linhasCaixas({ id });
  if (!l) notFound();
  const todos = await pode(u.papel, "pdv.caixas");
  const pode0 = todos || (await prisma.caixaPdv.count({ where: { AND: [{ id }, caixasDoUsuario(u.id)] } })) > 0;
  if (!pode0) return <SemPermissao texto="Você só pode ver os caixas em que trabalhou." />;
  // o caixa em que o PDV deste usuário está vendendo (um por empresa)
  const meu = l.aberto && (await caixaAberto(u.id))?.id === id;
  const [movs, vendas, podeSangria] = await Promise.all([
    prisma.movimentoCaixa.findMany({ where: { caixaId: id }, orderBy: { createdAt: "asc" }, include: { usuario: { select: { nome: true } } } }),
    prisma.venda.findMany({
      where: { caixaId: id }, orderBy: { data: "asc" },
      select: { id: true, numero: true, data: true, total: true, situacao: true, cliente: { select: { nome: true } }, pagamentos: { select: { valor: true, formaPagamento: { select: { nome: true } } } } },
    }),
    pode(u.papel, "pdv.sangria"),
  ]);
  const conf = l.aberto ? (await resumoCaixa(id)).esperadoPorForma : conferenciaDe(l);
  const base = `/vendas/caixas/${id}`;
  const voltar = `&voltar=${encodeURIComponent(base)}`;
  const fecharAberto = l.aberto && acao === "fechar";
  const info = (rotulo: string, valor: React.ReactNode, cls = "") => (
    <div className="rounded border border-slate-200 p-2"><div className="text-[11px] text-slate-500">{rotulo}</div><div className={`text-[15px] font-semibold ${cls}`}>{valor}</div></div>
  );

  return (
    <Pagina titulo={<>Caixa {l.numero ?? ""} <Pilula rotulo={l.aberto ? "Aberto" : "Fechado"} cor={l.aberto ? "border-sky-300 bg-sky-50 text-sky-700" : "border-slate-300 bg-slate-50 text-slate-600"} /></>}
      icone="caixa" voltar="/vendas/caixas" trilha={[{ rotulo: "Vendas balcão", href: "/vendas/balcao" }, { rotulo: "Caixas", href: "/vendas/caixas" }, { rotulo: "Visualizar" }]}>
      {fechado && !l.aberto && <div className="no-print mb-3 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">Caixa fechado. Confira abaixo e imprima se quiser guardar o relatório.</div>}

      <div className="no-print mb-3 flex flex-wrap gap-2">
        <BotaoImprimir />
        {l.aberto && meu && <Link href="/pdv" className="btn-sec"><Icone nome="carrinho" size={14} /> Ir para o PDV</Link>}
        {l.aberto && meu && podeSangria && <Link href={`/pdv?acao=sangria${voltar}`} className="btn-sec">Sangria</Link>}
        {l.aberto && meu && podeSangria && <Link href={`/pdv?acao=reforco${voltar}`} className="btn-sec">Reforço</Link>}
        {l.aberto && <Link href={`${base}?acao=fechar`} className="btn"><Icone nome="caixa" size={14} /> Fechar caixa</Link>}
      </div>

      <div className="cartao p-4 text-[13px]">
        <h2 className="mb-3 text-[16px]">Relatório do <b>caixa {l.numero ?? ""}</b></h2>
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <div><span className="text-slate-500">Aberto por:</span> {l.operador.nome}</div>
          <div><span className="text-slate-500">Abertura:</span> {quando(l.abertoEm)}</div>
          <div><span className="text-slate-500">Fechamento:</span> {l.fechadoEm ? quando(l.fechadoEm) : "caixa aberto"}</div>
          {l.fechadoPor && <div><span className="text-slate-500">Fechado por:</span> {l.fechadoPor}</div>}
          {l.observacao && <div className="sm:col-span-2"><span className="text-slate-500">Observação:</span> {l.observacao}</div>}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {info("Valor inicial", brl(l.abertura))}
          {info(`Vendido (${l.vendas} venda${l.vendas === 1 ? "" : "s"})`, brl(l.vendido))}
          {info("Sangrias", `−${brl(l.sangrias)}`)}
          {info("Reforços", `+${brl(l.reforcos)}`)}
          {info("Dinheiro esperado", brl(l.esperado))}
          {info("Dinheiro contado", l.contado != null ? brl(l.contado) : "—")}
          {info("Diferença", txtDif(l.diferenca), corDif(l.diferenca))}
          {info("Ticket médio", brl(l.vendas ? l.vendido / l.vendas : 0))}
        </div>

        <h3 className="mt-5 mb-1 font-semibold">Conferência por forma de pagamento{l.aberto && <span className="font-normal text-slate-500"> (até agora)</span>}</h3>
        <div className="overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Forma</th><th className="text-right">Esperado</th><th className="text-right">Contado</th><th className="text-right">Diferença</th></tr></thead>
            <tbody>
              {conf.map((c, i) => {
                const d = l.aberto ? null : Math.round((c.contado - c.esperado) * 100) / 100;
                return (
                  <tr key={c.forma}>
                    <td>{c.forma}{i === 0 && <span className="hidden text-[11px] text-slate-500 sm:inline"> (gaveta: inicial + vendas + reforços − sangrias)</span>}</td>
                    <td className="text-right">{brl(c.esperado)}</td>
                    <td className="text-right">{l.aberto ? "—" : brl(c.contado)}</td>
                    <td className={`text-right font-semibold ${corDif(d)}`}>{txtDif(d)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <h3 className="mt-5 mb-1 font-semibold">Movimentos da gaveta</h3>
        <div className="overflow-x-auto">
          <table className="tabela">
            <thead><tr><th className="w-32">Hora</th><th>Movimento</th><th>Motivo</th><th>Usuário</th><th className="text-right">Valor</th></tr></thead>
            <tbody>
              <tr><td className="whitespace-nowrap">{quando(l.abertoEm)}</td><td>Abertura</td><td></td><td>{l.operador.nome}</td><td className="text-right">{brl(l.abertura)}</td></tr>
              {movs.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap">{quando(m.createdAt)}</td>
                  <td>{m.tipo === "SANGRIA" ? "Sangria" : "Reforço"}{m.transferenciaId && <span className="block text-[11px] text-slate-500">transferido no financeiro</span>}</td>
                  <td>{m.motivo}</td><td>{m.usuario.nome}</td>
                  <td className={`text-right whitespace-nowrap ${m.tipo === "SANGRIA" ? "text-[#a8323e]" : "text-[#1d7a34]"}`}>{m.tipo === "SANGRIA" ? "−" : "+"}{brl(m.valor)}</td>
                </tr>
              ))}
              {l.fechadoEm && <tr><td className="whitespace-nowrap">{quando(l.fechadoEm)}</td><td>Fechamento (dinheiro contado)</td><td></td><td>{l.fechadoPor ?? ""}</td><td className="text-right">{l.contado != null ? brl(l.contado) : "—"}</td></tr>}
            </tbody>
          </table>
        </div>

        <h3 className="mt-5 mb-1 font-semibold">Vendas do caixa</h3>
        <div className="overflow-x-auto">
          <table className="tabela">
            <thead><tr><th className="w-16">Nº</th><th className="w-16">Hora</th><th>Cliente</th><th>Pagamento</th><th>Situação</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {vendas.map((v) => (
                <tr key={v.id} className={v.situacao === "CANCELADA" ? "text-slate-400 line-through" : ""}>
                  <td><Link href={`/vendas/${v.id}`} className="text-marca hover:underline">{v.numero}</Link></td>
                  <td>{horaSP(v.data)}</td>
                  <td>{v.cliente?.nome ?? "Consumidor"}</td>
                  <td className="text-[12px]">{v.pagamentos.map((p) => `${p.formaPagamento.nome} ${brl(p.valor)}`).join(" · ")}</td>
                  <td>{SIT[v.situacao] ?? v.situacao}</td>
                  <td className="text-right">{brl(v.total)}</td>
                </tr>
              ))}
              {!vendas.length && <tr><td colSpan={6} className="py-6 text-center text-slate-500">Nenhuma venda neste caixa.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-6 hidden text-[12px] print:block">Conferido por: _______________________________ &nbsp; Operador: _______________________________</p>
      </div>

      {fecharAberto && (
        <div className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 pt-10 sm:p-4 sm:pt-20">
          <div className="cartao w-full max-w-md shadow-xl">
            <div className="flex items-center border-b px-4 py-3">
              <h3 className="text-[16px]">Fechar o <b>caixa {l.numero ?? ""}</b><span className="block text-[12px] text-slate-500">aberto por {l.operador.nome}</span></h3>
              <Link href={base} className="ml-auto text-slate-500 hover:text-black" aria-label="Fechar"><Icone nome="fechar" /></Link>
            </div>
            <div className="p-4"><FecharCaixa caixaId={id} linhas={conf.map(({ forma, esperado }) => ({ forma, esperado }))} /></div>
          </div>
        </div>
      )}
    </Pagina>
  );
}
