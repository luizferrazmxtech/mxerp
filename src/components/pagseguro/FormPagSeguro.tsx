"use client";

import { useActionState } from "react";
import { salvarPagSeguroAcao, type Resultado } from "@/lib/pagseguro/acoes";
import type { ConfigPagSeguroTela } from "@/lib/pagseguro/pagseguro";
import { Bloco, Campo } from "@/components/ui/Pagina";

/** Configurações → Integrações → PagSeguro: token da API (PIX no PDV) e credenciais do EDI (conciliação). */
export default function FormPagSeguro({ c, admin }: { c: ConfigPagSeguroTela; admin: boolean }) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(salvarPagSeguroAcao, null);
  return (
    <form action={acao}>
      <Bloco icone="cartao" titulo={<>Conta do <b>PagSeguro</b></>} subtitulo="Os tokens ficam cifrados no servidor e não voltam para a tela. Ao ligar, o sistema cria a conta bancária PagSeguro e as formas PIX, débito e crédito (PagSeguro).">
        <fieldset disabled={!admin} className="grid gap-3 md:grid-cols-4">
          <label className="flex items-center gap-2 text-[13px] md:col-span-4"><input type="checkbox" name="ativo" defaultChecked={c.ativo} /> <b>Ligar o PagSeguro</b></label>
          <Campo rotulo={`Token da API${c.temToken ? " (já salvo; em branco mantém)" : ""}`} className="md:col-span-2">
            <input name="token" type="password" autoComplete="new-password" placeholder={c.temToken ? "••••••••" : "PagBank → Vendas online → Integrações → Gerar token"} className="campo" />
          </Campo>
          <Campo rotulo="Ambiente"><select name="ambiente" defaultValue={c.ambiente} className="campo"><option value="PRODUCAO">Produção</option><option value="SANDBOX">Sandbox (testes)</option></select></Campo>
          {c.temToken ? <label className="flex items-end gap-2 pb-2 text-[13px]"><input type="checkbox" name="apagarToken" /> Apagar o token salvo</label> : <span />}
        </fieldset>
      </Bloco>
      <Bloco icone="pix" titulo={<>PIX com QR no <b>PDV</b></>} subtitulo="Na forma PIX (PagSeguro), o caixa mostra o QR ao cliente e a venda fecha sozinha quando o pagamento é confirmado.">
        <fieldset disabled={!admin} className="grid gap-3 md:grid-cols-4">
          <label className="flex items-center gap-2 text-[13px] md:col-span-3"><input type="checkbox" name="pix" defaultChecked={c.pix} /> Gerar o PIX com QR no PDV</label>
          <Campo rotulo="Validade do QR (minutos)"><input name="pixMinutos" defaultValue={c.pixMinutos} className="campo text-right" inputMode="numeric" /></Campo>
        </fieldset>
      </Bloco>
      <Bloco icone="conciliacao" titulo={<>Conciliação da <b>maquininha</b> (EDI)</>} subtitulo="O EDI traz cada venda da maquininha e do PIX com a taxa real e a data do repasse. Peça o acesso ao EDI no PagBank (Minha conta → EDI) e informe o usuário e o token.">
        <fieldset disabled={!admin} className="grid gap-3 md:grid-cols-4">
          <label className="flex items-center gap-2 text-[13px] md:col-span-4"><input type="checkbox" name="edi" defaultChecked={c.edi} /> Conciliar automaticamente (de hora em hora)</label>
          <Campo rotulo="Usuário do EDI (código do estabelecimento)"><input name="ediUsuario" defaultValue={c.ediUsuario} className="campo" /></Campo>
          <Campo rotulo={`Token do EDI${c.temEdiToken ? " (já salvo)" : ""}`}><input name="ediToken" type="password" autoComplete="new-password" placeholder={c.temEdiToken ? "••••••••" : ""} className="campo" /></Campo>
          <Campo rotulo="Conciliar vendas a partir de"><input name="conciliarDesde" type="date" defaultValue={c.conciliarDesde} className="campo" /></Campo>
          {c.temEdiToken ? <label className="flex items-end gap-2 pb-2 text-[13px]"><input type="checkbox" name="apagarEdiToken" /> Apagar o token do EDI</label> : <span />}
        </fieldset>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {admin ? <button className="btn-verde" disabled={pendente}>{pendente ? "Salvando e testando…" : "Salvar e testar"}</button> : <p className="text-[13px] text-slate-500">Só o administrador altera esta configuração.</p>}
          {r && <p className={`text-[13px] ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.mensagem}</p>}
        </div>
      </Bloco>
    </form>
  );
}
