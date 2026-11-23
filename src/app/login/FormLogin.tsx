"use client";

import { useActionState, useState } from "react";
import Icone from "@/components/Icone";
import { entrar, type EstadoLogin } from "./actions";

export default function FormLogin({ voltar }: { voltar: string }) {
  const [estado, act, pendente] = useActionState<EstadoLogin, FormData>(entrar, null);
  const [ver, setVer] = useState(false);
  return (
    <form action={act} className="cartao space-y-5 p-7 shadow-lg shadow-slate-200/60">
      <div>
        <h2 className="text-[24px] font-semibold text-slate-800">Bem-vindo</h2>
        <p className="mt-1 text-[14px] text-slate-500">Entre com seu e-mail e senha para acessar o sistema.</p>
      </div>
      <input type="hidden" name="voltar" value={voltar} />
      <label className="block space-y-1.5 text-[13px] font-semibold text-slate-700">
        <span>E-mail</span>
        <span className="relative block">
          <Icone nome="email" size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input name="email" type="email" autoComplete="username" placeholder="voce@empresa.com.br" className="campo h-11 pl-10 text-[15px] font-normal" required autoFocus />
        </span>
      </label>
      <label className="block space-y-1.5 text-[13px] font-semibold text-slate-700">
        <span>Senha</span>
        <span className="relative block">
          <Icone nome="senha" size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input name="senha" type={ver ? "text" : "password"} autoComplete="current-password" placeholder="Sua senha" className="campo h-11 pl-10 pr-16 text-[15px] font-normal" required />
          <button type="button" onClick={() => setVer((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[12px] font-normal text-slate-500 hover:bg-slate-100">
            {ver ? "Ocultar" : "Mostrar"}
          </button>
        </span>
      </label>
      {estado?.erro && (
        <p className="flex items-start gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700"><Icone nome="alerta" size={15} className="mt-0.5 shrink-0" />{estado.erro}</p>
      )}
      <button className="btn-marca h-11 w-full text-[15px]" disabled={pendente}>{pendente ? "Entrando…" : "Entrar"}</button>
      <p className="text-center text-[12px] text-slate-400">Esqueceu a senha? Fale com o administrador do sistema.</p>
    </form>
  );
}
