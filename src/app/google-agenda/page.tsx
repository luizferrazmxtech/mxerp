import Link from "next/link";
import { exigirArea } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { configAgendaTela } from "@/lib/agenda/google";
import { reenviarAgendaAcao } from "@/lib/agenda/acoes";
import { dataHora } from "@/lib/ui/format";
import { Bloco, Pagina } from "@/components/ui/Pagina";
import BotaoAcao from "@/components/BotaoAcao";
import FormAgenda from "@/components/agenda/FormAgenda";

export const dynamic = "force-dynamic";
export const metadata = { title: "Google Agenda" };

/** Configurações → Integrações → Google Agenda: OS agendadas na agenda do Google de cada equipe. */
export default async function GoogleAgendaPagina() {
  const u = await exigirArea("/google-agenda");
  const [c, equipes, erros] = await Promise.all([
    configAgendaTela(),
    prisma.equipe.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, googleAgendaId: true } }),
    prisma.ordemServico.findMany({ where: { googlePendente: true }, orderBy: { agendaInicio: "asc" }, take: 20, select: { id: true, numero: true, agendaInicio: true, googleErro: true } }),
  ]);
  return (
    <Pagina titulo="Google Agenda" icone="calendario" trilha={[{ rotulo: "Configurações" }, { rotulo: "Integrações" }, { rotulo: "Google Agenda" }]}
      acoes={<Link href="/os/agenda" className="btn-sec">Agenda das equipes</Link>}>
      <div className="mb-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] text-sky-900">
        <b>Como funciona:</b> na OS, preencha <b>Agendado para</b> (e a duração) no bloco dos responsáveis. Ao salvar, a OS vira um evento na agenda do Google da equipe, com o cliente, o endereço, os equipamentos e o defeito.
        Trocar a data, a equipe ou a situação atualiza o evento; cancelar ou excluir a OS apaga. Cada técnico adiciona a agenda da equipe no Google Agenda do celular.
      </div>
      {!!erros.length && (
        <Bloco icone="alerta" titulo={<>OS com <b>erro</b> ao enviar</>} subtitulo="O agendador tenta de novo de hora em hora." corpo="p-0">
          <table className="tabela">
            <thead><tr><th>OS</th><th>Agendada para</th><th>Erro</th></tr></thead>
            <tbody>{erros.map((o) => <tr key={o.id}><td><Link href={`/os/${o.id}`} className="text-marca hover:underline">nº {o.numero}</Link></td><td>{o.agendaInicio ? dataHora(o.agendaInicio) : "—"}</td><td className="text-[12px] text-red-700">{o.googleErro}</td></tr>)}</tbody>
          </table>
        </Bloco>
      )}
      <FormAgenda c={c} equipes={equipes} admin={u.papel === "ADMIN"} />
      {c.ativo && <div className="flex items-center gap-3"><BotaoAcao acao={reenviarAgendaAcao} campos={{}} rotulo="Reenviar todas as OS agendadas de hoje em diante" secundario /></div>}
    </Pagina>
  );
}
