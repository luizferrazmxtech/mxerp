"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import Icone from "@/components/Icone";
import { Bloco, Campo } from "@/components/ui/Pagina";
import Busca from "@/components/ui/Busca";
import { itensDoFornecedorAcao, salvarCotacaoForm, type Resultado } from "@/lib/compras/acoes";
import type { DadosCotacao, FornecedorCotacaoForm, ItemCotacaoForm } from "@/lib/compras/cotacoes";

type Pessoa = { id: string; nome: string; fantasia?: string | null; email?: string | null; celular?: string | null; telefone?: string | null };
type ItemBusca = { id: string; codigo: string; nome: string; unidade?: string };

/** Adicionar/editar cotação: fornecedores (cada um recebe um link), itens a cotar, observações e anexos. */
export default function FormCotacao({ inicial, anexos = [] }: { inicial: DadosCotacao & { id?: string }; anexos?: { id: string; nome: string }[] }) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(salvarCotacaoForm, null);
  const [d, setD] = useState(inicial);
  const [carregando, start] = useTransition();
  const setF = (i: number, m: Partial<FornecedorCotacaoForm>) => setD((x) => ({ ...x, fornecedores: x.fornecedores.map((f, j) => (j === i ? { ...f, ...m } : f)) }));
  const setI = (i: number, m: Partial<ItemCotacaoForm>) => setD((x) => ({ ...x, itens: x.itens.map((f, j) => (j === i ? { ...f, ...m } : f)) }));
  const carregar = (fornecedorId: string) => start(async () => {
    const novos = await itensDoFornecedorAcao(fornecedorId);
    setD((x) => {
      const tem = new Set(x.itens.map((i) => i.produtoId || i.servicoId).filter(Boolean));
      const add = novos.filter((i) => !tem.has(i.produtoId || i.servicoId));
      if (!add.length) window.alert("Nenhum item novo vinculado a este fornecedor no cadastro de produtos.");
      return { ...x, itens: [...x.itens.filter((i) => i.produtoId || i.servicoId || i.nome), ...add] };
    });
  });
  return (
    <form action={acao}>
      <input type="hidden" name="dados" value={JSON.stringify(d)} />
      <Bloco icone="editar" titulo={<>Informe os <b>dados</b> da cotação</>}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo rotulo="Data" obrigatorio><input type="date" className="campo" value={d.data} onChange={(e) => setD({ ...d, data: e.target.value })} /></Campo>
          <Campo rotulo="Prazo de recebimento"><input type="date" className="campo" value={d.prazo} onChange={(e) => setD({ ...d, prazo: e.target.value })} /><span className="text-[11px] text-slate-500">Até quando os fornecedores podem responder.</span></Campo>
        </div>
      </Bloco>
      <Bloco icone="fornecedores" titulo={<>Escolha os <b>fornecedores</b> da cotação</>} subtitulo="Cada fornecedor recebe um link próprio para responder os valores." corpo="p-0">
        <div className="overflow-x-auto">
          <table className="tabela">
            <thead><tr><th className="min-w-72">Fornecedor *</th><th className="w-64">E-mail *</th><th className="w-44">Celular</th><th className="w-40 text-right">Ações</th></tr></thead>
            <tbody>
              {d.fornecedores.map((f, i) => (
                <tr key={i}>
                  <td>{f.fornecedorId ? <b className="text-[13px] uppercase">{f.nome}</b> : (
                    <Busca<Pessoa> url={(q) => `/api/pessoas?papel=fornecedor&q=${encodeURIComponent(q)}`} valor={null} rotulo={(p) => p.nome} autoFocus
                      linha={(p) => <span>{p.nome}{p.fantasia && <i className="ml-1 text-[11px] text-slate-500">{p.fantasia}</i>}</span>}
                      onEscolher={(p) => p && setF(i, { fornecedorId: p.id, nome: p.nome, email: p.email ?? "", celular: p.celular ?? p.telefone ?? "" })} />
                  )}</td>
                  <td><input className="campo" type="email" value={f.email} onChange={(e) => setF(i, { email: e.target.value })} /></td>
                  <td><input className="campo" value={f.celular} onChange={(e) => setF(i, { celular: e.target.value })} /></td>
                  <td><div className="flex justify-end gap-1">
                    {f.fornecedorId && <button type="button" className="btn-sec px-2 py-1 text-[12px]" disabled={carregando} onClick={() => carregar(f.fornecedorId)} title="Traz os produtos vinculados a este fornecedor"><Icone nome="atualizar" size={12} /> Carregar itens</button>}
                    <button type="button" className="btn-icone text-red-600" title="Remover" onClick={() => setD({ ...d, fornecedores: d.fornecedores.filter((_, j) => j !== i) })}><Icone nome="excluir" size={13} /></button>
                  </div></td>
                </tr>
              ))}
              {!d.fornecedores.length && <tr><td colSpan={4} className="py-6 text-center text-slate-500">Nenhum fornecedor na cotação</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="p-3"><button type="button" className="btn-sec" onClick={() => setD({ ...d, fornecedores: [...d.fornecedores, { fornecedorId: "", nome: "", email: "", celular: "" }] })}><Icone nome="mais" size={14} /> Adicionar outro fornecedor</button></div>
      </Bloco>
      <Bloco icone="produtos" titulo={<>Adicione os <b>itens</b> a cotar</>} corpo="p-0">
        <div className="overflow-x-auto">
          <table className="tabela">
            <thead><tr><th className="min-w-80">Item *</th><th className="min-w-48">Detalhes</th><th className="w-28 text-right">Quantidade *</th><th className="w-24">Unidade *</th><th className="w-12"></th></tr></thead>
            <tbody>
              {d.itens.map((l, i) => {
                const tipo = l.servicoId ? "servico" : "produto";
                return (
                  <tr key={i}>
                    <td>{l.produtoId || l.servicoId ? <div className="text-[13px]"><span className="mr-1 rounded bg-slate-100 px-1 text-[10px] uppercase text-slate-500">{l.servicoId ? "Serviço" : "Produto"}</span>{l.codigo && <span className="font-mono text-[11px] text-slate-500">{l.codigo} </span>}{l.nome}</div> : (
                      <div className="flex gap-1">
                        <select className="campo w-28" value={(l as ItemCotacaoForm & { _t?: string })._t ?? tipo} onChange={(e) => setI(i, { _t: e.target.value } as Partial<ItemCotacaoForm>)}><option value="produto">Produto</option><option value="servico">Serviço</option></select>
                        <Busca<ItemBusca> className="flex-1" url={(q) => `/api/itens/busca?tipo=${(l as ItemCotacaoForm & { _t?: string })._t ?? "produto"}&q=${encodeURIComponent(q)}`} valor={null} rotulo={(p) => p.nome} autoFocus
                          linha={(p) => <span><span className="font-mono text-[11px] text-slate-500">{p.codigo}</span> {p.nome}</span>}
                          onEscolher={(p) => { if (!p) return; const serv = (l as ItemCotacaoForm & { _t?: string })._t === "servico"; setI(i, { produtoId: serv ? "" : p.id, servicoId: serv ? p.id : "", nome: p.nome, codigo: p.codigo, unidade: p.unidade ?? "UN" }); }} />
                      </div>
                    )}</td>
                    <td><input className="campo" value={l.detalhes} onChange={(e) => setI(i, { detalhes: e.target.value })} /></td>
                    <td><input className="campo text-right" value={l.quantidade} onChange={(e) => setI(i, { quantidade: e.target.value })} /></td>
                    <td><input className="campo uppercase" value={l.unidade} onChange={(e) => setI(i, { unidade: e.target.value })} /></td>
                    <td><button type="button" className="btn-icone text-red-600" title="Remover" onClick={() => setD({ ...d, itens: d.itens.filter((_, j) => j !== i) })}><Icone nome="excluir" size={13} /></button></td>
                  </tr>
                );
              })}
              {!d.itens.length && <tr><td colSpan={5} className="py-6 text-center text-slate-500">Nenhum item na cotação</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="p-3"><button type="button" className="btn-sec" onClick={() => setD({ ...d, itens: [...d.itens, { produtoId: "", servicoId: "", nome: "", detalhes: "", quantidade: "1", unidade: "UN" }] })}><Icone nome="mais" size={14} /> Adicionar item</button></div>
      </Bloco>
      <Bloco icone="notas" titulo={<>Insira as informações de <b>observação e anexos</b></>}>
        <div className="grid gap-3 lg:grid-cols-2">
          <Campo rotulo="Observações para o fornecedor"><textarea rows={3} className="campo h-auto" value={d.observacoes} onChange={(e) => setD({ ...d, observacoes: e.target.value })} /><span className="text-[11px] text-slate-500">Aparecem na página de resposta.</span></Campo>
          <Campo rotulo="Observações internas"><textarea rows={3} className="campo h-auto" value={d.observacaoInterna} onChange={(e) => setD({ ...d, observacaoInterna: e.target.value })} /></Campo>
        </div>
        {anexos.length > 0 && <div className="mt-3 flex flex-wrap gap-2 text-[12px]">{anexos.map((a) => <a key={a.id} href={`/api/cadastros/anexo/${a.id}`} className="rounded border px-2 py-1 text-marca hover:underline"><Icone nome="anexos" size={12} className="inline" /> {a.nome}</a>)}</div>}
        <label className="btn-sec relative mt-3 cursor-pointer"><Icone nome="anexos" size={14} /> Adicionar anexo<input type="file" name="anexos" multiple className="absolute inset-0 cursor-pointer opacity-0" /></label>
        <span className="ml-2 text-[11px] text-slate-500">Até 10 arquivos de 5 MB.</span>
      </Bloco>
      <div className="sticky bottom-0 z-10 mt-3 border-t bg-white px-4 py-3">
        {r && !r.ok && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-[13px] text-red-700">{r.mensagem}</div>}
        <div className="flex items-center gap-3"><span className="text-[13px]">{d.fornecedores.filter((f) => f.fornecedorId).length} fornecedor(es) · {d.itens.length} item(ns)</span>
          <Link href={inicial.id ? `/compras/cotacoes/${inicial.id}` : "/compras/cotacoes"} className="btn-sec ml-auto">Cancelar</Link><button className="btn px-5" disabled={pendente}>{pendente ? "Salvando…" : inicial.id ? "Salvar" : "Cadastrar"}</button></div>
      </div>
    </form>
  );
}
