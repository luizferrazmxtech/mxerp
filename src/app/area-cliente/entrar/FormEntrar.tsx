"use client";

import Link from "next/link";
import { useActionState } from "react";
import { entrarCliente, type Estado } from "../acoes";

export default function FormEntrar({ voltar }: { voltar: string }) {
  const [estado, act, pendente] = useActionState<Estado, FormData>(entrarCliente, null);
  return (
    <form action={act} className="space-y-4">
      <input type="hidden" name="voltar" value={voltar} />
      <label className="block">
        <span className="rotulo">CPF, CNPJ ou e-mail</span>
        <input name="login" autoComplete="username" inputMode="email" className="campo h-11 text-[15px]" required autoFocus />
      </label>
      <label className="block">
        <span className="rotulo">Senha</span>
        <input name="senha" type="password" autoComplete="current-password" className="campo h-11 text-[15px]" required />
      </label>
      {estado?.erro && <p className="text-[13px] text-red-700">{estado.erro}</p>}
      <button className="btn-marca h-11 w-full justify-center text-[15px]" disabled={pendente}>{pendente ? "Entrando…" : "Entrar"}</button>
      <div className="text-center"><Link href="/area-cliente/esqueci" className="text-[13px] text-marca hover:underline">Esqueci minha senha</Link></div>
    </form>
  );
}
