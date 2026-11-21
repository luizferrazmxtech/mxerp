"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import { removerInter, salvarInter, testarConexao, type Estado } from "./actions";

function Msg({ e }: { e: Estado }) {
  return e ? <p className={`text-sm ${e.ok ? "text-emerald-700" : "text-red-700"}`}>{e.mensagem}</p> : null;
}

type Atual = {
  clientId: string; contaCorrente: string | null; ambiente: string; escopos: string; contaBancariaId: string | null; sincronizarAuto: boolean;
  emitirBoletos: boolean; multaPct: number; jurosMesPct: number; diasBaixa: number; mensagemBoleto: string | null; urlPublica: string | null;
} | null;
type Forma = { id: string; nome: string; boletoInter: boolean };

export function FormInter({ atual, contas, formas }: { atual: Atual; contas: { id: string; nome: string }[]; formas: Forma[] }) {
  const [e, , p, formAct] = useFormAcao<Estado>(salvarInter, null);
  const rot = "text-xs text-slate-500";
  return (
    <form {...formAct} className="cartao grid gap-3 p-4 md:grid-cols-2">
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
      <fieldset className="space-y-1 text-sm md:col-span-2">
        <legend className={rot}>Permissões pedidas ao Inter (precisam estar marcadas na integração, no Inter Empresas)</legend>
        <label className="flex items-center gap-2"><input type="checkbox" checked disabled /> Consultar extrato e saldo <code className="text-[11px] text-slate-500">extrato.read</code></label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="cobranca" defaultChecked={atual ? atual.escopos.includes("boleto-cobranca") : true} />
          Emitir, consultar e cancelar boletos <code className="text-[11px] text-slate-500">boleto-cobranca.read boleto-cobranca.write</code>
        </label>
      </fieldset>
      <label className={rot}>Conta bancária no ERP que recebe o extrato
        <select name="contaBancariaId" defaultValue={atual?.contaBancariaId ?? ""} className="campo mt-1">
          <option value="">INTER MXTECH (cria se não existir)</option>
          {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </label>
      <h2 className="mt-2 font-semibold md:col-span-2">Boletos (BolePix)</h2>
      <label className="flex items-center gap-2 text-sm md:col-span-2">
        <input type="checkbox" name="emitirBoletos" defaultChecked={atual?.emitirBoletos ?? true} />
        Registrar o boleto no Inter sozinho quando a parcela for de uma das formas abaixo (venda, OS ou conta a receber)
      </label>
      <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm md:col-span-2">
        <legend className={rot}>Formas de pagamento que geram boleto</legend>
        {formas.map((f) => <label key={f.id} className="flex items-center gap-1"><input type="checkbox" name="formasBoleto" value={f.id} defaultChecked={f.boletoInter} /> {f.nome}</label>)}
      </fieldset>
      <label className={rot}>Multa por atraso (%)
        <input name="multaPct" defaultValue={String(atual?.multaPct ?? 2).replace(".", ",")} inputMode="decimal" className="campo mt-1" />
      </label>
      <label className={rot}>Juros de mora (% ao mês)
        <input name="jurosMesPct" defaultValue={String(atual?.jurosMesPct ?? 1).replace(".", ",")} inputMode="decimal" className="campo mt-1" />
      </label>
      <label className={rot}>Dias após o vencimento para o Inter cancelar o boleto não pago (0 a 60)
        <input name="diasBaixa" defaultValue={atual?.diasBaixa ?? 30} inputMode="numeric" className="campo mt-1" />
      </label>
      <label className={rot}>Mensagem no boleto (opcional)
        <input name="mensagemBoleto" defaultValue={atual?.mensagemBoleto ?? ""} maxLength={78} placeholder="ex.: Não receber após 30 dias do vencimento" className="campo mt-1" />
      </label>
      <label className={`${rot} md:col-span-2`}>Endereço público do ERP, em https (opcional, para o aviso instantâneo do Inter e os links de boleto)
        <input name="urlPublica" defaultValue={atual?.urlPublica ?? ""} placeholder="https://erp.suaempresa.com.br" className="campo mt-1" />
        <span className="mt-1 block text-[11px]">Sem ele, o ERP consulta os boletos pagos de hora em hora (8h às 20h). Com ele, o Inter avisa na hora do pagamento.</span>
      </label>
      <label className="flex items-center gap-2 text-sm md:col-span-2">
        <input type="checkbox" name="sincronizarAuto" defaultChecked={atual?.sincronizarAuto ?? true} />
        Buscar o extrato e a situação dos boletos sozinho de hora em hora (8h às 20h)
      </label>
      <div className="space-y-2 md:col-span-2">
        <button className="btn" disabled={p}>{p ? "Salvando e testando…" : "Salvar e testar conexão"}</button>
        <Msg e={e} />
      </div>
    </form>
  );
}

export function TestarRemover({ admin }: { admin: boolean }) {
  const [e, , p, formTestar] = useFormAcao<Estado>(testarConexao, null);
  const [er, , pr, formRemover] = useFormAcao<Estado>(removerInter, null);
  return (
    <div className="space-y-2 pt-2">
      <div className="flex flex-wrap gap-2">
        <form {...formTestar}><button className="btn-sec" disabled={p}>{p ? "Testando…" : "Testar conexão"}</button></form>
        {admin && (
          <form {...formRemover} onSubmit={(ev) => { if (!window.confirm("Remover a integração com o Banco Inter?")) ev.preventDefault(); }}>
            <button className="btn-sec text-red-700" disabled={pr}>Remover integração</button>
          </form>
        )}
      </div>
      <Msg e={e} />
      <Msg e={er} />
    </div>
  );
}
