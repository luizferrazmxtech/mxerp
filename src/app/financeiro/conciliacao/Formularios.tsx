"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import Link from "next/link";
import { confirmarSugestoes, enviarExtrato, puxarInter, type Estado } from "./actions";

function Msg({ e }: { e: Estado }) {
  return e ? <p className={`text-sm ${e.ok ? "text-emerald-700" : "text-red-700"}`}>{e.mensagem}</p> : null;
}

export function EnviarExtrato({ contas }: { contas: { id: string; nome: string }[] }) {
  const [e, , p, formAct] = useFormAcao<Estado>(enviarExtrato, null);
  return (
    <form {...formAct} className="cartao space-y-2 p-4">
      <div className="text-sm font-medium">Subir extrato (OFX, CSV ou Excel)</div>
      <div className="flex flex-wrap gap-2">
        <select name="contaBancariaId" className="campo w-48" required defaultValue="">
          <option value="" disabled>Conta…</option>
          {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <input type="file" name="arquivo" accept=".ofx,.csv,.txt,.xlsx" className="campo flex-1" required />
        <button className="btn" disabled={p}>{p ? "Lendo…" : "Enviar"}</button>
      </div>
      <Msg e={e} />
    </form>
  );
}

export function PuxarInter({ configurado, aviso, ultima }: { configurado: boolean; aviso?: string | null; ultima?: string | null }) {
  const [e, , p, formAct] = useFormAcao<Estado>(puxarInter, null);
  return (
    <form {...formAct} className="cartao space-y-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">Banco Inter (API)</div>
        <Link href="/financeiro/conciliacao/inter" className="text-sm underline">{configurado ? "Configuração" : "Configurar"}</Link>
      </div>
      {configurado ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          Puxar os últimos
          <select name="dias" className="campo w-24" defaultValue="7">
            {[3, 7, 15, 30, 60, 90].map((d) => <option key={d} value={d}>{d} dias</option>)}
          </select>
          <button className="btn" disabled={p}>{p ? "Buscando…" : "Buscar extrato"}</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          Ainda não configurada.
          <Link href="/financeiro/conciliacao/inter" className="btn">Configurar Banco Inter</Link>
        </div>
      )}
      {configurado && aviso && <p className="text-sm text-red-700">Último teste falhou: {aviso}</p>}
      {configurado && ultima && <p className="text-xs text-slate-500">{ultima}</p>}
      <Msg e={e} />
    </form>
  );
}

export function ConfirmarSugestoes({ n }: { n: number }) {
  const [e, , p, formAct] = useFormAcao<Estado>(confirmarSugestoes, null);
  if (!n && !e) return null;
  return (
    <form {...formAct} className="flex items-center gap-2">
      {n > 0 && <button className="btn" disabled={p}>{p ? "Baixando…" : `Confirmar as ${n} sugestões`}</button>}
      <Msg e={e} />
    </form>
  );
}
