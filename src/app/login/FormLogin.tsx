"use client";

import { useActionState } from "react";
import { entrar, type EstadoLogin } from "./actions";

export default function FormLogin({ voltar }: { voltar: string }) {
  const [estado, act, pendente] = useActionState<EstadoLogin, FormData>(entrar, null);
  return (
    <form action={act} className="cartao w-full max-w-sm space-y-4 p-6">
      <div className="text-center text-2xl font-bold tracking-tight">MX<span className="text-marca">ERP</span></div>
      <input type="hidden" name="voltar" value={voltar} />
      <label className="block space-y-1 text-sm">
        <span>E-mail</span>
        <input name="email" type="email" autoComplete="username" className="campo w-full" required autoFocus />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Senha</span>
        <input name="senha" type="password" autoComplete="current-password" className="campo w-full" required />
      </label>
      {estado?.erro && <p className="text-sm text-red-700">{estado.erro}</p>}
      <button className="btn w-full" disabled={pendente}>{pendente ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
