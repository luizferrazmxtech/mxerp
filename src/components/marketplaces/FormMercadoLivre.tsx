"use client";

import { useActionState } from "react";
import { conectarMLAcao, desconectarMLAcao, irParaAutorizacaoMLAcao, salvarConfigMLAcao, type Resultado } from "@/lib/marketplaces/acoes";
import type { ConfigMLTela } from "@/lib/marketplaces/mercadolivre";
import { Bloco, Campo } from "@/components/ui/Pagina";

type Opcao = { id: string; nome: string };
const Msg = ({ r }: { r: Resultado }) => (r ? <p className={`text-[13px] ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.mensagem}</p> : null);

/** Vendas › Marketplaces › Mercado Livre: aplicativo, conexão da conta e regras das vendas geradas. */
export default function FormMercadoLivre({ c, admin, empresas, contas, situacoes, formas, urlCallback }: {
  c: ConfigMLTela; admin: boolean; empresas: Opcao[]; contas: Opcao[]; situacoes: Opcao[]; formas: Opcao[]; urlCallback: string;
}) {
  const [r, salvar, salvando] = useActionState<Resultado, FormData>(salvarConfigMLAcao, null);
  const [rc, conectar, conectando] = useActionState<Resultado, FormData>(conectarMLAcao, null);
  const [rd, desconectar, desconectando] = useActionState<Resultado, FormData>(async () => desconectarMLAcao(), null);
  return (
    <>
      <form action={salvar}>
        <Bloco icone="chave" titulo={<>Aplicativo do <b>Mercado Livre</b></>} subtitulo="Crie o aplicativo em developers.mercadolivre.com.br (Minhas aplicações) com a sua conta de vendedor. A Secret Key fica cifrada no servidor e não volta para a tela.">
          <fieldset disabled={!admin} className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 text-[13px] md:col-span-2"><input type="checkbox" name="ativo" defaultChecked={c.ativo} /> <b>Integração ligada</b></label>
            <Campo rotulo="Client ID (App ID)" obrigatorio><input name="clientId" defaultValue={c.clientId} inputMode="numeric" className="campo font-mono" /></Campo>
            <Campo rotulo={`Secret Key${c.temSecret ? " (já salva; em branco mantém)" : ""}`} obrigatorio={!c.temSecret}>
              <input name="clientSecret" type="password" autoComplete="new-password" placeholder={c.temSecret ? "••••••••" : "Chave secreta do aplicativo"} className="campo" />
            </Campo>
            <Campo rotulo="URL de redirecionamento (igual à do aplicativo)" obrigatorio className="md:col-span-2">
              <input name="redirectUri" defaultValue={c.redirectUri || urlCallback} className="campo font-mono text-[12px]" />
            </Campo>
            <p className="-mt-2 text-[11px] text-slate-500 md:col-span-2">
              Com o ERP num endereço https público use <span className="font-mono">{urlCallback}</span> (volta direto para cá). Enquanto ele roda só no PC, cadastre qualquer endereço https seu (ex.: o site da empresa) e, depois de autorizar, cole aqui embaixo o endereço completo da página para onde o Mercado Livre levou você.
            </p>
          </fieldset>
        </Bloco>
        <Bloco icone="vendas" titulo={<>Como os pedidos entram no <b>MXERP</b></>} subtitulo="Pedido pago vira venda (baixa o estoque e lança a conta a receber, que vence na data de liberação do Mercado Pago). Quando o dinheiro é liberado, a conta é baixada e a tarifa é lançada como despesa paga.">
          <fieldset disabled={!admin} className="grid gap-3 md:grid-cols-3">
            <Campo rotulo="Pedidos a partir de" obrigatorio><input type="date" name="importarDesde" defaultValue={c.importarDesde} required className="campo" /></Campo>
            <Campo rotulo="Situação da venda"><select name="situacaoVendaId" defaultValue={c.situacaoVendaId} className="campo"><option value="">Padrão (lança estoque e financeiro)</option>{situacoes.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></Campo>
            <Campo rotulo="Canal de venda"><input name="canalVenda" defaultValue={c.canalVenda} className="campo" /></Campo>
            <Campo rotulo="Conta onde o dinheiro é liberado"><select name="contaBancariaId" defaultValue={c.contaBancariaId} className="campo"><option value="">Mercado Pago (criada sozinha)</option>{contas.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></Campo>
            <Campo rotulo="Forma de pagamento"><select name="formaPagamentoId" defaultValue={c.formaPagamentoId} className="campo"><option value="">Mercado Pago (criada sozinha)</option>{formas.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></Campo>
            <Campo rotulo="Loja (CNPJ) das vendas"><select name="empresaId" defaultValue={c.empresaId} className="campo"><option value="">{empresas.length ? "Sem loja definida" : "Única"}</option>{empresas.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></Campo>
            <label className="flex items-center gap-2 text-[13px] md:col-span-3"><input type="checkbox" name="cancelarAuto" defaultChecked={c.cancelarAuto} /> Pedido cancelado no Mercado Livre (antes da liberação) cancela a venda e devolve o estoque</label>
            <label className="flex items-center gap-2 text-[13px] md:col-span-3"><input type="checkbox" name="sincronizarAuto" defaultChecked={c.sincronizarAuto} /> Buscar pedidos e liberações sozinho, de hora em hora (das 8h às 20h)</label>
          </fieldset>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {admin ? <button className="btn-verde" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button> : <p className="text-[13px] text-slate-500">Só o administrador altera esta configuração.</p>}
            <Msg r={r} />
          </div>
        </Bloco>
      </form>

      <Bloco icone="lojas" titulo={<>Conta de <b>vendedor</b></>} subtitulo={c.conectado ? `Conectada: ${c.contaNome ?? c.contaId ?? "conta do Mercado Livre"}` : "Ainda não conectada"}>
        {!c.clientId ? <p className="text-[13px] text-slate-500">Salve o aplicativo acima antes de conectar.</p> : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 text-[13px]">
              <p>1. Clique no botão, entre com a conta de vendedor e autorize o aplicativo.</p>
              <form action={irParaAutorizacaoMLAcao}><button className="btn" disabled={!admin}>{c.conectado ? "Conectar de novo" : "Conectar com o Mercado Livre"}</button></form>
              {c.conectado && (
                <form action={desconectar}><button className="btn-sec" disabled={!admin || desconectando}>{desconectando ? "Aguarde…" : "Desconectar"}</button> <Msg r={rd} /></form>
              )}
            </div>
            <form action={conectar} className="space-y-2">
              <p className="text-[13px]">2. Se a página final não foi o ERP, cole aqui o endereço completo dela (tem <span className="font-mono">?code=TG-…</span>). Vale por 10 minutos.</p>
              <input name="codigo" required className="campo font-mono text-[12px]" placeholder="https://…/?code=TG-…&state=…" disabled={!admin} />
              <div className="flex items-center gap-3"><button className="btn-sec" disabled={!admin || conectando}>{conectando ? "Conectando…" : "Concluir conexão"}</button><Msg r={rc} /></div>
            </form>
          </div>
        )}
      </Bloco>
    </>
  );
}
