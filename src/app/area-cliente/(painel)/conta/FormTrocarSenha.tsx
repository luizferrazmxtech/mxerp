"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import { trocarSenhaCliente, type Estado } from "../../acoes";

export default function FormTrocarSenha() {
  const [estado, , pendente, formAct] = useFormAcao<Estado>(trocarSenhaCliente, null);
  return (
    <form {...formAct} className="max-w-sm space-y-3" key={estado?.ok ? "ok" : "form"}>
      <label className="block"><span className="rotulo">Senha atual</span><input name="atual" type="password" autoComplete="current-password" className="campo h-10" required /></label>
      <label className="block"><span className="rotulo">Nova senha (mínimo 8 caracteres)</span><input name="nova" type="password" minLength={8} autoComplete="new-password" className="campo h-10" required /></label>
      <label className="block"><span className="rotulo">Repita a nova senha</span><input name="confirma" type="password" minLength={8} autoComplete="new-password" className="campo h-10" required /></label>
      {estado?.erro && <p className="text-[13px] text-red-700">{estado.erro}</p>}
      {estado?.ok && <p className="text-[13px] text-emerald-700">{estado.ok}</p>}
      <button className="btn-marca" disabled={pendente}>{pendente ? "Salvando…" : "Trocar senha"}</button>
    </form>
  );
}
