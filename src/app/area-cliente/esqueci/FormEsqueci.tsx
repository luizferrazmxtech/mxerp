"use client";

import Link from "next/link";
import { useActionState } from "react";
import { esqueciSenha, type Estado } from "../acoes";

export default function FormEsqueci() {
  const [estado, act, pendente] = useActionState<Estado, FormData>(esqueciSenha, null);
  if (estado?.ok) return (
    <div className="space-y-4">
      <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-[13px] text-emerald-800">{estado.ok}</p>
      <Link href="/area-cliente/entrar" className="btn-sec h-11 w-full justify-center">Voltar para entrar</Link>
    </div>
  );
  return (
    <form action={act} className="space-y-4">
      <label className="block">
        <span className="rotulo">CPF, CNPJ ou e-mail</span>
        <input name="login" autoComplete="username" className="campo h-11 text-[15px]" required autoFocus />
      </label>
      {estado?.erro && <p className="text-[13px] text-red-700">{estado.erro}</p>}
      <button className="btn-marca h-11 w-full justify-center text-[15px]" disabled={pendente}>{pendente ? "Enviando…" : "Mandar link por e-mail"}</button>
      <div className="text-center"><Link href="/area-cliente/entrar" className="text-[13px] text-marca hover:underline">Voltar</Link></div>
    </form>
  );
}
