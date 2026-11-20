"use client";
import { useActionState } from "react";

type Acao = (s: unknown, f: FormData) => Promise<{ erro?: string } | undefined>;
export default function Formulario({ acao, primeiro }: { acao: Acao; primeiro?: boolean }) {
  const [estado, enviar, ocupado] = useActionState(acao, undefined);
  return (
    <form action={enviar} className="space-y-3">
      {estado?.erro && <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-red-800">{estado.erro}</div>}
      {primeiro && <label className="block"><span className="rotulo">Seu nome</span><input name="nome" className="campo" required /></label>}
      <label className="block"><span className="rotulo">E-mail</span><input name="email" type="email" className="campo" required autoFocus /></label>
      <label className="block"><span className="rotulo">Senha{primeiro ? " (mín. 8)" : ""}</span><input name="senha" type="password" className="campo" required minLength={primeiro ? 8 : undefined} /></label>
      <button className="btn-marca w-full" disabled={ocupado}>{primeiro ? "Criar e entrar" : "Entrar"}</button>
    </form>
  );
}
