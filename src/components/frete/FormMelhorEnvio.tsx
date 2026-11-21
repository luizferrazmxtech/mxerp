"use client";

import { useActionState } from "react";
import { salvarFreteAcao, type Resultado } from "@/lib/frete/acoes";
import type { ConfigFreteTela } from "@/lib/frete/melhorEnvio";
import { Bloco, Campo } from "@/components/ui/Pagina";

const n = (v: number) => (v ? String(v).replace(".", ",") : "");

/** Configurações → Integrações → Melhor Envio: token (cifrado no servidor), origem, acréscimos e caixa padrão. */
export default function FormMelhorEnvio({ c, admin }: { c: ConfigFreteTela; admin: boolean }) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(salvarFreteAcao, null);
  return (
    <form action={acao}>
      <Bloco icone="frete" titulo={<>Conta do <b>Melhor Envio</b></>} subtitulo="Gere o token no painel do Melhor Envio (Gerenciar → Tokens → Novo token, com todas as permissões de envio). O token fica cifrado no servidor e não volta para a tela.">
        <fieldset disabled={!admin} className="grid gap-3 md:grid-cols-4">
          <label className="flex items-center gap-2 text-[13px] md:col-span-4"><input type="checkbox" name="ativo" defaultChecked={c.ativo} /> <b>Ligar a cotação e as etiquetas pelo Melhor Envio</b></label>
          <Campo rotulo={`Token${c.temToken ? " (já salvo; em branco mantém)" : ""}`} obrigatorio={!c.temToken} className="md:col-span-2">
            <input name="token" type="password" autoComplete="new-password" placeholder={c.temToken ? "••••••••" : "Cole aqui o token do Melhor Envio"} className="campo" />
          </Campo>
          <Campo rotulo="Ambiente"><select name="ambiente" defaultValue={c.ambiente} className="campo"><option value="PRODUCAO">Produção</option><option value="SANDBOX">Sandbox (testes)</option></select></Campo>
          {c.temToken ? <label className="flex items-end gap-2 pb-2 text-[13px]"><input type="checkbox" name="apagarToken" /> Apagar o token salvo</label> : <span />}
          <Campo rotulo="E-mail de contato técnico" obrigatorio className="md:col-span-2"><input name="email" type="email" defaultValue={c.email} className="campo" placeholder="o e-mail da sua conta" /></Campo>
          <Campo rotulo="CEP de origem (em branco = CEP da loja)"><input name="cepOrigem" defaultValue={c.cepOrigem.replace(/^(\d{5})(\d{3})$/, "$1-$2")} className="campo" inputMode="numeric" /></Campo>
          <Campo rotulo="Serviços aceitos (ids, vazio = todos)"><input name="servicos" defaultValue={c.servicos} className="campo" placeholder="1,2,3,4,17" title="1 PAC, 2 SEDEX, 3 Jadlog .Package, 4 Jadlog .Com, 17 Mini Envios" /></Campo>
        </fieldset>
      </Bloco>
      <Bloco icone="dinheiro" titulo={<>Valor <b>cobrado do cliente</b></>} subtitulo="O valor da cotação na venda é o custo do Melhor Envio mais estes acréscimos. A etiqueta é paga com o saldo da carteira do Melhor Envio.">
        <fieldset disabled={!admin} className="grid gap-3 md:grid-cols-4">
          <Campo rotulo="Acréscimo (%)"><input name="acrescimoPct" defaultValue={n(c.acrescimoPct)} className="campo text-right" /></Campo>
          <Campo rotulo="Acréscimo fixo (R$)"><input name="acrescimoValor" defaultValue={n(c.acrescimoValor)} className="campo text-right" /></Campo>
          <Campo rotulo="Dias a mais no prazo (manuseio)"><input name="diasExtras" defaultValue={n(c.diasExtras)} className="campo text-right" /></Campo>
          <span />
          <label className="flex items-center gap-2 text-[13px] md:col-span-2"><input type="checkbox" name="seguro" defaultChecked={c.seguro} /> Declarar o valor dos produtos (seguro)</label>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="maoPropria" defaultChecked={c.maoPropria} /> Mão própria</label>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="avisoRecebimento" defaultChecked={c.avisoRecebimento} /> Aviso de recebimento</label>
        </fieldset>
      </Bloco>
      <Bloco icone="produtos" titulo={<>Caixa <b>padrão</b></>} subtitulo="Usada para os produtos sem peso e medidas no cadastro (Produtos → Pesos e dimensões).">
        <fieldset disabled={!admin} className="grid gap-3 md:grid-cols-4">
          <Campo rotulo="Altura (cm)"><input name="altura" defaultValue={n(c.pacote.altura)} className="campo text-right" /></Campo>
          <Campo rotulo="Largura (cm)"><input name="largura" defaultValue={n(c.pacote.largura)} className="campo text-right" /></Campo>
          <Campo rotulo="Comprimento (cm)"><input name="comprimento" defaultValue={n(c.pacote.comprimento)} className="campo text-right" /></Campo>
          <Campo rotulo="Peso (kg)"><input name="peso" defaultValue={n(c.pacote.peso)} className="campo text-right" /></Campo>
        </fieldset>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {admin ? <button className="btn-verde" disabled={pendente}>{pendente ? "Salvando e testando…" : "Salvar e testar conexão"}</button> : <p className="text-[13px] text-slate-500">Só o administrador altera esta configuração.</p>}
          {r && <p className={`text-[13px] ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.mensagem}</p>}
        </div>
      </Bloco>
    </form>
  );
}
