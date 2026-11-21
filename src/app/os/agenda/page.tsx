import Link from "next/link";
import { exigirArea } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { configAgenda } from "@/lib/agenda/google";
import { Pagina } from "@/components/ui/Pagina";
import Resumo from "@/components/ui/Resumo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agenda das equipes" };

const DIA = 86400_000;
const SP = "America/Sao_Paulo";
const diaISO = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: SP });
const hora = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: SP, hour: "2-digit", minute: "2-digit" });
/** Segunda-feira da semana do dia "AAAA-MM-DD", como instante de meia-noite em Brasília. */
function segunda(dia: string) {
  const d = new Date(`${dia}T00:00:00-03:00`);
  const dow = (new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * DIA);
}
const COR: Record<string, string> = {
  ABERTA: "border-slate-300 bg-white", EM_ANDAMENTO: "border-amber-300 bg-amber-50", AGUARDANDO_PECA: "border-orange-300 bg-orange-50",
  AGUARDANDO_APROVACAO: "border-sky-300 bg-sky-50", CONCLUIDA: "border-emerald-300 bg-emerald-50", FATURADA: "border-green-400 bg-green-50",
  CANCELADA: "border-red-300 bg-red-50 line-through", DEVOLVIDA_SEM_REPARO: "border-purple-300 bg-purple-50",
};

/** Ordens de serviço → Agenda: OS agendadas da semana, uma linha por equipe (como cada equipe vê no Google Agenda). */
export default async function AgendaPagina({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  await exigirArea("/os/agenda");
  const sp = await searchParams;
  const hoje = diaISO(new Date());
  const ini = segunda(/^\d{4}-\d{2}-\d{2}$/.test(sp.semana ?? "") ? sp.semana! : hoje);
  const fim = new Date(ini.getTime() + 7 * DIA);
  const dias = Array.from({ length: 7 }, (_, i) => new Date(ini.getTime() + i * DIA + 12 * 3600_000));
  const [oss, equipes, cfg, semAgenda, comErro] = await Promise.all([
    prisma.ordemServico.findMany({
      where: { agendaInicio: { gte: ini, lt: fim } }, orderBy: { agendaInicio: "asc" },
      select: { id: true, numero: true, agendaInicio: true, agendaDuracaoMin: true, situacao: true, equipeId: true, googleEventoId: true, googleErro: true, cliente: { select: { nome: true, cidade: true } }, situacaoCfg: { select: { nome: true } } },
    }),
    prisma.equipe.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, googleAgendaId: true } }),
    configAgenda(),
    prisma.ordemServico.count({ where: { agendaInicio: null, situacao: { in: ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_PECA", "AGUARDANDO_APROVACAO"] } } }),
    prisma.ordemServico.count({ where: { googlePendente: true } }),
  ]);
  const linhas = [...equipes.map((e) => ({ id: e.id, nome: e.nome, google: !!e.googleAgendaId })), { id: "", nome: "Sem equipe", google: !!cfg.agendaPadrao }];
  const semana = (d: number) => diaISO(new Date(ini.getTime() + d * DIA + 12 * 3600_000));
  const hojeN = oss.filter((o) => diaISO(o.agendaInicio!) === hoje).length;
  const titulo = `${dias[0].toLocaleDateString("pt-BR", { timeZone: SP, day: "2-digit", month: "short" })} a ${dias[6].toLocaleDateString("pt-BR", { timeZone: SP, day: "2-digit", month: "short", year: "numeric" })}`;

  return (
    <Pagina titulo="Agenda das equipes" icone="calendario" trilha={[{ rotulo: "Ordens de serviços", href: "/os" }, { rotulo: "Agenda" }]}
      acoes={<div className="flex gap-2"><Link href="/os/adicionar" className="btn-verde">+ Nova OS</Link><Link href="/google-agenda" className="btn-sec">Google Agenda</Link></div>}>
      <Resumo cartoes={[
        { rotulo: "Agendadas na semana", valor: String(oss.length), legenda: titulo, icone: "calendario", cor: "tinta" },
        { rotulo: "Hoje", valor: String(hojeN), legenda: "visitas/serviços agendados para hoje", icone: "hoje", cor: hojeN ? "amarelo" : "cinza" },
        { rotulo: "OS abertas sem agendamento", valor: String(semAgenda), legenda: "informe \"Agendado para\" na OS", icone: "relogio", cor: semAgenda ? "azul" : "verde", href: "/os" },
        { rotulo: "Google Agenda", valor: cfg.ativo ? "Ligado" : "Desligado", legenda: cfg.ativo ? (comErro ? `${comErro} OS com erro ao enviar` : "eventos sincronizados") : "configure para os técnicos verem no celular", icone: cfg.ativo && !comErro ? "confirmado" : "alerta", cor: !cfg.ativo ? "cinza" : comErro ? "vermelho" : "verde", href: "/google-agenda" },
      ]} />

      <div className="mb-3 flex items-center gap-1">
        <Link href={`/os/agenda?semana=${semana(-7)}`} className="btn-sec">‹</Link>
        <Link href="/os/agenda" className="btn-sec">Hoje</Link>
        <Link href={`/os/agenda?semana=${semana(7)}`} className="btn-sec">›</Link>
        <span className="ml-2 text-[14px] font-semibold">{titulo}</span>
      </div>

      <div className="cartao overflow-x-auto">
        <table className="tabela min-w-[1000px] table-fixed">
          <thead>
            <tr>
              <th className="w-40">Equipe</th>
              {dias.map((d) => {
                const iso = diaISO(d);
                return <th key={iso} className={iso === hoje ? "bg-amber-50" : ""}>{d.toLocaleDateString("pt-BR", { timeZone: SP, weekday: "short" })} <span className="font-normal text-slate-500">{d.toLocaleDateString("pt-BR", { timeZone: SP, day: "2-digit", month: "2-digit" })}</span></th>;
              })}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id || "sem"} className="align-top">
                <td className="font-semibold">{l.nome}{cfg.ativo && <div className={`text-[11px] font-normal ${l.google ? "text-emerald-700" : "text-slate-400"}`}>{l.google ? "no Google Agenda" : "sem agenda do Google"}</div>}</td>
                {dias.map((d) => {
                  const iso = diaISO(d);
                  const doDia = oss.filter((o) => (o.equipeId ?? "") === l.id && diaISO(o.agendaInicio!) === iso);
                  return (
                    <td key={iso} className={`space-y-1 ${iso === hoje ? "bg-amber-50/40" : ""}`}>
                      {doDia.map((o) => (
                        <Link key={o.id} href={`/os/${o.id}`} className={`block rounded border px-1.5 py-1 text-[11px] leading-tight hover:shadow-sm ${COR[o.situacao] ?? COR.ABERTA}`}
                          title={`${o.situacaoCfg?.nome ?? o.situacao}${o.googleErro ? ` · Google: ${o.googleErro}` : ""}`}>
                          <b>{hora(o.agendaInicio!)}</b> · OS {o.numero}{o.googleErro && <span className="text-red-700"> ⚠</span>}
                          <div className="truncate text-slate-600">{o.cliente.nome}</div>
                          {o.cliente.cidade && <div className="truncate text-slate-400">{o.cliente.cidade}</div>}
                        </Link>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12px] text-slate-500">Para agendar, abra a OS e preencha &quot;Agendado para&quot; no bloco dos responsáveis. Com o Google Agenda ligado, a OS vira um evento na agenda da equipe.</p>
    </Pagina>
  );
}
