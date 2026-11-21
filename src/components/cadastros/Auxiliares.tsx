"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import Link from "next/link";
import { useEffect, useState } from "react";
import Icone from "@/components/Icone";
import { salvarCampoExtraAcao, salvarTipoAcao, type Resultado } from "@/lib/cadastros/auxiliares";

/** Faixa azul informativa que pode ser fechada (lembra a escolha no navegador). */
export function FaixaInfo({ chave, titulo, children }: { chave: string; titulo: string; children: React.ReactNode }) {
  const [fechada, setFechada] = useState(false);
  useEffect(() => { try { if (localStorage.getItem(`mxerp:faixa:${chave}`) === "1") setFechada(true); } catch {} }, [chave]);
  if (fechada) return null;
  return (
    <div className="mb-3 flex items-start gap-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2.5 text-[13px] text-slate-700">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tinta text-white"><Icone nome="auxiliares" size={15} /></span>
      <div className="flex-1"><div className="font-semibold">{titulo}</div>{children}</div>
      <button type="button" title="Fechar" onClick={() => { setFechada(true); try { localStorage.setItem(`mxerp:faixa:${chave}`, "1"); } catch {} }}><Icone nome="fechar" size={15} /></button>
    </div>
  );
}

export function FormTipo({ tabela, id, nome, voltar }: { tabela: "contato" | "endereco"; id?: string; nome?: string; voltar: string }) {
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(salvarTipoAcao, null);
  return (
    <form {...formAcao} className="cartao mb-3 flex flex-wrap items-end gap-2 p-4">
      <input type="hidden" name="tabela" value={tabela} />
      {id && <input type="hidden" name="id" value={id} />}
      <label className="min-w-64 flex-1"><span className="rotulo obrig">Nome</span><input name="nome" defaultValue={nome} required autoFocus className="campo" /></label>
      <Link href={voltar} className="btn-sec">Cancelar</Link>
      <button className="btn" disabled={pendente}>{id ? "Salvar" : "Cadastrar"}</button>
      {r && !r.ok && <p className="w-full text-[13px] text-red-700">{r.mensagem}</p>}
    </form>
  );
}

const TIPOS = [
  ["TEXTO", "Texto"], ["NUMEROS", "Números"], ["DATA", "Data"], ["CPF", "CPF"], ["CNPJ", "CNPJ"], ["SELECAO_UNICA", "Seleção única"], ["MULTIPLA_SELECAO", "Múltipla seleção"],
] as const;

export function FormCampoExtra({ c, entidade = "CLIENTE" }: { c?: { id: string; nome: string; tipo: string; opcoes: string[]; obrigatorio: boolean }; entidade?: string }) {
  const voltar = entidade === "PRODUTO" ? "/campos-extras?entidade=PRODUTO" : "/campos-extras";
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(salvarCampoExtraAcao, null);
  const [tipo, setTipo] = useState(c?.tipo ?? "");
  const selecao = tipo === "SELECAO_UNICA" || tipo === "MULTIPLA_SELECAO";
  return (
    <form {...formAcao}>
      {c && <input type="hidden" name="id" value={c.id} />}
      <input type="hidden" name="entidade" value={entidade} />
      <section className="cartao mb-3">
        <div className="rounded-t-md border-b border-slate-200 bg-[#f7f7f7] px-4 py-3">
          <h2 className="flex items-center gap-1.5 text-[17px] font-light [&_b]:font-semibold"><Icone nome="editar" size={15} /> Informe o <b>campo extra</b> {entidade === "PRODUTO" ? "dos produtos e serviços" : "do cliente"}</h2>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="lg:col-span-2"><span className="rotulo obrig">Nome</span><input name="nome" defaultValue={c?.nome} required autoFocus className="campo" /></label>
          <label><span className="rotulo obrig">Tipo</span>
            <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} required className="campo">
              <option value="">Selecione</option>{TIPOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
            <span className="mt-1 block text-[11px] text-slate-500">Define a máscara e a validação do campo.</span></label>
          <label><span className="rotulo">Obrigatório</span>
            <select name="obrigatorio" defaultValue={c?.obrigatorio ? "1" : "0"} className="campo"><option value="0">Não</option><option value="1">Sim</option></select></label>
          {selecao && (
            <label className="lg:col-span-2"><span className="rotulo obrig">Opções (uma por linha)</span>
              <textarea name="opcoes" rows={4} defaultValue={c?.opcoes.join("\n")} className="campo" /></label>
          )}
        </div>
      </section>
      <div className="sticky bottom-0 -mx-4 border-t bg-white px-4 py-3 md:-mx-5 md:px-5">
        {r && !r.ok && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-[13px] text-red-700">{r.mensagem}</div>}
        <div className="flex"><Link href={voltar} className="btn-sec">Cancelar</Link><button className="btn ml-auto px-5" disabled={pendente}>{c ? "Salvar" : "Cadastrar"}</button></div>
      </div>
    </form>
  );
}
