"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import Icone from "@/components/Icone";
import Busca from "@/components/ui/Busca";
import { Bloco, Campo } from "@/components/ui/Pagina";
import type { LinhaEstoque } from "@/lib/estoque/consultas";
import { salvarOsForm, type ResultadoForm } from "./actions";

export type Equip = {
  equipamento: string; marca: string; modelo: string; serie: string; condicoes: string; defeitos: string;
  acessorios: string; solucao: string; laudo: string; garantia: string;
};
export type ProdForm = { id?: string; produtoId: string; codigo: string; nome: string; unidade: string; quantidade: number; valorUnit: number; locais: string | null; disponivel: number | null };
export type ServForm = { id?: string; servicoId: string; nome: string; quantidade: number; valorUnit: number };
export type Cliente = { id: string; nome: string; fantasia: string | null; documento: string | null; cidade: string | null };

export type DadosFormOs = {
  id?: string;
  numero: number | null;
  cliente: Cliente | null;
  situacao: string;
  entrada: string; // AAAA-MM-DDTHH:mm (horário de São Paulo)
  saida: string;
  previsao: string; // AAAA-MM-DD
  canal: string;
  prioridade: string;
  vendedorId: string;
  tecnicoId: string;
  equipamentos: Equip[];
  produtos: ProdForm[];
  servicos: ServForm[];
  frete: number;
  outros: number;
  desconto: number;
  observacoes: string;
  observacaoInterna: string;
};

const EQUIP_VAZIO: Equip = { equipamento: "", marca: "", modelo: "", serie: "", condicoes: "", defeitos: "", acessorios: "", solucao: "", laudo: "", garantia: "" };
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const n2 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lerNum = (s: string) => { const v = Number(s.replace(/\./g, "").replace(",", ".")); return Number.isFinite(v) ? v : 0; };

/** Campo de valor em reais no formato brasileiro (aceita 1.234,56). */
function CampoValor({ valor, onChange, className = "" }: { valor: number; onChange: (n: number) => void; className?: string }) {
  const [txt, setTxt] = useState(n2(valor));
  const [editando, setEditando] = useState(false);
  return (
    <input className={`campo text-right ${className}`} inputMode="decimal"
      value={editando ? txt : n2(valor)}
      onFocus={(e) => { setEditando(true); setTxt(n2(valor)); setTimeout(() => e.target.select()); }}
      onChange={(e) => { setTxt(e.target.value); onChange(lerNum(e.target.value)); }}
      onBlur={() => setEditando(false)} />
  );
}

export default function FormOs({ inicial, usuarios, servicos, situacoes, prioridades, canais, produtosTravados }: {
  inicial: DadosFormOs;
  usuarios: { id: string; nome: string; tecnico: boolean; vendedor: boolean }[];
  servicos: { id: string; nome: string; preco: number }[];
  situacoes: { valor: string; rotulo: string }[];
  prioridades: { valor: string; rotulo: string }[];
  canais: string[];
  /** OS concluída/faturada: produtos só mudam reabrindo */
  produtosTravados: boolean;
}) {
  const [d, setD] = useState<DadosFormOs>(inicial.equipamentos.length ? inicial : { ...inicial, equipamentos: [{ ...EQUIP_VAZIO }] });
  const [estado, acao, pendente] = useActionState<ResultadoForm, FormData>(salvarOsForm, null);
  const [servicoSel, setServicoSel] = useState("");
  const set = <K extends keyof DadosFormOs>(k: K, v: DadosFormOs[K]) => setD((x) => ({ ...x, [k]: v }));
  const setEq = (i: number, k: keyof Equip, v: string) => set("equipamentos", d.equipamentos.map((e, j) => (j === i ? { ...e, [k]: v } : e)));
  const setProd = (i: number, m: Partial<ProdForm>) => set("produtos", d.produtos.map((p, j) => (j === i ? { ...p, ...m } : p)));
  const setServ = (i: number, m: Partial<ServForm>) => set("servicos", d.servicos.map((p, j) => (j === i ? { ...p, ...m } : p)));

  const totalProdutos = d.produtos.reduce((s, p) => s + p.quantidade * p.valorUnit, 0);
  const totalServicos = d.servicos.reduce((s, p) => s + p.quantidade * p.valorUnit, 0);
  const total = Math.round((totalProdutos + totalServicos + d.frete + d.outros - d.desconto) * 100) / 100;
  const travado = produtosTravados && d.situacao === inicial.situacao;
  const tecnicos = usuarios.filter((u) => u.tecnico || u.id === d.tecnicoId);
  const vendedores = usuarios.filter((u) => u.vendedor || u.id === d.vendedorId);

  function incluirProduto(p: LinhaEstoque) {
    const ja = d.produtos.findIndex((x) => x.produtoId === p.id && !x.id);
    if (ja >= 0) return setProd(ja, { quantidade: d.produtos[ja].quantidade + 1 });
    set("produtos", [...d.produtos, { produtoId: p.id, codigo: p.codigo, nome: p.nome, unidade: p.unidade, quantidade: 1, valorUnit: p.precoVenda, locais: p.locais, disponivel: p.disponivel }]);
  }

  function incluirServico() {
    const s = servicos.find((x) => x.id === servicoSel);
    if (!s) return;
    set("servicos", [...d.servicos, { servicoId: s.id, nome: s.nome, quantidade: 1, valorUnit: s.preco }]);
    setServicoSel("");
  }

  const precisaNegativo = estado && !estado.ok && estado.mensagem.startsWith("Sem estoque");

  return (
    <form action={acao}>
      <input type="hidden" name="dados" value={JSON.stringify(d)} />

      <Bloco icone="editar" titulo={<>Informe os <b>dados</b> da ordem de serviço</>} subtitulo="Número, cliente, situação, entrada e saída.">
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-12">
          <Campo rotulo="Número" className="lg:col-span-2">
            <input className="campo" readOnly value={d.numero ?? "automático"} />
          </Campo>
          <div className="lg:col-span-4">
            <span className="rotulo obrig">Cliente</span>
            <Busca<Cliente>
              url={(q) => `/api/clientes?q=${encodeURIComponent(q)}`}
              valor={d.cliente}
              rotulo={(c) => c.nome}
              onEscolher={(c) => set("cliente", c)}
              autoFocus={!d.id}
              linha={(c) => (
                <span>
                  <span className="uppercase">{c.nome}</span>
                  {c.fantasia && <span className="italic text-slate-500"> ({c.fantasia})</span>}
                  <span className="block text-[11px] text-slate-500">{[c.documento, c.cidade].filter(Boolean).join(" · ")}</span>
                </span>
              )}
            />
          </div>
          <Campo rotulo="Situação" obrigatorio className="lg:col-span-2">
            <select className="campo" value={d.situacao} onChange={(e) => set("situacao", e.target.value)}>
              {situacoes.filter((s) => s.valor !== "FATURADA" || inicial.situacao === "FATURADA").map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Entrada" obrigatorio className="lg:col-span-4">
            <div className="flex gap-2">
              <input type="date" className="campo" value={d.entrada.slice(0, 10)} onChange={(e) => set("entrada", `${e.target.value}T${d.entrada.slice(11, 16) || "08:00"}`)} required />
              <input type="time" className="campo w-32" value={d.entrada.slice(11, 16)} onChange={(e) => set("entrada", `${d.entrada.slice(0, 10)}T${e.target.value}`)} />
            </div>
          </Campo>
          <Campo rotulo="Saída" className="lg:col-span-3">
            <div className="flex gap-2">
              <input type="date" className="campo" value={d.saida.slice(0, 10)} onChange={(e) => set("saida", e.target.value ? `${e.target.value}T${d.saida.slice(11, 16) || "18:00"}` : "")} />
              <input type="time" className="campo w-28" value={d.saida.slice(11, 16)} disabled={!d.saida} onChange={(e) => set("saida", `${d.saida.slice(0, 10)}T${e.target.value}`)} />
            </div>
          </Campo>
          <Campo rotulo="Previsão de entrega" className="lg:col-span-2">
            <input type="date" className="campo" value={d.previsao} onChange={(e) => set("previsao", e.target.value)} />
          </Campo>
          <Campo rotulo="Canal de venda" obrigatorio className="lg:col-span-3">
            <select className="campo" value={d.canal} onChange={(e) => set("canal", e.target.value)}>
              {[...new Set([...canais, d.canal])].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Prioridade" className="lg:col-span-4">
            <select className="campo" value={d.prioridade} onChange={(e) => set("prioridade", e.target.value)}>
              <option value="">Selecione</option>
              {prioridades.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
            </select>
          </Campo>
        </div>
      </Bloco>

      <Bloco icone="funcionarios" titulo={<>Defina os <b>responsáveis</b> pela ordem de serviço</>} subtitulo="Vendedor e técnico que atendem este serviço.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo rotulo="Vendedor">
            <select className="campo" value={d.vendedorId} onChange={(e) => set("vendedorId", e.target.value)}>
              <option value="">—</option>
              {vendedores.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Técnico">
            <select className="campo" value={d.tecnicoId} onChange={(e) => set("tecnicoId", e.target.value)}>
              <option value="">—</option>
              {tecnicos.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Campo>
        </div>
      </Bloco>

      <Bloco icone="os" titulo={<>Descreva os <b>equipamentos</b> da ordem de serviço</>} subtitulo="Equipamento, defeitos, solução, laudo e termos de cada item.">
        <div className="space-y-5">
          {d.equipamentos.map((e, i) => (
            <div key={i} className={i ? "border-t border-slate-200 pt-4" : ""}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wide text-slate-500">Equipamento {i + 1}</span>
                <button type="button" className="btn-icone text-red-600" title="Remover equipamento"
                  onClick={() => set("equipamentos", d.equipamentos.filter((_, j) => j !== i))}><Icone nome="excluir" size={13} /></button>
              </div>
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-12">
                <Campo rotulo="Equipamento" obrigatorio className="lg:col-span-6"><input className="campo" value={e.equipamento} onChange={(x) => setEq(i, "equipamento", x.target.value)} /></Campo>
                <Campo rotulo="Marca" className="lg:col-span-2"><input className="campo" value={e.marca} onChange={(x) => setEq(i, "marca", x.target.value)} /></Campo>
                <Campo rotulo="Modelo" className="lg:col-span-2"><input className="campo" value={e.modelo} onChange={(x) => setEq(i, "modelo", x.target.value)} /></Campo>
                <Campo rotulo="Série" className="lg:col-span-2"><input className="campo" value={e.serie} onChange={(x) => setEq(i, "serie", x.target.value)} /></Campo>
                <Campo rotulo="Condições" className="lg:col-span-6"><textarea rows={2} className="campo" value={e.condicoes} onChange={(x) => setEq(i, "condicoes", x.target.value)} /></Campo>
                <Campo rotulo="Defeitos" className="lg:col-span-6"><textarea rows={2} className="campo" value={e.defeitos} onChange={(x) => setEq(i, "defeitos", x.target.value)} /></Campo>
                <Campo rotulo="Acessórios" className="lg:col-span-6"><textarea rows={2} className="campo" value={e.acessorios} onChange={(x) => setEq(i, "acessorios", x.target.value)} /></Campo>
                <Campo rotulo="Solução" className="lg:col-span-6"><textarea rows={2} className="campo" value={e.solucao} onChange={(x) => setEq(i, "solucao", x.target.value)} /></Campo>
                <Campo rotulo="Laudo técnico" className="lg:col-span-6"><textarea rows={2} className="campo" value={e.laudo} onChange={(x) => setEq(i, "laudo", x.target.value)} /></Campo>
                <Campo rotulo="Termos de garantia" className="lg:col-span-6"><textarea rows={2} className="campo" value={e.garantia} onChange={(x) => setEq(i, "garantia", x.target.value)} /></Campo>
              </div>
            </div>
          ))}
          <button type="button" className="btn-sec" onClick={() => set("equipamentos", [...d.equipamentos, { ...EQUIP_VAZIO }])}>
            <Icone nome="mais" size={14} /> Adicionar equipamento
          </button>
        </div>
      </Bloco>

      <Bloco icone="produtos" titulo={<>Adicione os <b>produtos/peças</b> da ordem de serviço</>}
        subtitulo="Cada peça já fica reservada no estoque, com o local de onde pegar.">
        {travado ? (
          <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
            O estoque desta OS já foi baixado. Para mudar as peças, volte a situação para uma em aberto.
          </p>
        ) : (
          <Busca<LinhaEstoque>
            className="mb-3"
            url={(q) => `/api/produtos?q=${encodeURIComponent(q)}`}
            valor={null}
            limparAoEscolher
            placeholder="Buscar produto por nome, código ou código de barras"
            rotulo={(p) => p.nome}
            onEscolher={(p) => p && incluirProduto(p)}
            exato={(q, l) => l.find((p) => p.codigo === q)}
            linha={(p) => (
              <span className="flex justify-between gap-3">
                <span><span className="font-mono text-[11px] text-slate-500">{p.codigo}</span> {p.nome}
                  <span className="block text-[11px] text-slate-500">{p.locais ?? "sem local"}</span></span>
                <span className="shrink-0 text-right">{brl(p.precoVenda)}
                  <span className={`block text-[11px] font-semibold ${p.disponivel > 0 ? "text-emerald-700" : "text-red-600"}`}>{p.disponivel} disp.</span></span>
              </span>
            )}
          />
        )}
        {d.produtos.length > 0 && (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>Produto</th><th className="w-48">Onde pegar</th><th className="w-28 text-right">Quantidade</th><th className="w-32 text-right">Valor</th><th className="w-32 text-right">Subtotal</th><th className="w-10"></th></tr></thead>
              <tbody>
                {d.produtos.map((p, i) => (
                  <tr key={p.id ?? `n${i}`}>
                    <td><span className="font-mono text-[11px] text-slate-500">{p.codigo}</span> {p.nome}</td>
                    <td className="text-[12px]">
                      {p.locais ?? <span className="text-slate-400">sem local</span>}
                      {p.disponivel !== null && p.quantidade > p.disponivel && !p.id && <div className="font-semibold text-red-600">falta {Math.round((p.quantidade - Math.max(p.disponivel, 0)) * 1000) / 1000}</div>}
                    </td>
                    <td><input className="campo text-right" inputMode="decimal" disabled={travado} value={String(p.quantidade).replace(".", ",")} onChange={(e) => setProd(i, { quantidade: lerNum(e.target.value) })} /></td>
                    <td>{travado ? <div className="text-right">{n2(p.valorUnit)}</div> : <CampoValor valor={p.valorUnit} onChange={(v) => setProd(i, { valorUnit: v })} />}</td>
                    <td className="text-right">{n2(p.quantidade * p.valorUnit)}</td>
                    <td>{!travado && <button type="button" className="btn-icone text-red-600" title="Remover" onClick={() => set("produtos", d.produtos.filter((_, j) => j !== i))}><Icone nome="excluir" size={13} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Bloco>

      <Bloco icone="servicos" titulo={<>Adicione os <b>serviços</b> da ordem de serviço</>} subtitulo="Mão de obra cobrada nesta OS.">
        <div className="mb-3 flex gap-2">
          <select className="campo" value={servicoSel} onChange={(e) => setServicoSel(e.target.value)}>
            <option value="">Selecione o serviço…</option>
            {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome} — {brl(s.preco)}</option>)}
          </select>
          <button type="button" className="btn-sec shrink-0" onClick={incluirServico} disabled={!servicoSel}><Icone nome="mais" size={14} /> Adicionar</button>
        </div>
        {d.servicos.length > 0 && (
          <table className="tabela">
            <thead><tr><th>Serviço</th><th className="w-28 text-right">Quantidade</th><th className="w-32 text-right">Valor</th><th className="w-32 text-right">Subtotal</th><th className="w-10"></th></tr></thead>
            <tbody>
              {d.servicos.map((s, i) => (
                <tr key={s.id ?? `n${i}`}>
                  <td>{s.nome}</td>
                  <td><input className="campo text-right" inputMode="decimal" value={String(s.quantidade).replace(".", ",")} onChange={(e) => setServ(i, { quantidade: lerNum(e.target.value) })} /></td>
                  <td><CampoValor valor={s.valorUnit} onChange={(v) => setServ(i, { valorUnit: v })} /></td>
                  <td className="text-right">{n2(s.quantidade * s.valorUnit)}</td>
                  <td><button type="button" className="btn-icone text-red-600" title="Remover" onClick={() => set("servicos", d.servicos.filter((_, j) => j !== i))}><Icone nome="excluir" size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Bloco>

      <Bloco icone="valor" titulo={<>Confira os <b>totais</b> da ordem de serviço</>} subtitulo="Peças, mão de obra, frete, outros e desconto.">
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Campo rotulo="Peças"><input className="campo text-right" readOnly value={n2(totalProdutos)} /></Campo>
          <Campo rotulo="Mão de obra"><input className="campo text-right" readOnly value={n2(totalServicos)} /></Campo>
          <Campo rotulo="Frete"><CampoValor valor={d.frete} onChange={(v) => set("frete", v)} /></Campo>
          <Campo rotulo="Outros"><CampoValor valor={d.outros} onChange={(v) => set("outros", v)} /></Campo>
          <Campo rotulo="Desconto (R$)"><CampoValor valor={d.desconto} onChange={(v) => set("desconto", v)} /></Campo>
          <Campo rotulo="Total"><input className="campo text-right font-semibold" readOnly value={n2(total)} /></Campo>
        </div>
      </Bloco>

      <Bloco icone="notas" titulo={<>Escreva as <b>observações</b> da ordem de serviço</>} subtitulo="A observação sai na impressão; a interna só aparece aqui dentro.">
        <div className="grid gap-4 md:grid-cols-2">
          <Campo rotulo="Observações"><textarea rows={3} className="campo" value={d.observacoes} onChange={(e) => set("observacoes", e.target.value)} /></Campo>
          <Campo rotulo="Observações internas"><textarea rows={3} className="campo" value={d.observacaoInterna} onChange={(e) => set("observacaoInterna", e.target.value)} /></Campo>
        </div>
      </Bloco>

      <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-2px_6px_rgba(0,0,0,0.04)] md:-mx-5 md:px-5">
        {estado && !estado.ok && (
          <div className="mb-2 rounded bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {estado.mensagem}
            {precisaNegativo && <label className="ml-3 inline-flex items-center gap-1.5"><input type="checkbox" name="negativo" /> Baixar mesmo assim (estoque fica negativo)</label>}
            {estado.mensagem.includes("recebidas") && <label className="ml-3 inline-flex items-center gap-1.5"><input type="checkbox" name="forcar" /> Reabrir e apagar os recebimentos</label>}
          </div>
        )}
        <div className="flex items-center gap-3">
          <Link href={d.id ? `/os/${d.id}` : "/os"} className="btn-sec">Cancelar</Link>
          <div className="ml-auto text-right">
            <div className="text-[11px] text-slate-500">Valor total</div>
            <div className="text-[18px] font-semibold">{brl(total)}</div>
          </div>
          <button className="btn px-5" disabled={pendente || !d.cliente}>{pendente ? "Salvando…" : d.id ? "Salvar" : "Cadastrar"}</button>
        </div>
      </div>
    </form>
  );
}
