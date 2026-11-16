"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import Icone from "@/components/Icone";
import Busca from "@/components/ui/Busca";
import { Bloco, Campo } from "@/components/ui/Pagina";
import type { LinhaEstoque } from "@/lib/estoque/consultas";
import { salvarVendaForm, type ResultadoSimples } from "./actions";

type Cliente = { id: string; nome: string; fantasia: string | null; documento: string | null; cidade: string | null };
export type ItemVendaForm = { id?: string; produtoId: string; codigo: string; nome: string; quantidade: number; valorUnit: number; locais: string | null; disponivel: number | null };
export type DadosFormVenda = {
  id?: string; numero: number | null; cliente: Cliente | null; situacao: string; data: string; vendedorId: string;
  produtos: ItemVendaForm[]; frete: number; desconto: number; observacoes: string;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const n2 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lerNum = (s: string) => { const v = Number(s.replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) ? v : 0; };

function CampoValor({ valor, onChange, disabled }: { valor: number; onChange: (n: number) => void; disabled?: boolean }) {
  const [txt, setTxt] = useState(n2(valor));
  const [editando, setEditando] = useState(false);
  return (
    <input className="campo text-right" inputMode="decimal" disabled={disabled}
      value={editando ? txt : n2(valor)}
      onFocus={(e) => { setEditando(true); setTxt(n2(valor)); setTimeout(() => e.target.select()); }}
      onChange={(e) => { setTxt(e.target.value); onChange(lerNum(e.target.value)); }}
      onBlur={() => setEditando(false)} />
  );
}

export default function FormVenda({ inicial, vendedores }: { inicial: DadosFormVenda; vendedores: { id: string; nome: string }[] }) {
  const [d, setD] = useState(inicial);
  const [estado, acao, pendente] = useActionState<ResultadoSimples, FormData>(salvarVendaForm, null);
  const set = <K extends keyof DadosFormVenda>(k: K, v: DadosFormVenda[K]) => setD((x) => ({ ...x, [k]: v }));
  const setProd = (i: number, m: Partial<ItemVendaForm>) => set("produtos", d.produtos.map((p, j) => (j === i ? { ...p, ...m } : p)));
  const concluida = inicial.situacao === "CONCLUIDA";
  const totalProdutos = d.produtos.reduce((s, p) => s + p.quantidade * p.valorUnit, 0);
  const total = Math.round((totalProdutos + d.frete - d.desconto) * 100) / 100;

  function incluir(p: LinhaEstoque) {
    const ja = d.produtos.findIndex((x) => x.produtoId === p.id && !x.id);
    if (ja >= 0) return setProd(ja, { quantidade: d.produtos[ja].quantidade + 1 });
    set("produtos", [...d.produtos, { produtoId: p.id, codigo: p.codigo, nome: p.nome, quantidade: 1, valorUnit: p.precoVenda, locais: p.locais, disponivel: p.disponivel }]);
  }

  return (
    <form action={acao}>
      <input type="hidden" name="dados" value={JSON.stringify(d)} />
      <Bloco icone="editar" titulo={<>Informe os <b>dados</b> da venda</>} subtitulo="Número, cliente, situação, data e vendedor.">
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-12">
          <Campo rotulo="Número" className="lg:col-span-2"><input className="campo" readOnly value={d.numero ?? "automático"} /></Campo>
          <div className="lg:col-span-4">
            <span className="rotulo">Cliente</span>
            <Busca<Cliente>
              url={(q) => `/api/clientes?q=${encodeURIComponent(q)}`}
              valor={d.cliente}
              rotulo={(c) => c.nome}
              onEscolher={(c) => set("cliente", c)}
              placeholder="Consumidor (digite para buscar)"
              autoFocus={!d.id}
              linha={(c) => <span><span className="uppercase">{c.nome}</span>{c.fantasia && <span className="italic text-slate-500"> ({c.fantasia})</span>}<span className="block text-[11px] text-slate-500">{[c.documento, c.cidade].filter(Boolean).join(" · ")}</span></span>}
            />
          </div>
          <Campo rotulo="Situação" obrigatorio className="lg:col-span-2">
            <select className="campo" value={d.situacao} disabled={concluida} onChange={(e) => set("situacao", e.target.value)}>
              {concluida && <option value="CONCLUIDA">Concretizada</option>}
              <option value="ABERTA">Em aberto</option>
              <option value="ORCAMENTO">Orçamento</option>
              {d.id && <option value="CANCELADA">Cancelada</option>}
            </select>
          </Campo>
          <Campo rotulo="Data" obrigatorio className="lg:col-span-2"><input type="date" className="campo" value={d.data} onChange={(e) => set("data", e.target.value)} /></Campo>
          <Campo rotulo="Vendedor" className="lg:col-span-2">
            <select className="campo" value={d.vendedorId} onChange={(e) => set("vendedorId", e.target.value)}>
              <option value="">—</option>
              {vendedores.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Campo>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Em aberto reserva os produtos no estoque. Orçamento não reserva.</p>
      </Bloco>

      <Bloco icone="produtos" titulo={<>Adicione os <b>produtos</b> da venda</>} subtitulo="Mostra o disponível e a prateleira de cada produto.">
        {concluida ? (
          <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-[13px] text-amber-800">Venda concretizada: para mudar os produtos, altere a situação para Em aberto na tela da venda.</p>
        ) : (
          <Busca<LinhaEstoque>
            className="mb-3"
            url={(q) => `/api/produtos?q=${encodeURIComponent(q)}`}
            valor={null}
            limparAoEscolher
            placeholder="Buscar produto por nome, código ou código de barras"
            rotulo={(p) => p.nome}
            onEscolher={(p) => p && incluir(p)}
            exato={(q, l) => l.find((p) => p.codigo === q)}
            linha={(p) => (
              <span className="flex justify-between gap-3">
                <span><span className="font-mono text-[11px] text-slate-500">{p.codigo}</span> {p.nome}<span className="block text-[11px] text-slate-500">{p.locais ?? "sem local"}</span></span>
                <span className="shrink-0 text-right">{brl(p.precoVenda)}<span className={`block text-[11px] font-semibold ${p.disponivel > 0 ? "text-emerald-700" : "text-red-600"}`}>{p.disponivel} disp.</span></span>
              </span>
            )}
          />
        )}
        {d.produtos.length > 0 && (
          <table className="tabela">
            <thead><tr><th>Produto</th><th className="w-48">Onde pegar</th><th className="w-28 text-right">Quantidade</th><th className="w-32 text-right">Valor</th><th className="w-32 text-right">Subtotal</th><th className="w-10"></th></tr></thead>
            <tbody>
              {d.produtos.map((p, i) => (
                <tr key={p.id ?? `n${i}`}>
                  <td><span className="font-mono text-[11px] text-slate-500">{p.codigo}</span> {p.nome}</td>
                  <td className="text-[12px]">{p.locais ?? <span className="text-slate-400">sem local</span>}
                    {p.disponivel !== null && p.quantidade > p.disponivel && !p.id && <div className="font-semibold text-red-600">falta {Math.round((p.quantidade - Math.max(p.disponivel, 0)) * 1000) / 1000}</div>}</td>
                  <td><input className="campo text-right" inputMode="decimal" disabled={concluida} value={String(p.quantidade).replace(".", ",")} onChange={(e) => setProd(i, { quantidade: lerNum(e.target.value) })} /></td>
                  <td><CampoValor valor={p.valorUnit} disabled={concluida} onChange={(v) => setProd(i, { valorUnit: v })} /></td>
                  <td className="text-right">{n2(p.quantidade * p.valorUnit)}</td>
                  <td>{!concluida && <button type="button" className="btn-icone text-red-600" title="Remover" onClick={() => set("produtos", d.produtos.filter((_, j) => j !== i))}><Icone nome="excluir" size={13} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Bloco>

      <Bloco icone="valor" titulo={<>Confira os <b>totais</b> da venda</>} subtitulo="Produtos, frete e desconto.">
        <div className="grid gap-4 sm:grid-cols-4">
          <Campo rotulo="Produtos"><input className="campo text-right" readOnly value={n2(totalProdutos)} /></Campo>
          <Campo rotulo="Frete"><CampoValor valor={d.frete} disabled={concluida} onChange={(v) => set("frete", v)} /></Campo>
          <Campo rotulo="Desconto (R$)"><CampoValor valor={d.desconto} disabled={concluida} onChange={(v) => set("desconto", v)} /></Campo>
          <Campo rotulo="Total"><input className="campo text-right font-semibold" readOnly value={n2(total)} /></Campo>
        </div>
      </Bloco>

      <Bloco icone="notas" titulo={<>Escreva as <b>observações</b> da venda</>}>
        <textarea rows={3} className="campo" value={d.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
      </Bloco>

      <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-2px_6px_rgba(0,0,0,0.04)] md:-mx-5 md:px-5">
        {estado && !estado.ok && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-[13px] text-red-700">{estado.mensagem}</div>}
        <div className="flex items-center gap-3">
          <Link href={d.id ? `/vendas/${d.id}` : "/vendas"} className="btn-sec">Cancelar</Link>
          <div className="ml-auto text-right"><div className="text-[11px] text-slate-500">Valor total</div><div className="text-[18px] font-semibold">{brl(total)}</div></div>
          <button className="btn px-5" disabled={pendente}>{pendente ? "Salvando…" : d.id ? "Salvar" : "Cadastrar"}</button>
        </div>
      </div>
    </form>
  );
}
