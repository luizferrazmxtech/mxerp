"use client";

import { useActionState } from "react";
import { salvarWhatsappAcao, type Resultado } from "@/lib/whatsapp/acoes";
import type { ConfigWhatsappTela } from "@/lib/whatsapp/mxchat";
import { Bloco, Campo } from "@/components/ui/Pagina";

/** Configurações → WhatsApp (MXChat): endereço da API, token (cifrado no servidor) e opções. */
export default function FormWhatsapp({ c, admin }: { c: ConfigWhatsappTela; admin: boolean }) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(salvarWhatsappAcao, null);
  return (
    <form action={acao}>
      <Bloco icone="whatsapp" titulo={<>API do <b>MXChat</b></>} subtitulo="Conta usada para mandar o status das OS e as cobranças dos contratos por WhatsApp. O token fica cifrado no servidor e não volta para a tela.">
        <fieldset disabled={!admin} className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 text-[13px] md:col-span-2"><input type="checkbox" name="ativo" defaultChecked={c.ativo} /> <b>Ligar o envio por WhatsApp</b></label>
          <Campo rotulo="Endereço da API" className="md:col-span-2"><input name="url" defaultValue={c.url} className="campo font-mono text-[12px]" /></Campo>
          <Campo rotulo={`Token${c.temToken ? " (já salvo; em branco mantém)" : ""}`} obrigatorio={!c.temToken}>
            <input name="token" type="password" autoComplete="new-password" placeholder={c.temToken ? "••••••••" : "Token cadastrado no MXChat"} className="campo" />
          </Campo>
          {c.temToken ? <label className="flex items-end gap-2 pb-2 text-[13px]"><input type="checkbox" name="apagarToken" /> Apagar o token salvo</label> : <span />}
          <label className="flex items-center gap-2 text-[13px] md:col-span-2"><input type="checkbox" name="salvarNoTicket" defaultChecked={c.salvarNoTicket} /> Guardar a mensagem no atendimento do MXChat (a resposta do cliente cai no ticket)</label>
          <label className="flex items-center gap-2 text-[13px] md:col-span-2"><input type="checkbox" name="convidarAreaCliente" defaultChecked={c.convidarAreaCliente} /> Nos avisos automáticos da OS, se o cliente ainda não tem senha da Área do Cliente, mandar o link para ele criar a senha (habilita a Área do Cliente dele)</label>
          <Campo rotulo="Mandar mensagem de teste para (opcional)" className="md:col-span-2"><input name="teste" inputMode="tel" placeholder="(11) 98765-4321 — o seu celular" className="campo max-w-xs" /></Campo>
        </fieldset>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {admin ? <button className="btn-verde" disabled={pendente}>{pendente ? "Salvando…" : "Salvar"}</button> : <p className="text-[13px] text-slate-500">Só o administrador altera esta configuração.</p>}
          {r && <p className={`text-[13px] ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.mensagem}</p>}
        </div>
      </Bloco>
    </form>
  );
}
