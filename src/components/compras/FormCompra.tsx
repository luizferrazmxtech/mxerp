"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import Icone from "@/components/Icone";
import { Bloco, Campo } from "@/components/ui/Pagina";
import Busca from "@/components/ui/Busca";
import { ResumoConversao, SeletorUnidade } from "@/components/itens/CelulaConversao";
import { fatorPeloNome, mesmaUnidade } from "@/lib/itens/unidades";
import { salvarCompraForm, type Resultado } from "@/lib/compras/acoes";
import { subtotalCompra, totaisCompra, type DadosCompra, type LinhaCompra } from "@/lib/compras/tipos";
import { gerarParcelas, lerNumero, type LinhaServico } from "@/lib/orcamentos/tipos";

export type InicialCompra = DadosCompra & { id?: string; proximoNumero: number; anexos: { id: string; nome: string }[] };
type Opcoes = { situacoes: { id: string; nome: string }[]; formas: { id: string; nome: string }[]; campos: { id: string; nome: string }[]; centros: string[] };
type ProdutoBusca = { id: string; codigo: string; nome: string; unidade: string; custo: number; fisico: number | null; unidadeCompra: string | null; fatorConversao: number };
type ServicoBusca = { id: string; codigo: string; nome: string; preco: number };

const n2 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

function Desconto({ valor, pct, onValor, onPct }: { valor: string; pct: boolean; onValor: (v: string) => void; onPct: (v: boolean) => void }) {
  return (
    <div className="flex">
      <input className="campo w-20 rounded-r-none text-right" value={valor} onChange={(e) => onValor(e.target.value)} />
      <button type="button" className="rounded-r border border-l-0 border-slate-300 bg-slate-50 px-2 text-[12px] font-semibold" title="Alternar R$ / %" onClick={() => onPct(!pct)}>{pct ? "%" : "R$"}</button>
    </div>
  );
}

/** Formulário "Adicionar/Editar compra" (produtos ou serviços), no padrão do Gestão Click. */
export default function FormCompra({ inicial, op }: { inicial: InicialCompra; op: Opcoes }) {
  const [d, setD] = useState(inicial);
  const [editNumero, setEditNumero] = useState(false);
  const [estado, acao, pendente] = useActionState<Resultado, FormData>(salvarCompraForm, null);
  const set = <K extends keyof InicialCompra>(k: K, v: InicialCompra[K]) => setD((x) => ({ ...x, [k]: v }));
  const tot = totaisCompra(d);
  const servico = d.tipo === "SERVICO";
  const base = servico ? "/compras/servicos" : "/compras";

  const setProd = (i: number, m: Partial<LinhaCompra>) => set("produtos", d.produtos.map((l, j) => (j === i ? { ...l, ...m } : l)));
  const setServ = (i: number, m: Partial<LinhaServico>) => set("servicos", d.servicos.map((l, j) => (j === i ? { ...l, ...m } : l)));
  const novoProduto = (): LinhaCompra => ({ produtoId: "", nome: "", codigo: "", unidade: "", detalhes: "", quantidade: "1", valorUnit: "0,00", desconto: "", descontoPct: false });
  const novoServico = (): LinhaServico => ({ servicoId: "", nome: "", codigo: "", detalhes: "", quantidade: "1", valorUnit: "0,00", desconto: "", descontoPct: false });

  const blocoProdutos = (
    <Bloco key="p" icone="produtos" titulo={<>Adicione os <b>produtos</b> da compra</>} subtitulo="Produto, quantidade e valor de custo por linha, na unidade da nota. Se comprou em caixa e vende por metro, escolha a unidade de compra: entra no estoque a quantidade convertida e o custo por metro." corpo="p-0">
      <div className="overflow-x-auto">
        <table className="tabela">
          <thead><tr>
            <th className="min-w-72">Produto *</th><th className="min-w-40">Detalhes</th><th className="w-24 text-right">Quant. *</th><th className="w-28">Unid.</th>
            <th className="w-32 text-right">Valor de custo *</th><th className="w-32">Desconto</th><th className="w-28 text-right">Subtotal</th><th className="w-12"></th>
          </tr></thead>
          <tbody>
            {d.produtos.map((l, i) => (
              <tr key={i}>
                <td>
                  {l.produtoId ? <div className="text-[13px]"><span className="font-mono text-[11px] text-slate-500">{l.codigo}</span> {l.nome}</div> : (
                    <Busca<ProdutoBusca> url={(q) => `/api/itens/busca?tipo=produto&q=${encodeURIComponent(q)}`} valor={null} rotulo={(p) => p.nome} autoFocus
                      linha={(p) => <span><span className="font-mono text-[11px] text-slate-500">{p.codigo}</span> {p.nome} <span className="text-[11px] text-slate-500">· custo {brl(p.custo)}{p.fisico != null ? ` · estoque ${p.fisico}` : ""}</span></span>}
                      onEscolher={(p) => {
                        if (!p) return;
                        const cp = p.unidadeCompra ? { unidade: p.unidadeCompra, fator: p.fatorConversao } : null;
                        const base = { produtoId: p.id, nome: p.nome, codigo: p.codigo, unidade: p.unidade, conversaoProduto: cp };
                        if (l.codigoFornecedor) {
                          // linha da NF-e: quantidade e valor são os da nota, na unidade da nota
                          const uNota = l.unidadeCompra || l.unidade;
                          if (mesmaUnidade(uNota, p.unidade)) setProd(i, { ...base, unidadeCompra: "", fator: "" });
                          else if (cp) setProd(i, { ...base, unidadeCompra: uNota, fator: String(cp.fator).replace(".", ",") });
                          else { const g = fatorPeloNome(`${l.detalhes} ${p.nome}`, p.unidade); setProd(i, { ...base, unidadeCompra: uNota, fator: g ? String(g) : "", salvarConversao: true }); }
                        } else
                          // produto com conversão: a compra já vem na unidade de compra (CX), com o custo da caixa
                          setProd(i, { ...base, ...(cp ? { unidadeCompra: cp.unidade, fator: String(cp.fator).replace(".", ","), valorUnit: n2(p.custo * cp.fator) } : { valorUnit: n2(p.custo) }) });
                      }} />
                  )}
                </td>
                <td><input className="campo" value={l.detalhes} onChange={(e) => setProd(i, { detalhes: e.target.value })} /></td>
                <td><input className="campo text-right" value={l.quantidade} onChange={(e) => setProd(i, { quantidade: e.target.value })} /></td>
                <td className="text-[12px] text-slate-600">{l.produtoId ? <SeletorUnidade l={l} onChange={(m) => setProd(i, m)} /> : l.unidadeCompra || l.unidade}</td>
                <td><input className="campo text-right" value={l.valorUnit} onChange={(e) => setProd(i, { valorUnit: e.target.value })} /></td>
                <td><Desconto valor={l.desconto} pct={l.descontoPct} onValor={(v) => setProd(i, { desconto: v })} onPct={(v) => setProd(i, { descontoPct: v })} /></td>
                <td className="text-right font-semibold">{n2(subtotalCompra(l))}{l.produtoId && <ResumoConversao l={l} quantidade={l.quantidade} subtotal={subtotalCompra(l)} />}</td>
                <td><button type="button" className="btn-icone text-red-600" title="Remover" onClick={() => set("produtos", d.produtos.filter((_, j) => j !== i))}><Icone nome="excluir" size={13} /></button></td>
              </tr>
            ))}
            {!d.produtos.length && <tr><td colSpan={8} className="py-6 text-center text-slate-500">Nenhum produto nesta compra</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="p-3"><button type="button" className="btn-sec" onClick={() => set("produtos", [...d.produtos, novoProduto()])}><Icone nome="mais" size={14} /> Adicionar produto</button></div>
    </Bloco>
  );

  const blocoServicos = (
    <Bloco key="s" icone="servicos" titulo={<>Adicione os <b>serviços</b> da compra</>} subtitulo="Serviço contratado, quantidade e valor." corpo="p-0">
      <div className="overflow-x-auto">
        <table className="tabela">
          <thead><tr><th className="min-w-72">Serviço *</th><th className="min-w-40">Detalhes</th><th className="w-24 text-right">Quant. *</th><th className="w-28 text-right">Valor *</th><th className="w-32">Desconto</th><th className="w-28 text-right">Subtotal</th><th className="w-12"></th></tr></thead>
          <tbody>
            {d.servicos.map((l, i) => (
              <tr key={i}>
                <td>
                  {l.servicoId ? <div className="text-[13px]"><span className="font-mono text-[11px] text-slate-500">{l.codigo}</span> {l.nome}</div> : (
                    <Busca<ServicoBusca> url={(q) => `/api/itens/busca?tipo=servico&q=${encodeURIComponent(q)}`} valor={null} rotulo={(p) => p.nome} autoFocus
                      linha={(p) => <span><span className="font-mono text-[11px] text-slate-500">{p.codigo}</span> {p.nome}</span>}
                      onEscolher={(p) => p && setServ(i, { servicoId: p.id, nome: p.nome, codigo: p.codigo, valorUnit: n2(p.preco) })} />
                  )}
                </td>
                <td><input className="campo" value={l.detalhes} onChange={(e) => setServ(i, { detalhes: e.target.value })} /></td>
                <td><input className="campo text-right" value={l.quantidade} onChange={(e) => setServ(i, { quantidade: e.target.value })} /></td>
                <td><input className="campo text-right" value={l.valorUnit} onChange={(e) => setServ(i, { valorUnit: e.target.value })} /></td>
                <td><Desconto valor={l.desconto} pct={l.descontoPct} onValor={(v) => setServ(i, { desconto: v })} onPct={(v) => setServ(i, { descontoPct: v })} /></td>
                <td className="text-right font-semibold">{n2(subtotalCompra(l))}</td>
                <td><button type="button" className="btn-icone text-red-600" title="Remover" onClick={() => set("servicos", d.servicos.filter((_, j) => j !== i))}><Icone nome="excluir" size={13} /></button></td>
              </tr>
            ))}
            {!d.servicos.length && <tr><td colSpan={7} className="py-6 text-center text-slate-500">Nenhum serviço nesta compra</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="p-3"><button type="button" className="btn-sec" onClick={() => set("servicos", [...d.servicos, novoServico()])}><Icone nome="mais" size={14} /> Adicionar serviço</button></div>
    </Bloco>
  );

  return (
    <form action={acao}>
      <input type="hidden" name="dados" value={JSON.stringify({ ...d, anexos: undefined, proximoNumero: undefined })} />

      <Bloco icone="editar" titulo={<>Informe os <b>dados</b> da compra</>} subtitulo="Número, fornecedor, data de emissão, situação e nota fiscal.">
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><span className="rotulo">Número</span>
            <div className="flex"><input className="campo rounded-r-none disabled:bg-slate-100 disabled:text-slate-500" disabled={!editNumero} value={editNumero ? d.numero : d.numero || String(inicial.proximoNumero)} onChange={(e) => set("numero", e.target.value.replace(/\D/g, ""))} />
              <button type="button" className="rounded-r border border-l-0 border-slate-300 px-2" title="Editar número" onClick={() => { setEditNumero(true); if (!d.numero) set("numero", String(inicial.proximoNumero)); }}><Icone nome="editar" size={13} /></button></div>
          </div>
          <div>
            <span className="rotulo obrig">Fornecedor</span>
            <Busca<{ id: string; nome: string; fantasia?: string | null; documento?: string | null }> url={(q) => `/api/pessoas?papel=fornecedor&q=${encodeURIComponent(q)}`}
              valor={d.fornecedorId ? { id: d.fornecedorId, nome: d.fornecedorNome } : null} rotulo={(p) => p.nome}
              linha={(p) => <span>{p.nome}{p.fantasia && <i className="text-slate-500"> ({p.fantasia})</i>}<span className="block text-[11px] text-slate-500">{p.documento}</span></span>}
              onEscolher={(p) => setD((x) => ({ ...x, fornecedorId: p?.id ?? "", fornecedorNome: p?.nome ?? "" }))} />
            <Link href="/fornecedores/adicionar" target="_blank" className="text-[11px] text-marca hover:underline">+ Adicionar novo</Link>
          </div>
          <Campo rotulo="Data de emissão" obrigatorio><input type="date" className="campo" required value={d.data} onChange={(e) => set("data", e.target.value)} /></Campo>
          <Campo rotulo="Situação" obrigatorio><select className="campo" value={d.situacaoId} onChange={(e) => set("situacaoId", e.target.value)}>{op.situacoes.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></Campo>
          <Campo rotulo="Número da NF-e"><input className="campo" value={d.numeroNfe} onChange={(e) => set("numeroNfe", e.target.value)} /></Campo>
          <Campo rotulo="Chave da NF-e" className="lg:col-span-2"><input className="campo font-mono text-[12px]" maxLength={60} value={d.chaveNfe} onChange={(e) => set("chaveNfe", e.target.value)} /></Campo>
          <Campo rotulo="Centro de custo"><input className="campo" list="centros" value={d.centroCusto} onChange={(e) => set("centroCusto", e.target.value)} /><datalist id="centros">{op.centros.map((c) => <option key={c} value={c} />)}</datalist></Campo>
          {op.campos.map((c) => <Campo key={c.id} rotulo={c.nome}><input className="campo" value={d.camposExtras[c.id] ?? ""} onChange={(e) => set("camposExtras", { ...d.camposExtras, [c.id]: e.target.value })} /></Campo>)}
        </div>
      </Bloco>

      {servico ? [blocoServicos, blocoProdutos] : [blocoProdutos, blocoServicos]}

      <Bloco icone="frete" titulo={<>Informe o <b>transporte</b> da compra</>}>
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2"><span className="rotulo">Transportadora</span>
            <Busca<{ id: string; nome: string }> url={(q) => `/api/pessoas?papel=transportadora&q=${encodeURIComponent(q)}`}
              valor={d.transportadoraId ? { id: d.transportadoraId, nome: d.transportadoraNome } : null} rotulo={(p) => p.nome} linha={(p) => p.nome}
              onEscolher={(p) => setD((x) => ({ ...x, transportadoraId: p?.id ?? "", transportadoraNome: p?.nome ?? "" }))} /></div>
          <Campo rotulo="Valor do frete (R$)"><input className="campo text-right" value={d.frete} onChange={(e) => set("frete", e.target.value)} /></Campo>
          <label className="flex items-center gap-2 pb-2 text-[13px]"><input type="checkbox" checked={d.freteNoTotal} onChange={(e) => set("freteNoTotal", e.target.checked)} /> Somar ao total</label>
        </div>
      </Bloco>

      <Bloco icone="caixa" titulo={<>Aplique <b>impostos e desconto</b> na compra</>}>
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Campo rotulo="Produtos (R$)"><input className="campo text-right" readOnly value={n2(tot.produtos)} /></Campo>
          <Campo rotulo="Serviços (R$)"><input className="campo text-right" readOnly value={n2(tot.servicos)} /></Campo>
          <Campo rotulo="Impostos (R$)"><input className="campo text-right" value={d.impostos} onChange={(e) => set("impostos", e.target.value)} /></Campo>
          <label className="flex items-center gap-2 pb-2 text-[13px]"><input type="checkbox" checked={d.impostosNoTotal} onChange={(e) => set("impostosNoTotal", e.target.checked)} /> Somar ao total</label>
          <div><span className="rotulo">Desconto</span><Desconto valor={d.desconto} pct={d.descontoPct} onValor={(v) => set("desconto", v)} onPct={(v) => set("descontoPct", v)} />
            {d.descontoPct && tot.desconto > 0 && <span className="text-[11px] text-slate-500">= {brl(tot.desconto)}</span>}</div>
          <Campo rotulo="Valor total (R$)"><input className="campo text-right text-[15px] font-semibold" readOnly value={n2(tot.total)} /></Campo>
        </div>
      </Bloco>

      <Bloco icone="dinheiro" titulo={<>Defina a <b>forma de pagamento</b> da compra</>} subtitulo="As parcelas geram as contas a pagar quando a situação lança o financeiro.">
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          {([["AVISTA", "À vista", "Uma conta a pagar no vencimento"], ["PARCELADO", "Parcelado", "Divide o total em várias parcelas"]] as const).map(([v, t, s]) => (
            <label key={v} className={`flex cursor-pointer items-center gap-3 rounded border p-3 ${d.condicao === v ? "border-marca bg-marca/5" : "border-slate-200"}`}>
              <input type="radio" checked={d.condicao === v} onChange={() => set("condicao", v)} />
              <span><b className="block text-[13px]">{t}</b><span className="text-[11px] text-slate-500">{s}</span></span>
            </label>
          ))}
        </div>
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Campo rotulo="Forma de pagamento"><select className="campo" value={d.formaPagamentoId} onChange={(e) => set("formaPagamentoId", e.target.value)}><option value="">Selecione</option>{op.formas.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></Campo>
          {d.condicao === "AVISTA" ? (
            <Campo rotulo="Vencimento"><input type="date" className="campo" value={d.vencimento} onChange={(e) => set("vencimento", e.target.value)} /></Campo>
          ) : (
            <>
              <Campo rotulo="Intervalo (dias)"><input className="campo text-right" value={d.intervaloDias} onChange={(e) => set("intervaloDias", e.target.value)} /></Campo>
              <Campo rotulo="Nº de parcelas" obrigatorio><input className="campo text-right" value={d.numParcelas} onChange={(e) => set("numParcelas", e.target.value)} /></Campo>
              <Campo rotulo="Data da 1ª parcela" obrigatorio><input type="date" className="campo" value={d.primeiraParcela} onChange={(e) => set("primeiraParcela", e.target.value)} /></Campo>
              <button type="button" className="btn-sec" onClick={() => set("parcelas", gerarParcelas(tot.total, lerNumero(d.numParcelas) ?? 1, d.primeiraParcela || hoje(), lerNumero(d.intervaloDias) ?? 30, d.formaPagamentoId))}><Icone nome="atualizar" size={14} /> Gerar parcelas</button>
            </>
          )}
        </div>
        {d.condicao === "PARCELADO" && d.parcelas.length > 0 && (
          <table className="tabela mt-3">
            <thead><tr><th className="w-12">Nº</th><th className="w-44">Vencimento</th><th className="w-36 text-right">Valor</th><th className="w-56">Forma de pagamento</th><th>Observação</th></tr></thead>
            <tbody>{d.parcelas.map((p, i) => {
              const up = (m: Partial<typeof p>) => set("parcelas", d.parcelas.map((x, j) => (j === i ? { ...x, ...m } : x)));
              return (
                <tr key={i}><td>{i + 1}</td>
                  <td><input type="date" className="campo" value={p.vencimento} onChange={(e) => up({ vencimento: e.target.value })} /></td>
                  <td><input className="campo text-right" value={p.valor} onChange={(e) => up({ valor: e.target.value })} /></td>
                  <td><select className="campo" value={p.formaPagamentoId} onChange={(e) => up({ formaPagamentoId: e.target.value })}><option value="">—</option>{op.formas.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></td>
                  <td><input className="campo" value={p.observacao} onChange={(e) => up({ observacao: e.target.value })} /></td></tr>
              );
            })}</tbody>
            <tfoot><tr><td colSpan={2} className="text-right text-[12px]">Soma das parcelas</td><td className={`text-right font-semibold ${Math.abs(d.parcelas.reduce((s, p) => s + (lerNumero(p.valor) ?? 0), 0) - tot.total) > 0.009 ? "text-red-600" : ""}`}>{n2(d.parcelas.reduce((s, p) => s + (lerNumero(p.valor) ?? 0), 0))}</td><td colSpan={2}></td></tr></tfoot>
          </table>
        )}
      </Bloco>

      <Bloco icone="notas" titulo={<>Insira as informações de <b>observação e anexos</b></>}>
        <div className="grid gap-3 lg:grid-cols-2">
          <Campo rotulo="Observações"><textarea rows={3} className="campo" value={d.observacoes} onChange={(e) => set("observacoes", e.target.value)} /><span className="text-[11px] text-slate-500">Sai na impressão.</span></Campo>
          <Campo rotulo="Observações internas"><textarea rows={3} className="campo" value={d.observacaoInterna} onChange={(e) => set("observacaoInterna", e.target.value)} /><span className="text-[11px] text-slate-500">Uso interno, não sai na impressão.</span></Campo>
        </div>
        {inicial.anexos.length > 0 && <div className="mt-3 flex flex-wrap gap-2 text-[12px]">{inicial.anexos.map((a) => <a key={a.id} href={`/api/cadastros/anexo/${a.id}`} className="rounded border px-2 py-1 text-marca hover:underline"><Icone nome="anexos" size={12} className="inline" /> {a.nome}</a>)}</div>}
        <label className="btn-sec relative mt-3 cursor-pointer"><Icone nome="anexos" size={14} /> Adicionar anexo<input type="file" name="anexos" multiple className="absolute inset-0 cursor-pointer opacity-0" /></label>
        <span className="ml-2 text-[11px] text-slate-500">Até 10 arquivos de 5 MB.</span>
      </Bloco>


      <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-2px_6px_rgba(0,0,0,0.04)] md:-mx-5 md:px-5">
        {estado && !estado.ok && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-[13px] text-red-700">{estado.mensagem}</div>}
        <div className="flex items-center gap-3">
          <span className="text-[13px]">Valor total <b className="text-[16px]">{brl(tot.total)}</b></span>
          <Link href={d.id ? `/compras/${d.id}` : base} className="btn-sec ml-auto">Cancelar</Link>
          <button className="btn px-5" disabled={pendente}>{pendente ? "Salvando…" : d.id ? "Salvar" : "Cadastrar"}</button>
        </div>
      </div>
    </form>
  );
}
