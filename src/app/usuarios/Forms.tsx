"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import { criarUsuario, redefinirSenha, type Estado } from "./actions";

const Msg = ({ e }: { e: Estado }) => (e ? <p className={`text-sm ${e.ok ? "text-emerald-700" : "text-red-700"}`}>{e.mensagem}</p> : null);

export function NovoUsuario({ papeis }: { papeis: [string, string][] }) {
  const [e, , p, formAct] = useFormAcao<Estado>(criarUsuario, null);
  return (
    <form {...formAct} className="cartao grid gap-3 p-4 sm:grid-cols-2">
      <div className="font-medium sm:col-span-2">Novo usuário</div>
      <input name="nome" placeholder="Nome" className="campo" required />
      <input name="email" type="email" placeholder="E-mail (é o login)" className="campo" required />
      <select name="papel" className="campo" defaultValue="OPERADOR">
        {papeis.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
      </select>
      <input name="senha" type="password" placeholder="Senha inicial (mín. 8)" minLength={8} className="campo" required autoComplete="new-password" />
      <div className="flex gap-4 text-sm sm:col-span-2">
        <label className="flex items-center gap-2"><input type="checkbox" name="tecnico" /> É técnico (aparece nas OS)</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="vendedor" /> É vendedor</label>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn" disabled={p}>Criar</button>
        <Msg e={e} />
      </div>
    </form>
  );
}

export function RedefinirSenha({ id }: { id: string }) {
  const [e, , p, formAct] = useFormAcao<Estado>(redefinirSenha, null);
  return (
    <form {...formAct} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="senha" type="password" placeholder="Nova senha" minLength={8} className="campo w-36" required autoComplete="new-password" />
      <button className="btn-sec" disabled={p}>Redefinir</button>
      <Msg e={e} />
    </form>
  );
}
