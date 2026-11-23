"use client";

import { useActionState } from "react";
import { criarPrimeiroAdmin, type EstadoLogin } from "./actions";

/** Só aparece enquanto não existe nenhum usuário (primeira vez que o sistema é aberto). */
export default function PrimeiroAdmin() {
  const [estado, act, pendente] = useActionState<EstadoLogin, FormData>(criarPrimeiroAdmin, null);
  return (
    <form action={act} className="cartao space-y-4 p-7 shadow-lg shadow-slate-200/60">
      <h2 className="text-[22px] font-semibold text-slate-800">Primeiro acesso</h2>
      <p className="text-sm text-slate-600">Crie o usuário administrador. Os demais usuários você cria depois em Usuários.</p>
      <input name="nome" placeholder="Seu nome" className="campo h-11 w-full" required />
      <input name="email" type="email" placeholder="E-mail (será o login)" autoComplete="username" className="campo h-11 w-full" required />
      <input name="senha" type="password" placeholder="Senha (mín. 8)" minLength={8} autoComplete="new-password" className="campo h-11 w-full" required />
      <input name="confirma" type="password" placeholder="Repita a senha" minLength={8} autoComplete="new-password" className="campo h-11 w-full" required />
      {estado?.erro && <p className="text-sm text-red-700">{estado.erro}</p>}
      <button className="btn-marca h-11 w-full" disabled={pendente}>Criar administrador e entrar</button>
    </form>
  );
}
