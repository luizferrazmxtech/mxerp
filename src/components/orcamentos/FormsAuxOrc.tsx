"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import Link from "next/link";
import { useState } from "react";
import Icone from "@/components/Icone";
import { Bloco } from "@/components/ui/Pagina";
import { salvarConfigOrcamentoAcao, salvarMensagemAcao, salvarSituacaoAcao, type Resultado } from "@/lib/orcamentos/acoes";
import { CORES, TAGS_MENSAGEM, aplicarTags } from "@/lib/orcamentos/tipos";

export const PAPEIS: [string, string][] = [["ADMIN", "Administradores"], ["GERENTE", "Gerentes"], ["OPERADOR", "Operadores"], ["TECNICO", "Técnicos"], ["CAIXA", "Caixas"]];

export function Rodape({ r, pendente, voltar, editando, rotulo }: { r: Resultado; pendente: boolean; voltar: string; editando: boolean; rotulo?: string }) {
  return (
    <div className="sticky bottom-0 z-10 mt-3 flex flex-wrap items-center gap-2 border-t bg-white px-4 py-3">
      {r && <p className={`w-full rounded px-3 py-2 text-[13px] ${r.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{r.mensagem}</p>}
      <Link href={voltar} className="btn-sec">Cancelar</Link>
      <button className="btn ml-auto px-5" disabled={pendente}>{pendente ? "Salvando…" : rotulo ?? (editando ? "Salvar" : "Cadastrar")}</button>
    </div>
  );
}

export function Radio({ name, valor, atual, titulo, children, onChange }: { name: string; valor: string; atual: string; titulo: string; children?: React.ReactNode; onChange?: (v: string) => void }) {
  return (
    <label className={`flex flex-1 cursor-pointer gap-2 rounded-md border p-3 ${atual === valor ? "border-marca bg-teal-50/40" : "border-slate-200"}`}>
      <input type="radio" name={name} value={valor} defaultChecked={atual === valor} onChange={() => onChange?.(valor)} className="mt-1" />
      <span><span className="block font-semibold">{titulo}</span>{children && <span className="text-[12px] text-slate-500">{children}</span>}</span>
    </label>
  );
}

export type SituacaoForm = { id: string; nome: string; cor: string; exibir: boolean; geraVenda: boolean; enviarMensagem: boolean; modeloMensagemId: string | null; gerarAssinatura: boolean; bloqueados: string[] };

export function FormSituacaoOrc({ s, modelos }: { s?: SituacaoForm; modelos: { id: string; assunto: string }[] }) {
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(salvarSituacaoAcao, null);
  const [corSel, setCor] = useState(s?.cor ?? "cinza");
  const [venda, setVenda] = useState(s?.geraVenda ? "1" : "0");
  const [msg, setMsg] = useState(s?.enviarMensagem ? "1" : "0");
  const [ass, setAss] = useState(s?.gerarAssinatura ? "1" : "0");
  const [bloq, setBloq] = useState<string[]>(s?.bloqueados ?? []);
  const livres = PAPEIS.filter(([p]) => !bloq.includes(p));
  return (
    <form {...formAcao}>
      {s && <input type="hidden" name="id" value={s.id} />}
      <Bloco icone="editar" titulo="Informe a situação do orçamento" subtitulo="Nome, cor da pílula e se aparece na listagem.">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <label><span className="rotulo obrig">Nome</span><input name="nome" defaultValue={s?.nome} required autoFocus maxLength={60} className="campo" /></label>
          <div><span className="rotulo">Cor</span>
            <input type="hidden" name="cor" value={corSel} />
            <div className="flex h-[34px] items-center gap-1.5">{Object.entries(CORES).map(([k, c]) => (
              <button key={k} type="button" title={c.rotulo} onClick={() => setCor(k)} className={`h-6 w-6 rounded-full ${c.ponto} ${corSel === k ? "ring-2 ring-marca ring-offset-2" : ""}`} />
            ))}</div></div>
          <label><span className="rotulo">Exibir na listagem</span>
            <select name="exibir" defaultValue={s && !s.exibir ? "0" : "1"} className="campo w-32"><option value="1">Sim</option><option value="0">Não</option></select></label>
        </div>
        <p className="mt-3 text-[12px] text-slate-500">Prévia: <span className={`pilula ${CORES[corSel].pilula}`}>{s?.nome || "Situação"}</span></p>
      </Bloco>

      <Bloco icone="urgente" titulo="Defina as automações desta situação" subtitulo="O que acontece quando um orçamento entra nesta situação.">
        <div className="space-y-4">
          <div><span className="rotulo">Transformar em venda</span>
            <input type="hidden" name="geraVenda" value={venda} />
            <div className="flex flex-wrap gap-2">
              <Radio name="_venda" valor="0" atual={venda} titulo="Não sugerir gerar venda" onChange={setVenda} />
              <Radio name="_venda" valor="1" atual={venda} titulo="Sugerir gerar venda" onChange={setVenda}>Ao mudar para esta situação, o sistema oferece gerar a venda.</Radio>
            </div></div>
          <div><span className="rotulo">Envio de mensagem</span>
            <input type="hidden" name="enviarMensagem" value={msg} />
            <div className="flex flex-wrap gap-2">
              <Radio name="_msg" valor="0" atual={msg} titulo="Não enviar" onChange={setMsg} />
              <Radio name="_msg" valor="1" atual={msg} titulo="Enviar mensagem" onChange={setMsg}>Por e-mail, SMS ou WhatsApp, com o modelo escolhido.</Radio>
            </div>
            {msg === "1" && <label className="mt-2 block max-w-md"><span className="rotulo">Modelo de mensagem</span>
              <select name="modeloMensagemId" defaultValue={s?.modeloMensagemId ?? ""} className="campo"><option value="">Mensagem padrão</option>{modelos.map((m) => <option key={m.id} value={m.id}>{m.assunto}</option>)}</select></label>}
          </div>
          <div><span className="rotulo">Assinatura digital</span>
            <input type="hidden" name="gerarAssinatura" value={ass} />
            <div className="flex flex-wrap gap-2">
              <Radio name="_ass" valor="0" atual={ass} titulo="Não gerar assinatura" onChange={setAss} />
              <Radio name="_ass" valor="1" atual={ass} titulo="Gerar assinatura" onChange={setAss}>Cria a e-Assinatura da proposta para o cliente assinar.</Radio>
            </div></div>
        </div>
      </Bloco>

      <Bloco icone="senha" titulo="Bloqueie grupos de usuários nesta situação" subtitulo="Quem está no grupo não consegue trocar a situação."
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
      <Rodape r={r} pendente={pendente} voltar="/orcamentos/situacoes" editando={!!s} />
    </form>
  );
}

const EXEMPLO = { "[nome_cliente]": "Maria Silva", "[numero]": "6650", "[valor_total]": "R$ 299,40", "[data]": "16/11/2026", "[validade]": "10 dias", "[vendedor]": "Caue", "[link]": "https://…/proposta/abc", "[nome_empresa]": "MXTECH" };

export function FormMensagemOrc({ m, acao: acaoServidor, voltar = "/orcamentos/mensagens", whatsapp: zap }: {
  m?: { id: string; assunto: string; email: string; sms: string | null; padrao: boolean; whatsapp?: string | null }; acao?: (r: Resultado, f: FormData) => Promise<Resultado>; voltar?: string;
  /** texto de WhatsApp próprio (OS: enviado pelo MXChat), com as tags e o texto sugerido */
  whatsapp?: { tags: string[]; padrao: string };
}) {
  const [textoZap, setTextoZap] = useState(m?.whatsapp ?? zap?.padrao ?? "");
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(acaoServidor ?? salvarMensagemAcao, null);
  const [email, setEmail] = useState(m?.email ?? "");
  const [sms, setSms] = useState(m?.sms ?? "");
  const [previa, setPrevia] = useState(false);
  const [tags, setTags] = useState(false);
  const whats = aplicarTags(email, EXEMPLO).replace(/<[^>]+>/g, "");
  return (
    <form {...formAcao}>
      {m && <input type="hidden" name="id" value={m.id} />}
      <div className="mb-3 flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] text-sky-800">
        <Icone nome="detalhes" size={15} /> Tags de personalização trocam o texto pelos dados do orçamento.
        <button type="button" onClick={() => setTags(!tags)} className="ml-1 font-semibold underline">Ver tags disponíveis</button>
      </div>
      {tags && <div className="cartao mb-3 flex flex-wrap gap-1.5 p-3">{TAGS_MENSAGEM.map((t) => <code key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px]">{t}</code>)}</div>}
      <Bloco icone="email" titulo="Assunto do e-mail">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <label><span className="rotulo obrig">Assunto</span><input name="assunto" defaultValue={m?.assunto} required maxLength={80} className="campo" /></label>
          <label><span className="rotulo">Mensagem padrão</span><select name="padrao" defaultValue={m?.padrao ? "1" : "0"} className="campo w-32"><option value="1">Sim</option><option value="0">Não</option></select></label>
        </div>
      </Bloco>
      <Bloco icone="email" titulo="Mensagem via e-mail" acoes={<button type="button" onClick={() => setPrevia(!previa)} className="btn-sec h-8 text-[12px]"><Icone nome="olho" size={14} /> {previa ? "Editar" : "Pré-visualização"}</button>}>
        {previa ? <div className="min-h-40 whitespace-pre-wrap rounded border bg-slate-50 p-3 text-[13px]">{aplicarTags(email, EXEMPLO)}</div>
          : <textarea name="email" value={email} onChange={(e) => setEmail(e.target.value)} rows={9} className="campo h-auto" required />}
        {previa && <input type="hidden" name="email" value={email} />}
      </Bloco>
      <Bloco icone="telefone" titulo="Mensagem via SMS">
        <textarea name="sms" value={sms} onChange={(e) => setSms(e.target.value.slice(0, 120))} rows={3} className="campo h-auto" />
        <p className="mt-1 text-right text-[12px] text-slate-500">{sms.length} de 120 caracteres</p>
      </Bloco>
      {zap ? (
        <Bloco icone="whatsapp" titulo="Mensagem via WhatsApp (MXChat)" subtitulo="Enviada pelo MXChat: pela visualização da OS e, sozinha, nas situações marcadas com &quot;Enviar mensagem&quot;. *texto* fica em negrito.">
          <textarea name="whatsapp" value={textoZap} onChange={(e) => setTextoZap(e.target.value)} rows={8} className="campo h-auto font-mono text-[12px]" />
          <p className="mt-1 text-[12px] text-slate-500">Tags: {zap.tags.join(" ")}</p>
        </Bloco>
      ) : (
        <Bloco icone="whatsapp" titulo="Mensagem via WhatsApp" subtitulo="Gerada automaticamente a partir do e-mail. Não é editável.">
          <div className="whitespace-pre-wrap rounded bg-[#e7fbe6] p-3 text-[13px] text-slate-700">{whats || "—"}</div>
        </Bloco>
      )}
      <Rodape r={r} pendente={pendente} voltar={voltar} editando={!!m} />
    </form>
  );
}

export function FormConfigOrc({ ultimo, c, grupos }: {
  ultimo: number; c: { introducao: string; observacoes: string; formatoA4: string; fonteA4: number; fonteCupom: number; documentos: Record<string, boolean> };
  grupos: { grupo: string; itens: [string, string][] }[];
}) {
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(salvarConfigOrcamentoAcao, null);
  const [num, setNum] = useState(String(ultimo));
  const [abertos, setAbertos] = useState({ introducao: !!c.introducao, observacoes: !!c.observacoes });
  const fontes = Array.from({ length: 10 }, (_, i) => i + 6);
  return (
    <form {...formAcao}>
      <Bloco icone="lista" titulo="Defina o último número de cada registro" subtitulo="O número vale só para a loja atual." corpo="p-0">
        <table className="tabela">
          <thead><tr><th>Registro</th><th className="w-48">Último número usado</th><th className="w-48">Próximo sai como</th></tr></thead>
          <tbody><tr><td>Orçamentos</td><td><input name="ultimoNumero" value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, ""))} className="campo h-8 w-32" inputMode="numeric" /></td>
            <td><span className="pilula border-slate-300 bg-slate-50 text-slate-700">Próximo · {Number(num || 0) + 1}</span></td></tr></tbody>
        </table>
      </Bloco>
      <Bloco icone="editar" titulo="Escreva os textos padrão de orçamentos" subtitulo="Entram automaticamente em todo orçamento novo.">
        <div className="space-y-3">{(["introducao", "observacoes"] as const).map((k) => (
          <div key={k}>
            <div className="flex items-center"><span className="font-semibold">{k === "introducao" ? "Introdução" : "Observações"}</span>
              {!abertos[k] && <button type="button" onClick={() => setAbertos({ ...abertos, [k]: true })} className="btn-sec ml-auto h-8 text-[12px]"><Icone nome="mais" size={14} /> Escrever</button>}</div>
            {abertos[k] ? <textarea name={k} defaultValue={c[k]} rows={4} className="campo mt-1 h-auto" /> : <input type="hidden" name={k} value="" />}
          </div>
        ))}</div>
      </Bloco>
      <Bloco icone="imprimir" titulo="Defina o formato da impressão" subtitulo="Vale para orçamentos, vendas, OS e contratos.">
        <div className="grid gap-3 md:grid-cols-3">
          <label><span className="rotulo">Formato do pedido A4</span><select name="formatoA4" defaultValue={c.formatoA4} className="campo"><option value="PDF">PDF</option><option value="HTML">HTML</option></select></label>
          <label><span className="rotulo">Tamanho da fonte no A4</span><select name="fonteA4" defaultValue={c.fonteA4} className="campo">{fontes.map((f) => <option key={f} value={f}>{f}px</option>)}</select></label>
          <label><span className="rotulo">Tamanho da fonte no cupom</span><select name="fonteCupom" defaultValue={c.fonteCupom} className="campo">{fontes.map((f) => <option key={f} value={f}>{f}px</option>)}</select></label>
        </div>
      </Bloco>
      <Bloco icone="olho" titulo="Escolha o que aparece nos documentos">
        <div className="grid gap-4 md:grid-cols-3">{grupos.map((g) => (
          <div key={g.grupo}><div className="mb-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{g.grupo}</div>
            {g.itens.map(([k, rot]) => (
              <label key={k} className="flex items-center gap-2 py-1"><input type="checkbox" name={k} value="1" defaultChecked={c.documentos[k]} className="chave" /> {rot}</label>
            ))}</div>
        ))}</div>
      </Bloco>
      <Rodape r={r} pendente={pendente} voltar="/orcamentos" editando rotulo="Salvar configurações" />
    </form>
  );
}
