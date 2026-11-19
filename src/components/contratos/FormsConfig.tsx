"use client";

import { useActionState } from "react";
import { salvarConfigContratosAcao, salvarEmailAcao, type Resultado } from "@/lib/contratos/acoes";
import type { ConfigContratos } from "@/lib/contratos/config";
import type { ConfigEmailTela } from "@/lib/email/email";
import { TAGS_CONTRATO } from "@/lib/contratos/tipos";
import { Bloco, Campo } from "@/components/ui/Pagina";

function Msg({ e }: { e: Resultado }) {
  return e ? <p className={`text-[13px] ${e.ok ? "text-emerald-700" : "text-red-700"}`}>{e.mensagem}</p> : null;
}

export function FormConfigContratos({ c, situacoes }: { c: ConfigContratos; situacoes: { id: string; nome: string }[] }) {
  const [e, act, p] = useActionState<Resultado, FormData>(salvarConfigContratosAcao, null);
  return (
    <form action={act}>
      <Bloco icone="configuracoes" titulo={<>Venda gerada e <b>padrões</b></>} subtitulo="Como a venda de cada cobrança é lançada e os valores que o formulário sugere.">
        <div className="grid gap-3 md:grid-cols-3">
          <Campo rotulo="Situação da venda gerada">
            <select name="situacaoVendaId" defaultValue={c.situacaoVendaId} className="campo">
              <option value="">Padrão (a que lança estoque e financeiro, ex.: Concretizada)</option>
              {situacoes.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Gerar a venda quantos dias antes (padrão)"><input name="diasAntecedencia" defaultValue={c.diasAntecedencia} inputMode="numeric" className="campo" /></Campo>
          <Campo rotulo="Lembrete quantos dias antes (padrão; 0 = sem)"><input name="diasLembrete" defaultValue={c.diasLembrete} inputMode="numeric" className="campo" /></Campo>
        </div>
        <p className="mt-2 text-[12px] text-slate-500">Só aparecem as situações que lançam o financeiro. A NFS-e automática precisa de uma situação que conclua a venda (lança o estoque).</p>
      </Bloco>
      <Bloco icone="email" titulo={<>Textos dos <b>e-mails</b></>} subtitulo={`Tags: ${TAGS_CONTRATO.join(" ")}`}>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Campo rotulo="Assunto da cobrança"><input name="assuntoBoleto" defaultValue={c.assuntoBoleto} className="campo" /></Campo>
            <Campo rotulo="Texto da cobrança (o boleto vai em anexo)"><textarea name="textoBoleto" defaultValue={c.textoBoleto} className="campo min-h-56 font-mono text-[12px]" /></Campo>
          </div>
          <div className="space-y-2">
            <Campo rotulo="Assunto do lembrete"><input name="assuntoLembrete" defaultValue={c.assuntoLembrete} className="campo" /></Campo>
            <Campo rotulo="Texto do lembrete"><textarea name="textoLembrete" defaultValue={c.textoLembrete} className="campo min-h-56 font-mono text-[12px]" /></Campo>
          </div>
        </div>
      </Bloco>
      <div className="mb-6 flex items-center gap-3"><button className="btn-verde" disabled={p}>{p ? "Salvando…" : "Salvar configurações"}</button><Msg e={e} /></div>
    </form>
  );
}

export function FormEmail({ c, admin }: { c: ConfigEmailTela | null; admin: boolean }) {
  const [e, act, p] = useActionState<Resultado, FormData>(salvarEmailAcao, null);
  return (
    <form action={act}>
      <Bloco icone="envios" titulo={<>E-mail de <b>envio</b> (SMTP)</>} subtitulo="Conta usada para mandar as cobranças e os lembretes. Gmail/Google Workspace: smtp.gmail.com, porta 465 (SSL) e uma senha de app.">
        <fieldset disabled={!admin} className="grid gap-3 md:grid-cols-4">
          <Campo rotulo="Servidor SMTP" obrigatorio className="md:col-span-2"><input name="host" defaultValue={c?.host ?? ""} placeholder="smtp.gmail.com" className="campo" /></Campo>
          <Campo rotulo="Porta"><input name="porta" defaultValue={c?.porta ?? 465} inputMode="numeric" className="campo" /></Campo>
          <label className="flex items-end gap-2 pb-2 text-[13px]"><input type="checkbox" name="seguro" defaultChecked={c?.seguro ?? true} /> Conexão SSL/TLS (porta 465)</label>
          <Campo rotulo="Usuário" className="md:col-span-2"><input name="usuario" defaultValue={c?.usuario ?? ""} autoComplete="off" className="campo" /></Campo>
          <Campo rotulo={`Senha${c?.temSenha ? " (já salva; em branco mantém)" : ""}`} className="md:col-span-2"><input name="senha" type="password" autoComplete="new-password" className="campo" /></Campo>
          <Campo rotulo="E-mail do remetente" obrigatorio className="md:col-span-2"><input name="remetente" defaultValue={c?.remetente ?? ""} placeholder="financeiro@mxtech.inf.br" className="campo" /></Campo>
          <Campo rotulo="Nome do remetente" className="md:col-span-2"><input name="nomeRemetente" defaultValue={c?.nomeRemetente ?? ""} placeholder="MXTECH" className="campo" /></Campo>
          <Campo rotulo="Cópia oculta de todos os envios (opcional)" className="md:col-span-2"><input name="copiaPara" defaultValue={c?.copiaPara ?? ""} className="campo" /></Campo>
          <Campo rotulo="Mandar um e-mail de teste para (opcional)" className="md:col-span-2"><input name="teste" className="campo" /></Campo>
        </fieldset>
        {!admin && <p className="mt-2 text-[12px] text-slate-500">Só o administrador altera o e-mail de envio.</p>}
      </Bloco>
      {admin && <div className="flex items-center gap-3"><button className="btn-verde" disabled={p}>{p ? "Salvando…" : "Salvar e-mail"}</button><Msg e={e} /></div>}
    </form>
  );
}
