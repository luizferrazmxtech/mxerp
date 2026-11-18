"use client";

import { useActionState } from "react";
import { removerInter, salvarInter, testarConexao, type Estado } from "./actions";

function Msg({ e }: { e: Estado }) {
  return e ? <p className={`text-sm ${e.ok ? "text-emerald-700" : "text-red-700"}`}>{e.mensagem}</p> : null;
}

type Atual = { clientId: string; contaCorrente: string | null; ambiente: string; escopos: string; contaBancariaId: string | null; sincronizarAuto: boolean } | null;

export function FormInter({ atual, contas }: { atual: Atual; contas: { id: string; nome: string }[] }) {
  const [e, act, p] = useActionState<Estado, FormData>(salvarInter, null);
  const rot = "text-xs text-slate-500";
  return (
    <form action={act} className="cartao grid gap-3 p-4 md:grid-cols-2">
      <h2 className="font-semibold md:col-span-2">Credenciais da integração</h2>
      <label className={rot}>Client ID
        <input name="clientId" defaultValue={atual?.clientId ?? ""} required autoComplete="off" className="campo mt-1 font-mono" />
      </label>
      <label className={rot}>Client Secret{atual ? " · já cadastrado, deixe em branco para manter" : ""}
        <input name="clientSecret" type="password" required={!atual} autoComplete="new-password" className="campo mt-1 font-mono" />
      </label>
      <label className={`${rot} md:col-span-2`}>Certificado e chave (.crt e .key, ou o .zip baixado do Inter){atual ? " · já enviados, envie só para trocar" : ""}
        <input name="arquivos" type="file" multiple accept=".crt,.key,.pem,.cer,.zip" required={!atual} className="campo mt-1" />
      </label>
      <label className={rot}>Conta corrente no Inter (opcional)
        <input name="contaCorrente" defaultValue={atual?.contaCorrente ?? ""} inputMode="numeric" placeholder="só se tiver mais de uma conta" className="campo mt-1" />
      </label>
      <label className={rot}>Ambiente
        <select name="ambiente" defaultValue={atual?.ambiente ?? "producao"} className="campo mt-1">
          <option value="producao">Produção (conta real)</option>
          <option value="sandbox">Sandbox (testes do Inter)</option>
        </select>
      </label>
      <label className={rot}>Escopos pedidos ao Inter
        <input name="escopos" defaultValue={atual?.escopos ?? "extrato.read"} className="campo mt-1 font-mono" />
        <span className="mt-1 block text-[11px]">Precisa ter extrato.read. Só acrescente outros se a integração tiver essas permissões.</span>
      </label>
      <label className={rot}>Conta bancária no ERP que recebe o extrato
        <select name="contaBancariaId" defaultValue={atual?.contaBancariaId ?? ""} className="campo mt-1">
          <option value="">INTER MXTECH (cria se não existir)</option>
          {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm md:col-span-2">
        <input type="checkbox" name="sincronizarAuto" defaultChecked={atual?.sincronizarAuto ?? true} />
        Buscar o extrato sozinho de hora em hora (8h às 20h)
      </label>
      <div className="space-y-2 md:col-span-2">
        <button className="btn" disabled={p}>{p ? "Salvando e testando…" : "Salvar e testar conexão"}</button>
        <Msg e={e} />
      </div>
    </form>
  );
}

export function TestarRemover({ admin }: { admin: boolean }) {
  const [e, testar, p] = useActionState<Estado, FormData>(testarConexao, null);
  const [er, remover, pr] = useActionState<Estado, FormData>(removerInter, null);
  return (
    <div className="space-y-2 pt-2">
      <div className="flex flex-wrap gap-2">
        <form action={testar}><button className="btn-sec" disabled={p}>{p ? "Testando…" : "Testar conexão"}</button></form>
        {admin && (
          <form action={remover} onSubmit={(ev) => { if (!window.confirm("Remover a integração com o Banco Inter?")) ev.preventDefault(); }}>
            <button className="btn-sec text-red-700" disabled={pr}>Remover integração</button>
          </form>
        )}
      </div>
      <Msg e={e} />
      <Msg e={er} />
    </div>
  );
}
