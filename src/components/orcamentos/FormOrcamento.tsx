"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import Link from "next/link";
import { useEffect, useState } from "react";
import Icone from "@/components/Icone";
import { Bloco, Campo } from "@/components/ui/Pagina";
import Busca from "@/components/ui/Busca";
import DicaSaldo from "@/components/estoque/DicaSaldo";
import LinhaItemBusca, { fundoEstoque } from "@/components/itens/LinhaItemBusca";
import type { SituacaoEstoque } from "@/lib/itens/estoqueSituacao";
import LinhaPessoaBusca from "@/components/cadastros/LinhaPessoaBusca";
import GerenciarColunas from "@/components/ui/GerenciarColunas";
import type { PessoaBusca } from "@/lib/cadastros/tipos";
import { LinhaToggle } from "@/components/itens/AbasVerticais";
import CotarFrete from "@/components/frete/CotarFrete";
import { salvarOrcamentoForm, type Resultado } from "@/lib/orcamentos/acoes";
import { salvarPedidoForm } from "@/lib/vendas/acoes";
import { salvarOsForm } from "@/lib/os/acoes";
import { CAMPOS_OS, DURACOES_AGENDA, PRIORIDADES, equipamentoVazio, totaisOs, type DadosOs, type EquipamentoForm } from "@/lib/os/tipos";
import { BANDEIRAS, calcularTaxa, maxVezes, pct, temTabela, tipoCartao } from "@/lib/financeiro/taxasCartao";
import { CAMPOS_DADOS, CAMPOS_VENDA, COLUNAS_ITENS, gerarParcelas, lerNumero, subtotalProduto, subtotalServico, totais, type DadosOrcamento, type LinhaProduto, type LinhaServico } from "@/lib/orcamentos/tipos";

export type InicialOrcamento = DadosOrcamento & Partial<Omit<DadosOs, keyof DadosOrcamento>> & { id?: string; proximoNumero: number; anexos: { id: string; nome: string }[] };
type Opcoes = {
  vendedores: { id: string; nome: string }[]; situacoes: { id: string; nome: string }[]; formas: FormaOp[];
  tiposValor: { id: string; nome: string; padrao: boolean }[]; campos: { id: string; nome: string }[]; centros: string[]; canais: string[];
  tecnicos?: { id: string; nome: string }[];
  /** equipes de técnicos (só OS) */
  equipes?: { id: string; nome: string }[];
  /** só OS: carros das equipes, para marcar o item que sai do carro */
  carros?: { equipeId: string; localId: string; nome: string }[];
  /** frete pelo Melhor Envio ligado: mostra "Cotar frete" no transporte */
  freteMelhorEnvio?: boolean;
  /** só OS, com mais de uma empresa: quem fatura os serviços (a primeira é a empresa da OS) */
  empresas?: { id: string; nome: string }[];
};

/** forma de pagamento com o que precisa para calcular a taxa do cartão */
type FormaOp = { id: string; nome: string; tPag?: string; taxa?: number; taxas?: unknown };

const ehCartao = (f?: FormaOp) => (f && tipoCartao(f.tPag) && temTabela(f.taxas) ? tipoCartao(f.tPag) : null);

/** Cartão (venda/OS): bandeira e vezes; mostra a taxa, o líquido e quando cai. */
function CartaoTaxa({ forma, valor, bandeira, vezes, onChange, compacto }: {
  forma?: FormaOp; valor: number; bandeira: string; vezes: string; onChange: (m: { bandeira?: string; vezes?: string }) => void; compacto?: boolean;
}) {
  const tipo = ehCartao(forma);
  if (!forma || (!tipo && !((forma.taxa ?? 0) > 0))) return null;
  const calc = calcularTaxa({ tPag: forma.tPag ?? "", taxa: forma.taxa ?? 0, taxas: forma.taxas }, valor, bandeira, Number(vezes) || 1);
  const max = maxVezes(forma.taxas, bandeira);
  const resumo = calc.taxa > 0 && (
    <span className="text-[11px] text-slate-500">Taxa {pct(calc.percentual)} = {brl(calc.taxa)} · líquido <b>{brl(calc.liquido)}</b>{calc.prazoDias !== null && ` · cai ${calc.prazoDias === 0 ? "na hora" : `${calc.prazoDias} dias depois`}`}</span>
  );
  const selBandeira = tipo && (
    <select className="campo" value={bandeira} onChange={(e) => onChange({ bandeira: e.target.value, vezes: String(Math.min(Number(vezes) || 1, maxVezes(forma.taxas, e.target.value))) })} title="Bandeira do cartão">
      <option value="">{compacto ? "Bandeira" : "Selecione"}</option>{BANDEIRAS.map((b) => <option key={b} value={b}>{b}</option>)}
    </select>
  );
  const selVezes = tipo === "CREDITO" && (
    <select className="campo" value={String(Math.min(Number(vezes) || 1, max))} onChange={(e) => onChange({ vezes: e.target.value })} title="Vezes no cartão">
      {Array.from({ length: max }, (_, k) => <option key={k} value={k + 1}>{k + 1}x</option>)}
    </select>
  );
  if (compacto) return <div className="space-y-1"><div className="flex gap-1">{selBandeira}{selVezes}</div>{resumo}</div>;
  return (
    <>
      {selBandeira && <Campo rotulo="Bandeira">{selBandeira}</Campo>}
      {selVezes && <Campo rotulo="Vezes no cartão">{selVezes}</Campo>}
      {resumo && <div className="self-center sm:col-span-2 lg:col-span-2">{resumo}</div>}
    </>
  );
}

type ProdutoBusca = { id: string; codigo: string; nome: string; unidade: string; preco: number; disponivel: number | null; fisicoCarros?: number | null; situacao?: SituacaoEstoque; minimo?: number; valores: { tipoValorId: string; valor: number }[] };
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

export default function FormOrcamento({ inicial, op, vis, modo = "orcamento" }: { inicial: InicialOrcamento; op: Opcoes; vis: { dados: string[]; itens: string[] }; modo?: "orcamento" | "venda" | "os" }) {
  const os = modo === "os";
  // a OS segue as regras da venda (situação obrigatória, pagamento sempre), com blocos próprios
  const venda = modo === "venda" || os;
  const doc = os ? "da ordem de serviço" : venda ? "da venda" : "do orçamento";
  const neste = os ? "nesta OS" : venda ? "nesta venda" : "neste orçamento";
  const base = os ? "/os" : venda ? "/vendas" : "/orcamentos";
  const raiz = os ? "/os" : venda ? "/vendas" : "/orcamentos";
  const [d, setD] = useState(inicial);
  const [editNumero, setEditNumero] = useState(false);
  const [enderecos, setEnderecos] = useState<{ id: string; texto: string }[]>([]);
  const [estado, , pendente, formAcao] = useFormAcao<Resultado>(os ? salvarOsForm : venda ? salvarPedidoForm : salvarOrcamentoForm, null);
  const set = <K extends keyof InicialOrcamento>(k: K, v: InicialOrcamento[K]) => setD((x) => ({ ...x, [k]: v }));
  const tot = os ? totaisOs({ ...d, outros: d.outros ?? "" }) : { ...totais(d), outros: 0 };
  const ve = (c: string) => vis.dados.includes(c);
  const vi = (c: string) => vis.itens.includes(c);
  const padrao = op.tiposValor.find((t) => t.padrao)?.id ?? op.tiposValor[0]?.id ?? "";

  useEffect(() => {
    if (!d.mostrarEntrega || !d.clienteId) return;
    fetch(`/api/pessoas/enderecos?pessoa=${d.clienteId}`).then((r) => r.json()).then(setEnderecos).catch(() => setEnderecos([]));
  }, [d.mostrarEntrega, d.clienteId]);

  const setProd = (i: number, m: Partial<LinhaProduto>) => set("produtos", d.produtos.map((l, j) => (j === i ? { ...l, ...m } : l)));
  const setServ = (i: number, m: Partial<LinhaServico>) => set("servicos", d.servicos.map((l, j) => (j === i ? { ...l, ...m } : l)));
  const novoProduto = (): LinhaProduto => ({ produtoId: "", nome: "", codigo: "", unidade: "", detalhes: "", quantidade: "1", tipoValorId: padrao, valorUnit: "0,00", desconto: "", descontoPct: false });
  const novoServico = (): LinhaServico => ({ servicoId: "", nome: "", codigo: "", detalhes: "", quantidade: "1", valorUnit: "0,00", desconto: "", descontoPct: false });

  // de onde sai cada peça: a loja (padrão) ou o carro de uma equipe; o carro da equipe da OS vem primeiro
  const carrosDaOs = (op.carros ?? []).filter((c) => c.equipeId === d.equipeId);
  const outrosCarros = (op.carros ?? []).filter((c) => c.equipeId !== d.equipeId);

  const blocoProdutos = (
    <Bloco key="p" icone="produtos" titulo={os ? <>Adicione os <b>produtos e peças</b> {doc}</> : <>Adicione os <b>produtos</b> {doc}</>} subtitulo="Produto, quantidade, valor e desconto por linha." corpo="p-0"
      acoes={<GerenciarColunas lista={os ? "os-itens" : venda ? "venda-itens" : "orcamento-itens"} colunas={COLUNAS_ITENS} visiveis={vis.itens} titulo="Gerenciar colunas" classe="btn-icone" />}>
      <div className="overflow-x-auto">
        <table className="tabela">
          <thead><tr>
            <th className="min-w-72">Produto *</th>{vi("detalhes") && <th className="min-w-40">Detalhes</th>}<th className="w-24 text-right">Quant. *</th>
            <th className="w-32">Tipo *</th><th className="w-28 text-right">Valor *</th>{vi("desconto") && <th className="w-32">Desconto</th>}<th className="w-28 text-right">Subtotal</th><th className="w-12"></th>
          </tr></thead>
          <tbody>
            {d.produtos.map((l, i) => (
              <tr key={i}>
                <td>
                  {l.avulso ? (
                    <div>
                      <input className="campo" placeholder="Descrição do item avulso" autoFocus={!l.id && !l.nome} value={l.nome} onChange={(e) => setProd(i, { nome: e.target.value })} />
                      <span className="text-[11px] text-slate-500">Item avulso: sem cadastro e sem estoque</span>
                    </div>
                  ) : l.produtoId ? (
                    <div className="text-[13px]"><span className="font-mono text-[11px] text-slate-500">{l.codigo}</span> {l.nome}
                      {l.disponivel != null && <span className={`block text-[11px] ${l.disponivel < (lerNumero(l.quantidade) ?? 0) ? "text-red-600" : "text-slate-500"}`}>Disponível: {l.disponivel.toLocaleString("pt-BR")} {l.unidade}{l.nosCarros ? <span className="text-sky-700"> · {l.nosCarros.toLocaleString("pt-BR")} nos carros</span> : null}</span>}
                      {os && (op.carros ?? []).length > 0 && (
                        <label className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">Sai de
                          <select className={`rounded border px-1 py-0.5 text-[11px] ${l.localOrigemId ? "border-marca bg-teal-50 text-marca-escura" : "border-slate-300"}`} value={l.localOrigemId ?? ""} onChange={(e) => setProd(i, { localOrigemId: e.target.value })}>
                            <option value="">Loja</option>
                            {carrosDaOs.map((c) => <option key={c.localId} value={c.localId}>{c.nome} (equipe da OS)</option>)}
                            {outrosCarros.length > 0 && <optgroup label="Outros carros">{outrosCarros.map((c) => <option key={c.localId} value={c.localId}>{c.nome}</option>)}</optgroup>}
                          </select>
                        </label>
                      )}</div>
                  ) : (
                    <Busca<ProdutoBusca> url={(q) => `/api/itens/busca?tipo=produto&q=${encodeURIComponent(q)}`} valor={null} rotulo={(p) => p.nome} autoFocus larguraMin={560} classeLinha={(p) => fundoEstoque(p.situacao)}
                      linha={(p) => <LinhaItemBusca codigo={p.codigo} nome={p.nome} unidade={p.unidade} valor={p.valores.find((v) => v.tipoValorId === padrao)?.valor ?? p.preco} disponivel={p.disponivel} situacao={p.situacao} minimo={p.minimo} nosCarros={p.fisicoCarros} />}
                      onEscolher={(p) => p && setProd(i, { produtoId: p.id, nome: p.nome, codigo: p.codigo, unidade: p.unidade, valores: p.valores, disponivel: p.disponivel, nosCarros: p.fisicoCarros, tipoValorId: padrao,
                        valorUnit: n2(p.valores.find((v) => v.tipoValorId === padrao)?.valor ?? p.preco) })} />
                  )}
                </td>
                {vi("detalhes") && <td><input className="campo" value={l.detalhes} onChange={(e) => setProd(i, { detalhes: e.target.value })} /></td>}
                <td><DicaSaldo produtoId={(!l.avulso && l.produtoId) || undefined}><input className="campo text-right" value={l.quantidade} onChange={(e) => setProd(i, { quantidade: e.target.value })} /></DicaSaldo></td>
                <td>
                  <select className="campo" value={l.tipoValorId} onChange={(e) => {
                    const v = l.valores?.find((x) => x.tipoValorId === e.target.value);
                    setProd(i, { tipoValorId: e.target.value, ...(v ? { valorUnit: n2(v.valor) } : {}) });
                  }}>{op.tiposValor.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}</select>
                </td>
                <td><input className="campo text-right" value={l.valorUnit} onChange={(e) => setProd(i, { valorUnit: e.target.value })} /></td>
                {vi("desconto") && <td><Desconto valor={l.desconto} pct={l.descontoPct} onValor={(v) => setProd(i, { desconto: v })} onPct={(v) => setProd(i, { descontoPct: v })} /></td>}
                <td className="text-right font-semibold">{n2(subtotalProduto(l))}</td>
                <td><button type="button" className="btn-icone text-red-600" title="Remover" onClick={() => set("produtos", d.produtos.filter((_, j) => j !== i))}><Icone nome="excluir" size={13} /></button></td>
              </tr>
            ))}
            {!d.produtos.length && <tr><td colSpan={8} className="py-6 text-center text-slate-500">Nenhum produto {neste}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2 p-3"><button type="button" className="btn-sec" onClick={() => set("produtos", [...d.produtos, novoProduto()])}><Icone nome="mais" size={14} /> Adicionar produto</button>
        {!os && <button type="button" className="btn-sec" title="Item digitado na hora, sem cadastro de produto e sem movimentar estoque" onClick={() => set("produtos", [...d.produtos, { ...novoProduto(), avulso: true, unidade: "UN" }])}><Icone nome="mais" size={14} /> Adicionar item avulso</button>}</div>
    </Bloco>
  );

  const blocoServicos = (
    <Bloco key="s" icone="servicos" titulo={os ? <>Adicione os <b>serviços e mão de obra</b> {doc}</> : <>Adicione os <b>serviços</b> {doc}</>} subtitulo="Serviço, quantidade, valor e desconto por linha." corpo="p-0">
      <div className="overflow-x-auto">
        <table className="tabela">
          <thead><tr>
            <th className="min-w-72">Serviço *</th>{vi("detalhes") && <th className="min-w-40">Detalhes</th>}<th className="w-24 text-right">Quant. *</th>
            <th className="w-28 text-right">Valor *</th>{vi("desconto") && <th className="w-32">Desconto</th>}<th className="w-28 text-right">Subtotal</th><th className="w-12"></th>
          </tr></thead>
          <tbody>
            {d.servicos.map((l, i) => (
              <tr key={i}>
                <td>
                  {l.servicoId ? <div className="text-[13px]"><span className="font-mono text-[11px] text-slate-500">{l.codigo}</span> {l.nome}</div> : (
                    <Busca<ServicoBusca> url={(q) => `/api/itens/busca?tipo=servico&q=${encodeURIComponent(q)}`} valor={null} rotulo={(p) => p.nome} autoFocus larguraMin={480}
                      linha={(p) => <LinhaItemBusca codigo={p.codigo} nome={p.nome} valor={p.preco} />}
                      onEscolher={(p) => p && setServ(i, { servicoId: p.id, nome: p.nome, codigo: p.codigo, valorUnit: n2(p.preco) })} />
                  )}
                </td>
                {vi("detalhes") && <td><input className="campo" value={l.detalhes} onChange={(e) => setServ(i, { detalhes: e.target.value })} /></td>}
                <td><input className="campo text-right" value={l.quantidade} onChange={(e) => setServ(i, { quantidade: e.target.value })} /></td>
                <td><input className="campo text-right" value={l.valorUnit} onChange={(e) => setServ(i, { valorUnit: e.target.value })} /></td>
                {vi("desconto") && <td><Desconto valor={l.desconto} pct={l.descontoPct} onValor={(v) => setServ(i, { desconto: v })} onPct={(v) => setServ(i, { descontoPct: v })} /></td>}
                <td className="text-right font-semibold">{n2(subtotalServico(l))}</td>
                <td><button type="button" className="btn-icone text-red-600" title="Remover" onClick={() => set("servicos", d.servicos.filter((_, j) => j !== i))}><Icone nome="excluir" size={13} /></button></td>
              </tr>
            ))}
            {!d.servicos.length && <tr><td colSpan={7} className="py-6 text-center text-slate-500">Nenhum serviço {neste}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="p-3"><button type="button" className="btn-sec" onClick={() => set("servicos", [...d.servicos, novoServico()])}><Icone nome="mais" size={14} /> Adicionar serviço</button></div>
    </Bloco>
  );

  return (
    <form {...formAcao}>
      <input type="hidden" name="dados" value={JSON.stringify({ ...d, anexos: undefined, proximoNumero: undefined })} />

      <Bloco icone="editar" titulo={<>Informe os <b>dados</b> {doc}</>} subtitulo={os ? "Número, cliente, situação, entrada e saída, canal e prioridade." : venda ? "Número, cliente, situação, vendedor e datas." : "Número, cliente, vendedor, datas e a introdução da proposta."}
        acoes={<GerenciarColunas lista={os ? "os-campos" : venda ? "venda-campos" : "orcamento-campos"} colunas={os ? CAMPOS_OS : venda ? CAMPOS_VENDA : CAMPOS_DADOS} visiveis={vis.dados} titulo="Gerenciar campos" classe="btn-icone" />}>
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {ve("numero") && (
            <div><span className="rotulo">Número</span>
              <div className="flex"><input className="campo rounded-r-none disabled:bg-slate-100 disabled:text-slate-500" disabled={!editNumero} value={editNumero ? d.numero : d.numero || String(inicial.proximoNumero)} onChange={(e) => set("numero", e.target.value.replace(/\D/g, ""))} />
                <button type="button" className="rounded-r border border-l-0 border-slate-300 px-2" title="Editar número" onClick={() => { setEditNumero(true); if (!d.numero) set("numero", String(inicial.proximoNumero)); }}><Icone nome="editar" size={13} /></button></div>
            </div>
          )}
          <div className={ve("numero") ? "lg:col-span-1" : "lg:col-span-2"}>
            <span className="rotulo obrig">Cliente</span>
            <Busca<PessoaBusca> url={(q) => `/api/pessoas?papel=cliente&q=${encodeURIComponent(q)}`}
              valor={d.clienteId ? { id: d.clienteId, nome: d.clienteNome } : null} rotulo={(p) => p.nome}
              linha={(p) => <LinhaPessoaBusca p={p} />}
              onEscolher={(p) => setD((x) => ({ ...x, clienteId: p?.id ?? "", clienteNome: p?.nome ?? "", enderecoEntregaId: "" }))} />
            <Link href="/clientes/adicionar" target="_blank" className="text-[11px] text-marca hover:underline">+ Adicionar novo</Link>
          </div>
          {os && <Campo rotulo="Situação" obrigatorio><select className="campo" value={d.situacaoId} onChange={(e) => set("situacaoId", e.target.value)}>{op.situacoes.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></Campo>}
          {os ? (
            <>
              <Campo rotulo="Entrada" obrigatorio><input type="datetime-local" className="campo" required value={d.entrada ?? ""} onChange={(e) => set("entrada", e.target.value)} /></Campo>
              {ve("saida") && <Campo rotulo="Saída"><input type="datetime-local" className="campo" value={d.saida ?? ""} onChange={(e) => set("saida", e.target.value)} /></Campo>}
            </>
          ) : <Campo rotulo="Data" obrigatorio><input type="date" className="campo" required value={d.data} onChange={(e) => set("data", e.target.value)} /></Campo>}
          {!venda && ve("validade") && <Campo rotulo="Validade"><input className="campo" placeholder="Ex.: 10 dias" value={d.validade} onChange={(e) => set("validade", e.target.value)} /></Campo>}
          {!os && ve("vendedor") && <Campo rotulo="Vendedor"><select className="campo" value={d.vendedorId} onChange={(e) => set("vendedorId", e.target.value)}><option value="">Selecione</option>{op.vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}</select></Campo>}
          {!os && ve("prazo") && <Campo rotulo="Prazo de entrega"><input type="date" className="campo" value={d.prazoEntrega} onChange={(e) => set("prazoEntrega", e.target.value)} /></Campo>}
          {!venda && ve("cuidados") && <Campo rotulo="Aos cuidados de"><input className="campo" value={d.aosCuidados} onChange={(e) => set("aosCuidados", e.target.value)} /></Campo>}
          {ve("canal") && <Campo rotulo="Canal de venda" obrigatorio><select className="campo" value={d.canal} onChange={(e) => set("canal", e.target.value)}>{op.canais.map((c) => <option key={c}>{c}</option>)}</select></Campo>}
          {ve("centro") && <Campo rotulo="Centro de custo"><input className="campo" list="centros" value={d.centroCusto} onChange={(e) => set("centroCusto", e.target.value)} /><datalist id="centros">{op.centros.map((c) => <option key={c} value={c} />)}</datalist></Campo>}
          {os && ve("prioridade") && <Campo rotulo="Prioridade"><select className="campo" value={d.prioridade ?? ""} onChange={(e) => set("prioridade", e.target.value)}><option value="">Selecione</option>{PRIORIDADES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></Campo>}
          {!os && (venda || d.id) && <Campo rotulo="Situação" obrigatorio={venda}><select className="campo" value={d.situacaoId} onChange={(e) => set("situacaoId", e.target.value)}>{op.situacoes.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></Campo>}
          {!venda && ve("introducao") && <Campo rotulo="Introdução da proposta" className="sm:col-span-2 lg:col-span-4"><textarea rows={3} className="campo" placeholder="Texto que abre a proposta enviada ao cliente. Deixe em branco para não usar." value={d.introducao} onChange={(e) => set("introducao", e.target.value)} /></Campo>}
          {op.campos.map((c) => <Campo key={c.id} rotulo={c.nome}><input className="campo" value={d.camposExtras[c.id] ?? ""} onChange={(e) => set("camposExtras", { ...d.camposExtras, [c.id]: e.target.value })} /></Campo>)}
        </div>
      </Bloco>

      {os && (
        <Bloco icone="pessoa" titulo={<>Defina os <b>responsáveis</b> pela ordem de serviço</>} subtitulo="A equipe é o carro (sempre os mesmos técnicos): as peças do carro saem do estoque dela. Técnico adicional é só para constar quem foi junto. O agendamento aparece na Agenda das equipes e no Google Agenda da equipe.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo rotulo="Vendedor"><select className="campo" value={d.vendedorId} onChange={(e) => set("vendedorId", e.target.value)}><option value="">Selecione</option>{op.vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}</select></Campo>
            <Campo rotulo="Agendado para"><input type="datetime-local" className="campo" value={d.agendaInicio ?? ""} onChange={(e) => set("agendaInicio", e.target.value)} /></Campo>
            {d.agendaInicio && <Campo rotulo="Duração"><select className="campo" value={d.agendaDuracao ?? ""} onChange={(e) => set("agendaDuracao", e.target.value)}><option value="">Padrão</option>{DURACOES_AGENDA.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></Campo>}
            {!!op.equipes?.length && <Campo rotulo="Equipe (carro)"><select className="campo" value={d.equipeId ?? ""} onChange={(e) => set("equipeId", e.target.value)}><option value="">Nenhuma</option>{op.equipes.map((q) => <option key={q.id} value={q.id}>{q.nome}{op.carros?.some((c) => c.equipeId === q.id) ? " (com carro)" : ""}</option>)}</select></Campo>}
            {(d.tecnicoIds?.length ? d.tecnicoIds : [""]).map((tid, i, arr) => (
              <div key={i}><span className="rotulo">{d.equipeId ? "Técnico adicional" : "Técnico"}{arr.length > 1 ? ` ${i + 1}` : ""}</span>
                <div className="flex gap-1">
                  <select className="campo" value={tid} onChange={(e) => set("tecnicoIds", arr.map((x, j) => (j === i ? e.target.value : x)))}><option value="">{d.equipeId ? "Nenhum" : "Selecione"}</option>{(op.tecnicos ?? op.vendedores).map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}</select>
                  {arr.length > 1 && <button type="button" className="btn-icone text-red-600" title="Remover técnico" onClick={() => set("tecnicoIds", arr.filter((_, j) => j !== i))}><Icone nome="excluir" size={13} /></button>}
                </div></div>
            ))}
          </div>
          <button type="button" className="btn-sec mt-3" onClick={() => set("tecnicoIds", [...(d.tecnicoIds?.length ? d.tecnicoIds : [""]), ""])}><Icone nome="mais" size={14} /> {d.equipeId ? "Adicionar técnico adicional" : "Adicionar técnico"}</button>
        </Bloco>
      )}

      {os && (
        <Bloco icone="os" titulo={<>Descreva os <b>equipamentos</b> da ordem de serviço</>} subtitulo="Equipamento, marca, modelo, série, defeitos, solução e laudo.">
          {(d.equipamentos ?? []).map((e, i) => {
            const up = (m: Partial<EquipamentoForm>) => set("equipamentos", (d.equipamentos ?? []).map((x, j) => (j === i ? { ...x, ...m } : x)));
            const texto = (k: keyof EquipamentoForm, r: string) => <Campo rotulo={r}><textarea rows={2} className="campo" value={e[k]} onChange={(ev) => up({ [k]: ev.target.value })} /></Campo>;
            return (
              <div key={i} className="mb-3 rounded border border-slate-200 p-3">
                <div className="mb-2 flex items-center"><b className="text-[12px] tracking-wide text-slate-500 uppercase">Equipamento {i + 1}</b>
                  <button type="button" className="btn-icone ml-auto text-red-600" title="Remover equipamento" onClick={() => set("equipamentos", (d.equipamentos ?? []).filter((_, j) => j !== i))}><Icone nome="excluir" size={13} /></button></div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Campo rotulo="Equipamento" obrigatorio><input className="campo" value={e.equipamento} onChange={(ev) => up({ equipamento: ev.target.value })} placeholder="Ex.: Notebook" /></Campo>
                  <Campo rotulo="Marca"><input className="campo" value={e.marca} onChange={(ev) => up({ marca: ev.target.value })} /></Campo>
                  <Campo rotulo="Modelo"><input className="campo" value={e.modelo} onChange={(ev) => up({ modelo: ev.target.value })} /></Campo>
                  <Campo rotulo="Série"><input className="campo" value={e.serie} onChange={(ev) => up({ serie: ev.target.value })} /></Campo>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {texto("condicoes", "Condições")}{texto("defeitos", "Defeitos")}{texto("acessorios", "Acessórios")}{texto("solucao", "Solução")}{texto("laudo", "Laudo")}{texto("garantia", "Termos de garantia")}
                </div>
              </div>
            );
          })}
          {!(d.equipamentos ?? []).length && <p className="mb-3 text-[13px] text-slate-500">Nenhum equipamento nesta OS.</p>}
          <button type="button" className="btn-sec" onClick={() => set("equipamentos", [...(d.equipamentos ?? []), equipamentoVazio(inicial.equipamentos?.[0]?.garantia ?? "")])}><Icone nome="mais" size={14} /> Adicionar equipamento</button>
        </Bloco>
      )}

      {[blocoProdutos, blocoServicos]}

      <Bloco icone="frete" titulo={os ? <>Informe a <b>entrega</b> {doc}</> : <>Informe o <b>transporte</b> {doc}</>}>
        {!os && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2"><span className="rotulo">Transportadora</span>
            <Busca<PessoaBusca> url={(q) => `/api/pessoas?papel=transportadora&q=${encodeURIComponent(q)}`}
              valor={d.transportadoraId ? { id: d.transportadoraId, nome: d.transportadoraNome } : null} rotulo={(p) => p.nome} linha={(p) => <LinhaPessoaBusca p={p} />}
              onEscolher={(p) => setD((x) => ({ ...x, transportadoraId: p?.id ?? "", transportadoraNome: p?.nome ?? "" }))} /></div>
          <Campo rotulo="Valor do frete (R$)"><input className="campo text-right" value={d.frete} onChange={(e) => setD((x) => ({ ...x, frete: e.target.value, freteServicoId: "", freteServicoNome: "", fretePrazoDias: "" }))} /></Campo>
          {op.freteMelhorEnvio && <div className="flex items-end"><CotarFrete clienteId={d.clienteId} enderecoEntregaId={d.mostrarEntrega ? d.enderecoEntregaId : ""} escolhido={d.freteServicoId ? Number(d.freteServicoId) : null}
            itens={d.produtos.filter((l) => l.produtoId && !l.avulso).map((l) => ({ produtoId: l.produtoId, quantidade: lerNumero(l.quantidade) ?? 0, valor: subtotalProduto(l) }))}
            onEscolher={(c) => setD((x) => ({ ...x, frete: n2(c.valor), freteServicoId: String(c.servicoId), freteServicoNome: `${c.transportadora} ${c.servico}`.trim(), fretePrazoDias: c.prazoDias != null ? String(c.prazoDias) : "" }))} /></div>}
        </div>}
        {!os && d.freteServicoNome && <p className="mt-2 text-[12px] text-slate-600"><Icone nome="frete" size={12} /> Frete escolhido: <b>{d.freteServicoNome}</b>{d.fretePrazoDias ? ` · entrega em até ${d.fretePrazoDias} dias úteis` : ""} (Melhor Envio)</p>}
        <div className={os ? "max-w-xl" : "mt-3 max-w-xl"}><LinhaToggle titulo="Informar endereço de entrega" texto="Mostra o endereço de entrega no pedido." ligado={d.mostrarEntrega} onChange={(v) => set("mostrarEntrega", v)} /></div>
        {d.mostrarEntrega && (
          <div className="mt-3 max-w-xl">
            {d.clienteId ? (
              <select className="campo" value={d.enderecoEntregaId} onChange={(e) => set("enderecoEntregaId", e.target.value)}>
                <option value="">Endereço principal do cliente</option>{enderecos.map((e) => <option key={e.id} value={e.id}>{e.texto}</option>)}
              </select>
            ) : <p className="text-[12px] text-slate-500">Escolha o cliente para ver os endereços dele.</p>}
          </div>
        )}
      </Bloco>

      <Bloco icone="caixa" titulo={<>Confira o <b>total</b> {doc}</>}>
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {os ? (
            <>
              <Campo rotulo="Mão de obra (R$)"><input className="campo text-right" readOnly value={n2(tot.servicos)} /></Campo>
              <Campo rotulo="Peças (R$)"><input className="campo text-right" readOnly value={n2(tot.produtos)} /></Campo>
              <Campo rotulo="Frete (R$)"><input className="campo text-right" value={d.frete} onChange={(e) => set("frete", e.target.value)} /></Campo>
              <Campo rotulo="Outros (R$)"><input className="campo text-right" value={d.outros ?? ""} onChange={(e) => set("outros", e.target.value)} /></Campo>
            </>
          ) : (
            <>
              <Campo rotulo="Produtos (R$)"><input className="campo text-right" readOnly value={n2(tot.produtos)} /></Campo>
              <Campo rotulo="Serviços (R$)"><input className="campo text-right" readOnly value={n2(tot.servicos)} /></Campo>
            </>
          )}
          <div><span className="rotulo">Desconto</span><Desconto valor={d.desconto} pct={d.descontoPct} onValor={(v) => set("desconto", v)} onPct={(v) => set("descontoPct", v)} />
            {d.descontoPct && tot.desconto > 0 && <span className="text-[11px] text-slate-500">= {brl(tot.desconto)}</span>}</div>
          <Campo rotulo="Valor total (R$)" obrigatorio><input className="campo text-right text-[15px] font-semibold" readOnly value={n2(tot.total)} /></Campo>
        </div>
        {(!venda || os) && <div className="mt-3 max-w-xl"><LinhaToggle titulo="Exibir valor total na impressão" texto="Desligado, a impressão sai sem o valor total." ligado={d.exibirTotal} onChange={(v) => set("exibirTotal", v)} /></div>}
      </Bloco>

      <Bloco icone="dinheiro" titulo={<>Defina o <b>pagamento</b> {doc}</>}>
        {!venda && <label className="mb-3 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={d.gerarCondicoes} onChange={(e) => set("gerarCondicoes", e.target.checked)} /> <b>Gerar condições de pagamento</b> <span className="text-slate-500">Desmarque para salvar sem parcelas.</span></label>}
        {os && (op.empresas?.length ?? 0) > 1 && d.servicos.some((l) => l.servicoId) && (() => {
          const empOs = op.empresas![0];
          const escolhida = op.empresas!.find((e) => e.id === d.empresaServicosId && e.id !== empOs.id);
          const servLiq = Math.max(0, tot.servicos - (tot.produtos + tot.servicos > 0 ? (tot.desconto * Math.max(0, tot.servicos)) / (Math.max(0, tot.produtos) + Math.max(0, tot.servicos)) : 0));
          return (
            <div className="mb-3 grid items-end gap-3 rounded border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(0,18rem)_1fr]">
              <Campo rotulo="Faturar os serviços por">
                <select className="campo" value={escolhida?.id ?? ""} onChange={(e) => set("empresaServicosId", e.target.value)}>
                  <option value="">{empOs.nome} (a mesma da OS)</option>
                  {op.empresas!.slice(1).map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </Campo>
              <p className="text-[12px] text-slate-600">{escolhida
                ? <>Os serviços (<b>{brl(servLiq)}</b>) saem com NFS-e e conta a receber/boleto da <b>{escolhida.nome}</b>; as peças, frete e outros (<b>{brl(Math.max(0, tot.total - servLiq))}</b>) seguem com NF-e e cobrança da <b>{empOs.nome}</b>. Cada parcela abaixo é dividida entre as duas na mesma proporção.</>
                : <>Peças e serviços são faturados e cobrados pela {empOs.nome}.</>}</p>
            </div>
          );
        })()}
        {(venda || d.gerarCondicoes) && (
          <>
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              {([["AVISTA", "À vista", "Um pagamento só, no vencimento"], ["PARCELADO", "Parcelado", "Divide o total em várias parcelas"]] as const).map(([v, t, s]) => (
                <label key={v} className={`flex cursor-pointer items-center gap-3 rounded border p-3 ${d.condicao === v ? "border-marca bg-marca/5" : "border-slate-200"}`}>
                  <input type="radio" checked={d.condicao === v} onChange={() => set("condicao", v)} />
                  <span><b className="block text-[13px]">{t}</b><span className="text-[11px] text-slate-500">{s}</span></span>
                </label>
              ))}
            </div>
            <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Campo rotulo="Forma de pagamento"><select className="campo" value={d.formaPagamentoId} onChange={(e) => set("formaPagamentoId", e.target.value)}><option value="">Selecione</option>{op.formas.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></Campo>
              {d.condicao === "AVISTA" ? (
                <>
                  <Campo rotulo="Vencimento"><input type="date" className="campo" value={d.vencimento} onChange={(e) => set("vencimento", e.target.value)} /></Campo>
                  {venda && <CartaoTaxa forma={op.formas.find((f) => f.id === d.formaPagamentoId)} valor={tot.total} bandeira={d.bandeira ?? ""} vezes={d.vezes ?? "1"}
                    onChange={(m) => { if (m.bandeira !== undefined) set("bandeira", m.bandeira); if (m.vezes !== undefined) set("vezes", m.vezes); }} />}
                </>
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
                <thead><tr><th className="w-12">Nº</th><th className="w-44">Vencimento</th><th className="w-36 text-right">Valor</th><th className="w-56">Forma de pagamento</th>{venda && op.formas.some((f) => ehCartao(f) || (f.taxa ?? 0) > 0) && <th className="w-64">Cartão / taxa</th>}<th>Observação</th></tr></thead>
                <tbody>{d.parcelas.map((p, i) => {
                  const up = (m: Partial<typeof p>) => set("parcelas", d.parcelas.map((x, j) => (j === i ? { ...x, ...m } : x)));
                  return (
                    <tr key={i}><td>{i + 1}</td>
                      <td><input type="date" className="campo" value={p.vencimento} onChange={(e) => up({ vencimento: e.target.value })} /></td>
                      <td><input className="campo text-right" value={p.valor} onChange={(e) => up({ valor: e.target.value })} /></td>
                      <td><select className="campo" value={p.formaPagamentoId} onChange={(e) => up({ formaPagamentoId: e.target.value })}><option value="">—</option>{op.formas.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></td>
                      {venda && op.formas.some((f) => ehCartao(f) || (f.taxa ?? 0) > 0) && <td><CartaoTaxa compacto forma={op.formas.find((f) => f.id === (p.formaPagamentoId || d.formaPagamentoId))} valor={lerNumero(p.valor) ?? 0} bandeira={p.bandeira ?? ""} vezes={p.vezes ?? "1"} onChange={(m) => up(m)} /></td>}
                      <td><input className="campo" value={p.observacao} onChange={(e) => up({ observacao: e.target.value })} /></td></tr>
                  );
                })}</tbody>
                <tfoot><tr><td colSpan={2} className="text-right text-[12px]">Soma das parcelas</td><td className={`text-right font-semibold ${Math.abs(d.parcelas.reduce((s, p) => s + (lerNumero(p.valor) ?? 0), 0) - tot.total) > 0.009 ? "text-red-600" : ""}`}>{n2(d.parcelas.reduce((s, p) => s + (lerNumero(p.valor) ?? 0), 0))}</td><td colSpan={venda && op.formas.some((f) => ehCartao(f) || (f.taxa ?? 0) > 0) ? 3 : 2}></td></tr></tfoot>
              </table>
            )}
          </>
        )}
      </Bloco>

      <Bloco icone="notas" titulo={<>Insira as informações de <b>observação e anexos</b></>}>
        <div className="grid gap-3 lg:grid-cols-2">
          <Campo rotulo="Observação"><textarea rows={3} className="campo" value={d.observacoes} onChange={(e) => set("observacoes", e.target.value)} /><span className="text-[11px] text-slate-500">Sai na impressão.</span></Campo>
          <Campo rotulo="Observação interna"><textarea rows={3} className="campo" value={d.observacaoInterna} onChange={(e) => set("observacaoInterna", e.target.value)} /><span className="text-[11px] text-slate-500">Uso interno, não sai na impressão.</span></Campo>
        </div>
        {inicial.anexos.length > 0 && <div className="mt-3 flex flex-wrap gap-2 text-[12px]">{inicial.anexos.map((a) => <a key={a.id} href={`/api/cadastros/anexo/${a.id}`} className="rounded border px-2 py-1 text-marca hover:underline"><Icone nome="anexos" size={12} className="inline" /> {a.nome}</a>)}</div>}
        <label className="btn-sec relative mt-3 cursor-pointer"><Icone nome="anexos" size={14} /> Adicionar anexo<input type="file" name="anexos" multiple className="absolute inset-0 cursor-pointer opacity-0" /></label>
      </Bloco>

      <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-2px_6px_rgba(0,0,0,0.04)] md:-mx-5 md:px-5">
        {estado && !estado.ok && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-[13px] text-red-700">{estado.mensagem}</div>}
        <div className="flex items-center gap-3">
          <span className="text-[13px]">Valor total <b className="text-[16px]">{brl(tot.total)}</b></span>
          <Link href={d.id ? `${raiz}/${d.id}` : base} className="btn-sec ml-auto">Cancelar</Link>
          <button className="btn px-5" disabled={pendente}>{pendente ? "Salvando…" : d.id ? "Salvar" : "Cadastrar"}</button>
        </div>
      </div>
    </form>
  );
}
