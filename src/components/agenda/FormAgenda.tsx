"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import { salvarAgendaAcao, type Resultado } from "@/lib/agenda/acoes";
import type { ConfigAgendaTela } from "@/lib/agenda/google";
import { DURACOES_AGENDA } from "@/lib/os/tipos";
import { Bloco, Campo } from "@/components/ui/Pagina";

/** Conta de serviço do Google e a agenda de cada equipe. */
export default function FormAgenda({ c, equipes, admin }: { c: ConfigAgendaTela; equipes: { id: string; nome: string; googleAgendaId: string | null }[]; admin: boolean }) {
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(salvarAgendaAcao, null);
  return (
    <form {...formAcao}>
      <Bloco icone="ajustes" titulo={<>Conta de <b>serviço</b> do Google</>} subtitulo="No Google Cloud: crie um projeto, ative a Google Calendar API, crie uma conta de serviço e baixe a chave .json. A chave fica cifrada no servidor.">
        <fieldset disabled={!admin} className="grid gap-3 md:grid-cols-4">
          <label className="flex items-center gap-2 text-[13px] md:col-span-4"><input type="checkbox" name="ativo" defaultChecked={c.ativo} /> <b>Ligar o Google Agenda</b> (cada OS agendada vira um evento na agenda da equipe)</label>
          <Campo rotulo={`Arquivo .json da conta de serviço${c.temChave ? " (já enviado; em branco mantém)" : ""}`} className="md:col-span-2"><input type="file" name="arquivo" accept=".json,application/json" className="campo" /></Campo>
          <Campo rotulo="Duração padrão da visita"><select name="duracaoPadraoMin" defaultValue={c.duracaoPadraoMin} className="campo">{DURACOES_AGENDA.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Campo>
          {c.temChave ? <label className="flex items-end gap-2 pb-2 text-[13px]"><input type="checkbox" name="apagarChave" /> Apagar a chave salva</label> : <span />}
          {c.contaServico && <p className="rounded bg-slate-50 px-2 py-1 text-[12px] md:col-span-4">Compartilhe cada agenda com <b className="select-all font-mono">{c.contaServico}</b> e marque &quot;Fazer alterações nos eventos&quot;.</p>}
        </fieldset>
      </Bloco>
      <Bloco icone="calendario" titulo={<>Agenda de cada <b>equipe</b></>} subtitulo="No Google Agenda: Configurações da agenda → Integrar agenda → ID da agenda (algo como abc123@group.calendar.google.com). Os técnicos assinam a agenda da equipe no celular.">
        <fieldset disabled={!admin} className="grid gap-3 md:grid-cols-2">
          {equipes.map((e) => <Campo key={e.id} rotulo={e.nome}><input name={`equipe:${e.id}`} defaultValue={e.googleAgendaId ?? ""} placeholder="ID da agenda da equipe" className="campo font-mono text-[12px]" /></Campo>)}
          <Campo rotulo="OS sem equipe (ou equipe sem agenda)"><input name="agendaPadrao" defaultValue={c.agendaPadrao} placeholder="ID da agenda geral (opcional)" className="campo font-mono text-[12px]" /></Campo>
          {!equipes.length && <p className="text-[13px] text-slate-500">Nenhuma equipe cadastrada: cadastre em Ordens de serviços › Opções auxiliares › Equipes, ou use só a agenda geral.</p>}
        </fieldset>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {admin ? <button className="btn-verde" disabled={pendente}>{pendente ? "Salvando e conferindo…" : "Salvar e conferir as agendas"}</button> : <p className="text-[13px] text-slate-500">Só o administrador altera esta configuração.</p>}
          {r && <p className={`text-[13px] ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.mensagem}</p>}
        </div>
      </Bloco>
    </form>
  );
}
