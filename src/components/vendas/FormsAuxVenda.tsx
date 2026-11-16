"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import Icone from "@/components/Icone";
import { Bloco } from "@/components/ui/Pagina";
import { salvarCanalAcao, salvarConfigVendaAcao, salvarSituacaoVendaAcao, type Resultado } from "@/lib/vendas/acoes";
import { CORES } from "@/lib/orcamentos/tipos";
import { PAPEIS, Radio, Rodape } from "@/components/orcamentos/FormsAuxOrc";

export type SituacaoVendaForm = {
  id: string; nome: string; cor: string; padrao: boolean; permiteEdicao: boolean; exibir: boolean; exibirCobranca: boolean; estoque: string; financeiro: boolean;
  notaProduto: string; notaServico: string; enviarMensagem: boolean; modeloMensagemId: string | null; gerarAssinatura: boolean; bloqueados: string[];
};

const SimNao = ({ name, valor, rotulo, dica }: { name: string; valor: boolean; rotulo: string; dica?: string }) => (
  <label><span className="rotulo">{rotulo}</span>
    <select name={name} defaultValue={valor ? "1" : "0"} className="campo"><option value="1">Sim</option><option value="0">Não</option></select>
    {dica && <span className="text-[11px] text-slate-500">{dica}</span>}</label>
);

export function FormSituacaoVenda({ s, modelos, usada }: { s?: SituacaoVendaForm; modelos: { id: string; assunto: string }[]; usada: number }) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(salvarSituacaoVendaAcao, null);
  const [corSel, setCor] = useState(s?.cor ?? "cinza");
  const [estoque, setEstoque] = useState(s?.estoque ?? "RESERVAR");
  const [fin, setFin] = useState(s?.financeiro ? "1" : "0");
  const [np, setNp] = useState(s?.notaProduto ?? "NAO");
  const [ns, setNs] = useState(s?.notaServico ?? "NAO");
  const [msg, setMsg] = useState(s?.enviarMensagem ? "1" : "0");
  const [ass, setAss] = useState(s?.gerarAssinatura ? "1" : "0");
  const [bloq, setBloq] = useState<string[]>(s?.bloqueados ?? []);
  const livres = PAPEIS.filter(([p]) => !bloq.includes(p));
  const travado = usada > 0;
  return (
    <form action={acao}>
      {s && <input type="hidden" name="id" value={s.id} />}
      <Bloco icone="editar" titulo={<>Informe a <b>situação</b> da venda</>} subtitulo="Nome, cor, se é a padrão das vendas novas e onde aparece.">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <label><span className="rotulo obrig">Nome</span><input name="nome" defaultValue={s?.nome} required autoFocus maxLength={60} className="campo" /></label>
          <div><span className="rotulo">Cor</span><input type="hidden" name="cor" value={corSel} />
            <div className="flex h-[34px] items-center gap-1.5">{Object.entries(CORES).map(([k, c]) => (
              <button key={k} type="button" title={c.rotulo} onClick={() => setCor(k)} className={`h-6 w-6 rounded-full ${c.ponto} ${corSel === k ? "ring-2 ring-marca ring-offset-2" : ""}`} />
            ))}</div></div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SimNao name="padrao" valor={!!s?.padrao} rotulo="Situação padrão" dica="Vem marcada nas vendas novas." />
          <SimNao name="permiteEdicao" valor={s?.permiteEdicao ?? true} rotulo="Permite edição" dica="Com Não, a venda fica travada." />
          <SimNao name="exibir" valor={s?.exibir ?? true} rotulo="Exibir na listagem" />
          <SimNao name="exibirCobranca" valor={s?.exibirCobranca ?? true} rotulo="Exibir no link de cobrança" />
        </div>
      </Bloco>

      <Bloco icone="urgente" titulo={<>Defina as <b>automações</b> desta situação</>} subtitulo="O que acontece quando uma venda entra nesta situação.">
        {travado && <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-[12px] text-amber-800">{usada} venda(s) estão nesta situação: estoque e financeiro não podem mudar. Crie uma situação nova e mova as vendas, se precisar.</p>}
        <div className="space-y-4">
          <div><span className="rotulo">Estoque</span><input type="hidden" name="estoque" value={estoque} />
            <div className={`flex flex-wrap gap-2 ${travado ? "pointer-events-none opacity-60" : ""}`}>
              <Radio name="_est" valor="RESERVAR" atual={estoque} titulo="Reservar estoque" onChange={setEstoque}>Separa as peças na prateleira (não saem ainda).</Radio>
              <Radio name="_est" valor="LANCAR" atual={estoque} titulo="Lançar estoque" onChange={setEstoque}>Dá baixa das peças.</Radio>
              <Radio name="_est" valor="NAO" atual={estoque} titulo="Não lançar estoque" onChange={(v) => { setEstoque(v); setFin("0"); }}>Libera o que estava reservado.</Radio>
            </div></div>
          <div><span className="rotulo">Financeiro</span><input type="hidden" name="financeiro" value={fin} />
            <div className={`flex flex-wrap gap-2 ${travado ? "pointer-events-none opacity-60" : ""}`}>
              <Radio name="_fin" valor="1" atual={fin} titulo="Lançar financeiro" onChange={(v) => { setFin(v); setEstoque("LANCAR"); }}>As parcelas viram contas a receber.</Radio>
              <Radio name="_fin" valor="0" atual={fin} titulo="Não lançar financeiro" onChange={setFin} />
            </div></div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div><span className="rotulo">Nota de produto</span><input type="hidden" name="notaProduto" value={np} />
              <div className="flex flex-wrap gap-2">
                <Radio name="_np" valor="NAO" atual={np} titulo="Não gerar NF-e" onChange={setNp} />
                <Radio name="_np" valor="GERAR" atual={np} titulo="Gerar NF-e sem emitir" onChange={setNp} />
                <Radio name="_np" valor="EMITIR" atual={np} titulo="Gerar e emitir NF-e" onChange={setNp} />
              </div></div>
            <div><span className="rotulo">Nota de serviço</span><input type="hidden" name="notaServico" value={ns} />
              <div className="flex flex-wrap gap-2">
                <Radio name="_ns" valor="NAO" atual={ns} titulo="Não gerar NFS-e" onChange={setNs} />
                <Radio name="_ns" valor="GERAR" atual={ns} titulo="Gerar NFS-e sem emitir" onChange={setNs} />
                <Radio name="_ns" valor="EMITIR" atual={ns} titulo="Gerar e emitir NFS-e" onChange={setNs} />
              </div></div>
          </div>
          <div><span className="rotulo">Envio de mensagem</span><input type="hidden" name="enviarMensagem" value={msg} />
            <div className="flex flex-wrap gap-2">
              <Radio name="_msg" valor="0" atual={msg} titulo="Não enviar" onChange={setMsg} />
              <Radio name="_msg" valor="1" atual={msg} titulo="Enviar mensagem" onChange={setMsg}>Por e-mail, SMS ou WhatsApp, com o modelo escolhido.</Radio>
            </div>
            {msg === "1" && <label className="mt-2 block max-w-md"><span className="rotulo">Modelo de mensagem</span>
              <select name="modeloMensagemId" defaultValue={s?.modeloMensagemId ?? ""} className="campo"><option value="">Mensagem padrão</option>{modelos.map((m) => <option key={m.id} value={m.id}>{m.assunto}</option>)}</select></label>}
          </div>
          <div><span className="rotulo">Assinatura digital</span><input type="hidden" name="gerarAssinatura" value={ass} />
            <div className="flex flex-wrap gap-2">
              <Radio name="_ass" valor="0" atual={ass} titulo="Não gerar assinatura" onChange={setAss} />
              <Radio name="_ass" valor="1" atual={ass} titulo="Gerar assinatura" onChange={setAss} />
            </div></div>
          <p className="text-[11px] text-slate-500">Notas, mensagens e assinatura ficam guardadas na situação; o disparo automático entra junto com o módulo Fiscal e o envio de e-mails.</p>
        </div>
      </Bloco>

      <Bloco icone="senha" titulo={<>Bloqueie <b>grupos de usuários</b> nesta situação</>} subtitulo="Quem está no grupo não consegue trocar a situação."
        acoes={livres.length > 0 ? (
          <select value="" onChange={(e) => e.target.value && setBloq([...bloq, e.target.value])} className="campo h-8 w-44 text-[12px]">
            <option value="">+ Bloquear grupo</option>{livres.map(([p, n]) => <option key={p} value={p}>{n}</option>)}
          </select>) : undefined}>
        {bloq.length === 0 ? <p className="text-[13px] text-slate-500">Nenhum grupo bloqueado.</p> : (
          <ul className="divide-y rounded border">{bloq.map((p) => (
            <li key={p} className="flex items-center px-3 py-2"><input type="hidden" name="bloqueados" value={p} />{PAPEIS.find((x) => x[0] === p)?.[1]}
              <button type="button" onClick={() => setBloq(bloq.filter((x) => x !== p))} className="ml-auto text-red-600" title="Remover"><Icone nome="excluir" size={15} /></button></li>
          ))}</ul>)}
      </Bloco>
      <Rodape r={r} pendente={pendente} voltar="/vendas/situacoes" editando={!!s} />
    </form>
  );
}

export function FormCanal({ c }: { c?: { id: string; nome: string; padrao: boolean } }) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(salvarCanalAcao, null);
  return (
    <form action={acao} className="cartao mb-3 flex flex-wrap items-end gap-3 p-4">
      {c && <input type="hidden" name="id" value={c.id} />}
      <label className="min-w-64 flex-1"><span className="rotulo obrig">Nome</span><input name="nome" defaultValue={c?.nome} required autoFocus className="campo" placeholder="Ex.: Mercado Livre" /></label>
      <label className="w-40"><span className="rotulo">Padrão</span><select name="padrao" defaultValue={c?.padrao ? "1" : "0"} className="campo"><option value="0">Não</option><option value="1">Sim</option></select></label>
      <p className="w-full text-[12px] text-slate-500">O canal vale para vendas, orçamentos e OS. Renomear muda o canal nos registros antigos também.</p>
      {r && !r.ok && <p className="w-full rounded bg-red-50 px-3 py-2 text-[13px] text-red-700">{r.mensagem}</p>}
      <div className="flex w-full gap-2"><Link href="/vendas/canais" className="btn-sec">Cancelar</Link><button className="btn ml-auto px-5" disabled={pendente}>{c ? "Salvar" : "Cadastrar"}</button></div>
    </form>
  );
}

export function FormConfigVenda({ ultimo, ultimaDev, c, grupos }: {
  ultimo: number; ultimaDev: number;
  c: { observacoes: string; validadeVale: number; estoqueNegativo: boolean; documentos: Record<string, boolean>; balanca: { prefixo: string; digitosCodigo: number; conteudo: string } };
  grupos: { grupo: string; itens: [string, string][] }[];
}) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(salvarConfigVendaAcao, null);
  const [num, setNum] = useState(String(ultimo));
  const [dev, setDev] = useState(String(ultimaDev));
  return (
    <form action={acao}>
      <Bloco icone="lista" titulo={<>Defina o <b>último número</b> de cada registro</>} subtitulo="O número vale só para a loja atual." corpo="p-0">
        <table className="tabela">
          <thead><tr><th>Registro</th><th className="w-48">Último número usado</th><th className="w-48">Próximo sai como</th></tr></thead>
          <tbody>
            <tr><td>Vendas</td><td><input name="ultimoNumero" value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, ""))} className="campo h-8 w-32" inputMode="numeric" /></td>
              <td><span className="pilula border-slate-300 bg-slate-50 text-slate-700">Próximo · {Number(num || 0) + 1}</span></td></tr>
            <tr><td>Trocas e devoluções</td><td><input name="ultimaDevolucao" value={dev} onChange={(e) => setDev(e.target.value.replace(/\D/g, ""))} className="campo h-8 w-32" inputMode="numeric" /></td>
              <td><span className="pilula border-slate-300 bg-slate-50 text-slate-700">Próximo · {Number(dev || 0) + 1}</span></td></tr>
          </tbody>
        </table>
      </Bloco>
      <Bloco icone="editar" titulo={<>Escreva o <b>texto padrão</b> das vendas</>}>
        <label className="block"><span className="rotulo">Observações</span><textarea name="observacoes" defaultValue={c.observacoes} rows={3} className="campo h-auto" placeholder="Entra em toda venda nova (sai na impressão)." /></label>
      </Bloco>
      <Bloco icone="estoque" titulo={<>Regras de <b>estoque</b> e <b>vale-compras</b></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="rotulo">Permitir vender sem saldo</span>
            <select name="estoqueNegativo" defaultValue={c.estoqueNegativo ? "1" : "0"} className="campo"><option value="1">Sim (a peça fica em falta e o estoque pode ficar negativo)</option><option value="0">Não (bloqueia a baixa sem saldo)</option></select></label>
          <label><span className="rotulo">Validade do vale-compras (dias)</span><input name="validadeVale" defaultValue={c.validadeVale} className="campo" inputMode="numeric" /></label>
        </div>
      </Bloco>
      <Bloco icone="balcao" titulo={<>Padrão do código da <b>balança</b></>} subtitulo="Etiquetas de balança começam com o prefixo e trazem o código do produto e o preço ou o peso.">
        <div className="grid gap-3 sm:grid-cols-3">
          <label><span className="rotulo">Prefixo</span><input name="balancaPrefixo" defaultValue={c.balanca.prefixo} className="campo" maxLength={2} /></label>
          <label><span className="rotulo">Dígitos do código do produto</span><select name="balancaDigitos" defaultValue={c.balanca.digitosCodigo} className="campo"><option value={4}>4</option><option value={5}>5</option></select></label>
          <label><span className="rotulo">A etiqueta traz</span><select name="balancaConteudo" defaultValue={c.balanca.conteudo} className="campo"><option value="PRECO">Preço total</option><option value="PESO">Peso</option></select></label>
        </div>
      </Bloco>
      <Bloco icone="olho" titulo={<>Escolha o que aparece nos <b>documentos</b></>}>
        <div className="grid gap-4 md:grid-cols-3">{grupos.map((g) => (
          <div key={g.grupo}><div className="mb-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{g.grupo}</div>
            {g.itens.map(([k, rot]) => <label key={k} className="flex items-center gap-2 py-1"><input type="checkbox" name={k} value="1" defaultChecked={c.documentos[k]} /> {rot}</label>)}</div>
        ))}</div>
      </Bloco>
      <Rodape r={r} pendente={pendente} voltar="/vendas" editando rotulo="Salvar configurações" />
    </form>
  );
}
