"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import { trocarSenha, type Estado } from "./actions";

export default function TrocarSenha() {
  const [e, , p, formAct] = useFormAcao<Estado>(trocarSenha, null);
  return (
    <form {...formAct} className="cartao space-y-3 p-4">
      <input name="atual" type="password" placeholder="Senha atual" className="campo w-full" required autoComplete="current-password" />
      <input name="nova" type="password" placeholder="Nova senha (mín. 8)" minLength={8} className="campo w-full" required autoComplete="new-password" />
      <input name="confirma" type="password" placeholder="Repita a nova senha" minLength={8} className="campo w-full" required autoComplete="new-password" />
      <button className="btn" disabled={p}>Trocar senha</button>
      {e && <p className={`text-sm ${e.ok ? "text-emerald-700" : "text-red-700"}`}>{e.mensagem}</p>}
    </form>
  );
}
