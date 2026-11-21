"use client";

import { useActionState } from "react";
import { definirSenha, type Estado } from "../../acoes";

export default function FormSenha({ token, login }: { token: string; login: string }) {
  const [estado, act, pendente] = useActionState<Estado, FormData>(definirSenha, null);
  return (
    <form action={act} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {/* ajuda o gerenciador de senhas do celular a salvar o login certo */}
      <input type="text" name="usuario" value={login} autoComplete="username" readOnly hidden />
      <div className="rounded-md bg-slate-50 px-3 py-2 text-[13px]"><span className="text-slate-500">Seu login:</span> <b>{login}</b></div>
      <label className="block">
        <span className="rotulo">Nova senha (mínimo 8 caracteres)</span>
        <input name="senha" type="password" minLength={8} autoComplete="new-password" className="campo h-11 text-[15px]" required autoFocus />
      </label>
      <label className="block">
        <span className="rotulo">Repita a senha</span>
        <input name="confirma" type="password" minLength={8} autoComplete="new-password" className="campo h-11 text-[15px]" required />
      </label>
      {estado?.erro && <p className="text-[13px] text-red-700">{estado.erro}</p>}
      <button className="btn-marca h-11 w-full justify-center text-[15px]" disabled={pendente}>{pendente ? "Salvando…" : "Salvar senha e entrar"}</button>
    </form>
  );
}
