import Link from "next/link";
import type { ModeloNota, Prisma } from "@prisma/client";
import { Pagina, Pilula, RodapeLista } from "@/components/ui/Pagina";
import { exigirArea } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { temCertificadoServidor } from "@/lib/fiscal/certificado";
import { lojaAtual, nomeLoja } from "@/lib/empresa/atual";
import { brl, dataHora } from "@/lib/ui/format";
import BotaoAcao from "@/components/BotaoAcao";
import { numerosPendentes } from "@/lib/fiscal/inutilizacao";
import { estimativaDoMes, mesAnterior, mesAtual } from "@/lib/fiscal/impostos";
import { buscarXmlNfsesAcao, consultarStatus } from "./actions";
import AcoesNota from "./AcoesNota";
import Resumo from "@/components/ui/Resumo";
import { numeroDaNota } from "@/lib/fiscal/numeroNota";
import { origensDasNotas } from "@/lib/fiscal/origemNota";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notas fiscais" };

const SITUACAO: Record<string, [string, string]> = {
  AUTORIZADA: ["Autorizada", "bg-emerald-50 text-emerald-700"], REJEITADA: ["Rejeitada", "bg-red-50 text-red-700"],
  CANCELADA: ["Cancelada", "bg-slate-50 text-slate-600"], DENEGADA: ["Denegada", "bg-red-50 text-red-700"],
  INUTILIZADA: ["Inutilizada", "bg-slate-50 text-slate-500"], ASSINADA: ["Não enviada", "bg-amber-50 text-amber-800"],
  ENVIADA: ["Aguardando SEFAZ", "bg-amber-50 text-amber-800"], RASCUNHO: ["Rascunho", "bg-slate-50 text-slate-500"],
};
const MODELOS: Record<string, { titulo: string; curto: string }> = {
  NFE: { titulo: "NF-e (produtos)", curto: "NF-e" }, NFCE: { titulo: "NFC-e (consumidor)", curto: "NFC-e" }, NFSE: { titulo: "NFS-e (serviços)", curto: "NFS-e" },
};
const nomeMes = (c: string) => { const t = new Date(`${c}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); return t[0].toUpperCase() + t.slice(1); };
const proximo = (c: string) => { const [a, m] = c.split("-").map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`; };

/** Notas fiscais da loja atual, por tipo (NF-e, NFC-e, NFS-e) e mês, com origem, totais e imposto aproximado. */
export default async function Fiscal({ searchParams }: { searchParams: Promise<{ modelo?: string; mes?: string }> }) {
  await exigirArea("/fiscal");
  const sp = await searchParams;
  const modelo = sp.modelo && MODELOS[sp.modelo] ? (sp.modelo as ModeloNota) : null;
  const comp = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : mesAtual();
  const [a, m] = comp.split("-").map(Number);
  const de = new Date(Date.UTC(a, m - 1, 1, 3)), ate = new Date(Date.UTC(m === 12 ? a + 1 : a, m === 12 ? 0 : m, 1, 3));
  const e = await lojaAtual();
  const where: Prisma.NotaFiscalWhereInput = {
    ...(modelo ? { modelo } : {}),
    OR: [{ emitidaEm: { gte: de, lt: ate } }, { emitidaEm: null, createdAt: { gte: de, lt: ate } }],
  };
  const [notas, est] = await Promise.all([
    prisma.notaFiscal.findMany({ where, orderBy: [{ createdAt: "desc" }], take: 500 }),
    e ? estimativaDoMes(e.id, comp) : null,
  ]);

  // de onde veio cada nota (venda ou OS, mesmo de outra empresa do grupo) e o cliente
  const origem = await origensDasNotas(notas);

  // NFS-e emitidas fora do MXERP (Gestão Click) sem XML: o botão busca chave e XML no portal nacional
  const semXml = notas.filter((n) => n.modelo === "NFSE" && !n.xml && ["AUTORIZADA", "CANCELADA"].includes(n.status)).length;
  const certOk = !!e?.certificadoValidade || temCertificadoServidor();
  const pendentes = e
    ? (await Promise.all([numerosPendentes(e, "NFE", e.serieNfe, e.ambienteFiscal), numerosPendentes(e, "NFCE", e.serieNfce, e.ambienteFiscal)]))
        .flat().reduce((s, f) => s + f.fim - f.inicio + 1, 0)
    : 0;
  const autorizadas = notas.filter((n) => n.status === "AUTORIZADA");
  const soma = (ls: typeof notas) => ls.reduce((s, n) => s + Number(n.valorTotal), 0);
  const canceladas = notas.filter((n) => n.status === "CANCELADA");
  const rejeitadas = notas.filter((n) => ["REJEITADA", "DENEGADA"].includes(n.status));
  const aguardando = notas.filter((n) => ["ENVIADA", "ASSINADA"].includes(n.status));
  const link = (p: Record<string, string | undefined>) => {
    const base: Record<string, string | undefined> = { modelo: modelo ?? undefined, mes: comp, ...p };
    const q = new URLSearchParams(Object.entries(base).filter((x): x is [string, string] => !!x[1]));
    return `/fiscal?${q}`;
  };
  const titulo = modelo ? MODELOS[modelo].titulo : "Notas fiscais";

  return (
    <Pagina titulo={titulo} icone="notas" trilha={[{ rotulo: "Fiscal", href: "/fiscal" }, { rotulo: modelo ? MODELOS[modelo].curto : "Todas" }]}>
      {/* abas por tipo e mês */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {[["", "Todas"], ["NFE", "NF-e"], ["NFCE", "NFC-e"], ["NFSE", "NFS-e"]].map(([k, r]) => (
          <Link key={k} href={link({ modelo: k || "" })} className={(modelo ?? "") === k ? "btn" : "btn-sec"}>{r}</Link>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <Link href={link({ mes: mesAnterior(comp) })} className="btn-sec">‹</Link>
          <span className="min-w-36 text-center text-[14px] font-semibold">{nomeMes(comp)}</span>
          <Link href={link({ mes: proximo(comp) })} className="btn-sec">›</Link>
        </div>
      </div>

      {/* totais do mês, no padrão dos cartões das listas */}
      <Resumo cartoes={[
        { rotulo: "Autorizadas no mês", valor: brl(soma(autorizadas)), legenda: `${autorizadas.length} nota${autorizadas.length === 1 ? "" : "s"} autorizada${autorizadas.length === 1 ? "" : "s"}`, icone: "confirmado", cor: "verde", pct: notas.length ? (autorizadas.length / notas.length) * 100 : 0 },
        { rotulo: "Canceladas", valor: brl(soma(canceladas)), legenda: `${canceladas.length} cancelada${canceladas.length === 1 ? "" : "s"}`, icone: "fechar", cor: "cinza", pct: notas.length ? (canceladas.length / notas.length) * 100 : 0 },
        { rotulo: "Rejeitadas", valor: String(rejeitadas.length), legenda: "rejeitadas ou denegadas", icone: "atrasado", cor: "vermelho", pct: notas.length ? (rejeitadas.length / notas.length) * 100 : 0 },
        { rotulo: "Aguardando a SEFAZ", valor: String(aguardando.length), legenda: aguardando.length ? "consulte a situação na nota" : "nenhuma pendente", icone: "hoje", cor: "amarelo", pct: notas.length ? (aguardando.length / notas.length) * 100 : 0 },
        { rotulo: "Imposto aproximado", valor: est ? brl(est.imposto) : "—", legenda: est?.semAliquota.length ? "informe as alíquotas do mês ›" : est?.total ? `sobre ${brl(est.total)} em produção ›` : "alíquotas por CNAE ›", icone: "percentual", cor: "roxo", href: `/fiscal/impostos?mes=${comp}` },
      ]} />

      {/* loja emitente, ambiente e certificado */}
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-[13px]">
        <span><span className="text-slate-500">Loja emitente:</span> <b className="uppercase">{e ? nomeLoja(e) : "nenhuma empresa"}</b></span>
        <span>NF-e/NFC-e: <b className={e?.ambienteFiscal === "PRODUCAO" ? "text-red-700" : "text-amber-700"}>{e?.ambienteFiscal === "PRODUCAO" ? "PRODUÇÃO" : "homologação"}</b> · NFS-e: <b className={e?.ambienteNfse === "PRODUCAO" ? "text-red-700" : "text-amber-700"}>{e?.ambienteNfse === "PRODUCAO" ? "PRODUÇÃO" : "homologação"}</b></span>
        <span className={certOk ? "text-emerald-700" : "text-red-700"}>{e?.certificadoValidade ? `Certificado até ${e.certificadoValidade.toLocaleDateString("pt-BR")}` : certOk ? "Certificado do servidor" : "Sem certificado"}</span>
        <Link href={e ? `/empresas/${e.id}` : "/empresas/nova"} className="ml-auto text-marca hover:underline">Configurações fiscais ›</Link>
      </div>

      <div className="mb-2 flex flex-wrap items-start gap-2">
        <Link href="/fiscal/inutilizacao" className="btn-sec">Inutilizar numeração{pendentes > 0 && <span className="ml-1 rounded bg-red-600 px-1.5 text-[11px] text-white">{pendentes}</span>}</Link>
        <BotaoAcao acao={consultarStatus} campos={{ modelo: "55" }} rotulo="Status SEFAZ NF-e" secundario />
        <BotaoAcao acao={consultarStatus} campos={{ modelo: "65" }} rotulo="Status SEFAZ NFC-e" secundario />
        {semXml > 0 && <BotaoAcao acao={buscarXmlNfsesAcao} campos={{}} rotulo={`Buscar XML das NFS-e no portal nacional (${semXml})`} secundario />}
      </div>

      <div className="cartao overflow-x-auto md:overflow-visible">
        <table className="tabela">
          <thead><tr><th>Nº</th>{!modelo && <th>Tipo</th>}<th>Origem</th><th>Cliente</th><th>Data</th><th className="text-right">Valor</th><th>Situação</th><th className="w-12 text-right">Ações</th></tr></thead>
          <tbody>
            {notas.map((n) => {
              const o = n.origemId ? origem.get(n.origemId) : undefined;
              const [rot, cor] = SITUACAO[n.status] ?? [n.status, "bg-slate-50 text-slate-600"];
              return (
                <tr key={n.id}>
                  <td><Link href={`/fiscal/${n.id}`} className="font-semibold text-marca hover:underline">{numeroDaNota(n)}</Link><span className="text-[11px] text-slate-500">{n.modelo === "NFSE" ? ` DPS ${n.serie}/${n.numero}` : ` série ${n.serie}`}</span>
                    {n.ambiente === "HOMOLOGACAO" && <div className="text-[10px] text-amber-700">homologação</div>}</td>
                  {!modelo && <td className="text-[12px]">{MODELOS[n.modelo]?.curto ?? n.modelo}</td>}
                  <td>{o ? <Link href={o.href} className="text-marca hover:underline">{o.rotulo}</Link> : <span className="text-slate-400">—</span>}
                    {o?.outraEmpresa && <div><span className="rounded border border-sky-200 bg-sky-50 px-1.5 text-[11px] text-sky-800" title={`Esta nota foi emitida por esta empresa, mas a ${o.rotulo} está na ${o.outraEmpresa.nome} (empresa do grupo). O link troca para a ${o.outraEmpresa.nome}.`}>na {o.outraEmpresa.nome} · grupo</span></div>}</td>
                  <td className="max-w-64">{o?.cliente ? <Link href={`/clientes/${o.cliente.id}`} className="hover:underline">{o.cliente.nome}</Link> : n.destinatarioNome ? <span>{n.destinatarioNome}</span> : <span className="text-slate-400">consumidor</span>}
                    {o?.cliente?.fantasia && <div className="text-[11px] text-slate-500">{o.cliente.fantasia}</div>}</td>
                  <td>{dataHora(n.emitidaEm ?? n.createdAt)}</td>
                  <td className="text-right">{brl(n.valorTotal)}</td>
                  <td><Pilula rotulo={rot} cor={cor} />
                    {n.consultadaEm && <div className="text-[11px] text-slate-500">consultada {dataHora(n.consultadaEm)}</div>}
                    {n.status !== "AUTORIZADA" && n.motivo && <div className="max-w-56 truncate text-[11px] text-slate-500" title={n.motivo}>{n.motivo}</div>}</td>
                  <td className="text-right">
                    <AcoesNota n={{ id: n.id, modelo: n.modelo, status: n.status, temXml: !!n.xml, temChave: !!n.chave }} origem={o ? { rotulo: o.outraEmpresa ? `${o.rotulo} (${o.outraEmpresa.nome})` : o.rotulo, href: o.href } : null}
                      danfse={n.modelo === "NFSE" && n.chave ? `/fiscal/${n.id}/danfse` : null} />
                  </td>
                </tr>
              );
            })}
            {!notas.length && <tr><td colSpan={8} className="py-8 text-center text-slate-500">Nenhuma nota neste mês. Emita pela venda ou pela OS.</td></tr>}
          </tbody>
        </table>
        <RodapeLista total={notas.length} mostrando={notas.length} />
      </div>
    </Pagina>
  );
}
