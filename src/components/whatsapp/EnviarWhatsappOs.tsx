"use client";

import Link from "next/link";
import { useActionState } from "react";
import { enviarWhatsappOsAcao, type Resultado } from "@/lib/whatsapp/acoes";
import Icone from "@/components/Icone";

/** Painel "Enviar pelo WhatsApp (MXChat)" da visualização da OS: número e texto já preenchidos, editáveis. */
export default function EnviarWhatsappOs({ id, numeroOs, fone, texto, temSenha, voltar }: {
  id: string; numeroOs: number; fone: string; texto: string; temSenha: boolean; voltar: string;
}) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(enviarWhatsappOsAcao, null);
  return (
    <div className="cartao mb-3 p-4">
      <form action={acao} className="space-y-3">
        <input type="hidden" name="id" value={id} />
        <div className="flex items-center gap-2 font-semibold"><Icone nome="whatsapp" size={16} /> Enviar a OS nº {numeroOs} pelo WhatsApp (MXChat)</div>
        <div className="grid gap-3 md:grid-cols-[220px_1fr]">
          <label><span className="rotulo obrig">WhatsApp do cliente</span>
            <input name="numero" defaultValue={fone} required inputMode="tel" placeholder="(11) 98765-4321" className="campo" />
            <span className="mt-1 block text-[11px] text-slate-500">Celular do cadastro. Pode trocar só para este envio.</span></label>
          <label><span className="rotulo obrig">Mensagem</span>
            <textarea name="texto" defaultValue={texto} required rows={8} className="campo h-auto font-mono text-[12px]" />
            <span className="mt-1 block text-[11px] text-slate-500">*texto* fica em negrito no WhatsApp. O texto vem do modelo em Ordens de serviços → Mensagens.</span></label>
        </div>
        {!temSenha && (
          <label className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            <input type="checkbox" name="convidar" defaultChecked className="mt-1" />
            <span>O cliente ainda não criou a senha da Área do Cliente: mandar no lugar do link da OS o link para ele criar a senha (vale 7 dias). Depois de entrar, ele vê esta e as outras OS.</span>
          </label>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Link href={voltar} className="btn-sec">Fechar</Link>
          <button className="btn bg-emerald-600 hover:bg-emerald-700" disabled={pendente}><Icone nome="whatsapp" size={15} /> {pendente ? "Enviando…" : "Enviar"}</button>
          {r && <span className={`rounded px-3 py-1.5 text-[13px] ${r.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{r.mensagem}</span>}
        </div>
      </form>
    </div>
  );
}
