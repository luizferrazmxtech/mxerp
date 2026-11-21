"use client";

import { useActionState } from "react";
import { salvarOpenFinanceAcao, vincularContaAcao, type Resultado } from "@/lib/openfinance/acoes";
import type { ConfigOpenFinanceTela } from "@/lib/openfinance/openfinance";
import { Bloco, Campo } from "@/components/ui/Pagina";

/** Credenciais do Pluggy (agregador do Open Finance). */
export default function FormOpenFinance({ c, admin }: { c: ConfigOpenFinanceTela; admin: boolean }) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(salvarOpenFinanceAcao, null);
  return (
    <form action={acao}>
      <Bloco icone="ajustes" titulo={<>Credenciais do <b>Pluggy</b></>} subtitulo="Crie a conta em dashboard.pluggy.ai, abra Applications e copie o Client ID e o Client Secret. O secret fica cifrado no servidor.">
        <fieldset disabled={!admin} className="grid gap-3 md:grid-cols-4">
          <label className="flex items-center gap-2 text-[13px] md:col-span-4"><input type="checkbox" name="ativo" defaultChecked={c.ativo} /> <b>Ligar o Open Finance</b> (extrato de hora em hora na conciliação)</label>
          <Campo rotulo="Client ID"><input name="clientId" defaultValue={c.clientId} className="campo" /></Campo>
          <Campo rotulo={`Client Secret${c.temSecret ? " (já salvo; em branco mantém)" : ""}`}><input name="clientSecret" type="password" autoComplete="new-password" placeholder={c.temSecret ? "••••••••" : ""} className="campo" /></Campo>
          <Campo rotulo="Ao conectar, importar os últimos (dias)"><input name="diasRetroativos" defaultValue={c.diasRetroativos} className="campo text-right" inputMode="numeric" /></Campo>
          {c.temSecret ? <label className="flex items-end gap-2 pb-2 text-[13px]"><input type="checkbox" name="apagarSecret" /> Apagar o secret salvo</label> : <span />}
        </fieldset>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {admin ? <button className="btn-verde" disabled={pendente}>{pendente ? "Salvando e testando…" : "Salvar e testar"}</button> : <p className="text-[13px] text-slate-500">Só o administrador altera esta configuração.</p>}
          {r && <p className={`text-[13px] ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.mensagem}</p>}
        </div>
      </Bloco>
    </form>
  );
}

/** Em qual conta bancária do ERP o extrato desta conta do banco entra. */
export function VincularConta({ id, contaBancariaId, importarDesde, contas }: { id: string; contaBancariaId: string | null; importarDesde: string; contas: { id: string; nome: string }[] }) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(vincularContaAcao, null);
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <select name="contaBancariaId" defaultValue={contaBancariaId ?? ""} className="campo h-8 w-52 text-[12px]">
        <option value="">Não importar</option>
        {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <label className="flex items-center gap-1 text-[11px] text-slate-500">desde <input name="importarDesde" type="date" defaultValue={importarDesde} className="campo h-8 w-36 text-[12px]" /></label>
      <button className="btn-sec h-8 text-[12px]" disabled={pendente}>{pendente ? "…" : "Salvar"}</button>
      {r && <span className={`text-[11px] ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.mensagem}</span>}
    </form>
  );
}
