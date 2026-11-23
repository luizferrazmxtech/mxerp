import Link from "next/link";
import type { SituacaoOs } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PRIORIDADES_OS } from "@/lib/os/os";
import { mesesRecentes, rotuloMesCurto } from "@/lib/datas";
import { brl, num2 } from "@/lib/ui/format";
import { Pagina } from "@/components/ui/Pagina";
import Icone from "@/components/Icone";
import TelaCheia from "@/components/os/TelaCheia";

export const dynamic = "force-dynamic";
export const metadata = { title: "Painel de ordens de serviços" };

const ABERTAS: SituacaoOs[] = ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_PECA", "AGUARDANDO_APROVACAO"];

function Circulo({ pct, cor }: { pct: number; cor: string }) {
  const r = 14, c = 2 * Math.PI * r;
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0">
      <circle cx="18" cy="18" r={r} fill="none" stroke="#eee" strokeWidth="3" />
      <circle cx="18" cy="18" r={r} fill="none" stroke={cor} strokeWidth="3" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 18 18)" />
      <text x="18" y="21" textAnchor="middle" fontSize="8" fill="#555">{Math.round(pct)}%</text>
    </svg>
  );
}

function Cartao({ icone, cor, titulo, valor, legenda, pct, href }: { icone: string; cor: string; titulo: string; valor: number | string; legenda: string; pct: number; href?: string }) {
  const corpo = (
    <div className="cartao flex h-full flex-col p-3.5 hover:border-slate-300">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded" style={{ background: `${cor}1a`, color: cor }}><Icone nome={icone} size={14} /></span>
        <span className="text-[13px]">{titulo}</span>
        <span className="ml-auto"><Circulo pct={pct} cor={cor} /></span>
      </div>
      <div className="mt-1 text-[22px] font-semibold">{valor}</div>
      <div className="text-[11px] text-slate-500">{legenda}</div>
    </div>
  );
  return href ? <Link href={href}>{corpo}</Link> : corpo;
}

export default async function PainelOs() {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const ini = (dia: string) => new Date(`${dia}T00:00:00-03:00`);
  const amanha = new Date(ini(hoje).getTime() + 86400000);
  const depois = new Date(ini(hoje).getTime() + 2 * 86400000);
  const meses = mesesRecentes(6).reverse();

  const [abertas, falta, faturadas] = await Promise.all([
    prisma.ordemServico.findMany({ where: { situacao: { in: ABERTAS } }, select: { id: true, previsao: true, prioridade: true, total: true } }),
    // OS da empresa atual com peça em falta (a reserva não tem empresa: filtra pela OS)
    prisma.reserva.findMany({ where: { origemTipo: "OS", status: "ATIVA", localId: null }, select: { origemId: true }, distinct: ["origemId"] })
      .then((rs) => prisma.ordemServico.findMany({ where: { id: { in: rs.map((r) => r.origemId) } }, select: { id: true } })),
    prisma.ordemServico.findMany({
      where: { situacao: { in: ["CONCLUIDA", "FATURADA"] }, saida: { gte: meses[0].inicio } },
      select: { total: true, saida: true, tecnico: { select: { nome: true } } },
    }),
  ]);
  const total = abertas.length || 1;
  const conta = (f: (o: (typeof abertas)[number]) => boolean) => abertas.filter(f).length;
  const prazos = [
    { titulo: "Vencidas", icone: "alerta", cor: "#dc2626", n: conta((o) => !!o.previsao && o.previsao < ini(hoje)), legenda: "a saída já passou" },
    { titulo: "Hoje", icone: "relogio", cor: "#e8730c", n: conta((o) => !!o.previsao && o.previsao >= ini(hoje) && o.previsao < amanha), legenda: "saída prevista para hoje" },
    { titulo: "Amanhã", icone: "calendario", cor: "#2f6fd6", n: conta((o) => !!o.previsao && o.previsao >= amanha && o.previsao < depois), legenda: "saída prevista para amanhã" },
    { titulo: "Futuras", icone: "prazo", cor: "#018e83", n: conta((o) => !!o.previsao && o.previsao >= depois), legenda: "saída depois de amanhã" },
    { titulo: "Sem prazo", icone: "alerta", cor: "#6b7280", n: conta((o) => !o.previsao), legenda: "sem data de saída" },
  ];
  const CORES_PRIO: Record<string, string> = { MUITO_URGENTE: "#dc2626", URGENTE: "#e8730c", ALTA: "#d4a106", MEDIA: "#2f6fd6", BAIXA: "#6b7280" };

  const porMes = meses.map((m) => ({
    rotulo: rotuloMesCurto(m.chave),
    v: faturadas.filter((o) => o.saida! >= m.inicio && o.saida! < m.fim).reduce((s, o) => s + Number(o.total), 0),
  }));
  const maxMes = Math.max(...porMes.map((m) => m.v), 1);
  const tec = new Map<string, { v: number; n: number }>();
  for (const o of faturadas) {
    const k = o.tecnico?.nome ?? "Sem técnico";
    const t = tec.get(k) ?? { v: 0, n: 0 };
    tec.set(k, { v: t.v + Number(o.total), n: t.n + 1 });
  }
  const porTec = [...tec].sort((a, b) => b[1].v - a[1].v);
  const maxTec = Math.max(...porTec.map(([, t]) => t.v), 1);

  return (
    <Pagina titulo="Painel de ordens de serviços" icone="painel" trilha={[{ rotulo: "Ordens de serviços", href: "/os" }, { rotulo: "Painel" }]}>
      <div className="mb-4 flex gap-2">
        <Link href="/os/painel" className="btn"><Icone nome="atualizar" size={14} /> Atualizar</Link>
        <TelaCheia />
        <Link href="/os?s=abertas" className="btn-sec"><Icone nome="gerenciar" size={14} /> Ver OS em aberto ({abertas.length})</Link>
      </div>

      <h2 className="flex items-center gap-1.5 text-[17px]"><Icone nome="prazo" size={15} /> Prazos</h2>
      <p className="mb-2 text-[11px] text-slate-500">Ordens de serviço em aberto pela data prevista de saída.</p>
      <div className="mb-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {prazos.map((p) => <Cartao key={p.titulo} icone={p.icone} cor={p.cor} titulo={p.titulo} valor={p.n} legenda={p.legenda} pct={(p.n / total) * 100} href="/os?s=abertas" />)}
      </div>

      <h2 className="flex items-center gap-1.5 text-[17px]"><Icone nome="urgente" size={15} /> Prioridade</h2>
      <p className="mb-2 text-[11px] text-slate-500">Ordens de serviço em aberto por prioridade.</p>
      <div className="mb-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {PRIORIDADES_OS.map((p) => {
          const n = conta((o) => o.prioridade === p.valor);
          return <Cartao key={p.valor} icone="urgente" cor={CORES_PRIO[p.valor]} titulo={p.rotulo} valor={n} legenda="ordens de serviço" pct={(n / total) * 100} />;
        })}
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Cartao icone="alerta" cor="#dc2626" titulo="Peças em falta" valor={falta.length} legenda="OS esperando compra de peça" pct={(falta.length / total) * 100} href="/os?falta=1" />
        <Cartao icone="valor" cor="#018e83" titulo="Valor das OS em aberto" valor={brl(abertas.reduce((s, o) => s + Number(o.total), 0))} legenda={`${abertas.length} OS em aberto`} pct={100} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="cartao p-4">
          <h3 className="flex items-center gap-1.5 text-[16px]"><Icone nome="grafico" size={15} /> Veja o <b>faturamento</b></h3>
          <p className="mb-3 text-[11px] text-slate-500">Total das OS concluídas e faturadas por mês (pela data de saída).</p>
          <div className="flex h-56 items-end gap-3 border-b border-slate-200 px-2">
            {porMes.map((m) => (
              <div key={m.rotulo} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] text-slate-600">{m.v ? num2(m.v) : ""}</span>
                <div className="w-full max-w-12 rounded-t bg-topo" style={{ height: `${(m.v / maxMes) * 85}%` }} title={brl(m.v)} />
              </div>
            ))}
          </div>
          <div className="flex gap-3 px-2 pt-1">{porMes.map((m) => <span key={m.rotulo} className="flex-1 text-center text-[11px] text-slate-500">{m.rotulo}</span>)}</div>
        </section>
        <section className="cartao p-4">
          <h3 className="flex items-center gap-1.5 text-[16px]"><Icone nome="funcionarios" size={15} /> Faturamento por <b>técnico</b></h3>
          <p className="mb-3 text-[11px] text-slate-500">OS concluídas e faturadas de cada técnico nos últimos 6 meses.</p>
          <div className="space-y-2">
            {porTec.map(([nome, t]) => (
              <div key={nome} className="grid grid-cols-[130px_1fr] items-center gap-2 text-[11px]">
                <span className="truncate text-right uppercase text-slate-600" title={nome}>{nome}</span>
                <div className="flex items-center gap-2">
                  <div className="h-4 rounded-sm bg-topo" style={{ width: `${Math.max((t.v / maxTec) * 75, 1)}%` }} />
                  <span className="whitespace-nowrap text-slate-600">{brl(t.v)} · {t.n} OS</span>
                </div>
              </div>
            ))}
            {!porTec.length && <p className="text-[13px] text-slate-500">Nenhuma OS concluída nos últimos 6 meses.</p>}
          </div>
        </section>
      </div>
    </Pagina>
  );
}
