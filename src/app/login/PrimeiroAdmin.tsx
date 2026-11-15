"use client";

import { useActionState } from "react";
import { criarPrimeiroAdmin, type EstadoLogin } from "./actions";

/** Só aparece enquanto não existe nenhum usuário (primeira vez que o sistema é aberto). */
export default function PrimeiroAdmin() {
  const [estado, act, pendente] = useActionState<EstadoLogin, FormData>(criarPrimeiroAdmin, null);
  return (
    <form action={act} className="cartao w-full max-w-sm space-y-4 p-6">
      <div className="text-center text-2xl font-bold tracking-tight">MX<span className="text-marca">ERP</span></div>
      <p className="text-sm text-slate-600">Primeiro acesso: crie o usuário administrador. Os demais usuários você cria depois em Usuários.</p>
      <input name="nome" placeholder="Seu nome" className="campo w-full" required />
      <input name="email" type="email" placeholder="E-mail (será o login)" autoComplete="username" className="campo w-full" required />
      <input name="senha" type="password" placeholder="Senha (mín. 8)" minLength={8} autoComplete="new-password" className="campo w-full" required />
      <input name="confirma" type="password" placeholder="Repita a senha" minLength={8} autoComplete="new-password" className="campo w-full" required />
      {estado?.erro && <p className="text-sm text-red-700">{estado.erro}</p>}
      <button className="btn w-full" disabled={pendente}>Criar administrador e entrar</button>
    </form>
  );
}
