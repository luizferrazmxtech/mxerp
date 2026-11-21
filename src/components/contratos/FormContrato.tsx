"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import Link from "next/link";
import { useState } from "react";
import Icone from "@/components/Icone";
import { Bloco, Campo } from "@/components/ui/Pagina";
import Busca from "@/components/ui/Busca";
import LinhaItemBusca from "@/components/itens/LinhaItemBusca";
import BuscaPessoa from "@/components/orcamentos/BuscaPessoa";
import { salvarContratoForm, type Resultado } from "@/lib/contratos/acoes";
import { PERIODICIDADES, SITUACOES_CONTRATO, primeiroVencimento, totaisContrato, type DadosContrato } from "@/lib/contratos/tipos";
import { subtotalServico, type LinhaServico } from "@/lib/orcamentos/tipos";

type ServicoBusca = { id: string; codigo: string; nome: string; preco: number };
type Opcoes = { vendedores: { id: string; nome: string }[]; formas: { id: string; nome: string; boletoInter: boolean }[]; canais: string[]; centros: string[] };

const n2 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Formulário "Adicionar/Editar contrato" (no Gestão Click: Assinaturas). */
export default function FormContrato({ inicial, op, proximoNumero, interAtivo, whatsappAtivo = false }: { inicial: DadosContrato; op: Opcoes; proximoNumero: number; interAtivo: boolean; whatsappAtivo?: boolean }) {
  const [d, setD] = useState(inicial);
  const [editNumero, setEditNumero] = useState(false);
  const [estado, , pendente, formAcao] = useFormAcao<Resultado>(salvarContratoForm, null);
  const set = <K extends keyof DadosContrato>(k: K, v: DadosContrato[K]) => setD((x) => ({ ...x, [k]: v }));
  const setServ = (i: number, m: Partial<LinhaServico>) => set("servicos", d.servicos.map((l, j) => (j === i ? { ...l, ...m } : l)));
  const novo = (): LinhaServico => ({ servicoId: "", nome: "", codigo: "", detalhes: "", quantidade: "1", valorUnit: "0,00", desconto: "", descontoPct: false });
  const tot = totaisContrato(d);
  const forma = op.formas.find((f) => f.id === d.formaPagamentoId);

  // sugere o próximo vencimento quando muda o dia ou a data do contrato
  const sugerir = (dia: string, inicio: string) => {
    const nd = Math.trunc(Number(dia));
    if (!(nd >= 1 && nd <= 31) || !/^\d{4}-\d{2}-\d{2}$/.test(inicio) || d.id) return;
    const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const base = inicio > hoje ? inicio : hoje;
    set("proximoVencimento", primeiroVencimento(new Date(`${base}T00:00:00Z`), nd).toISOString().slice(0, 10));
  };

  return (
    <form {...formAcao}>
      <input type="hidden" name="dados" value={JSON.stringify(d)} />
      <Bloco icone="editar" titulo={<>Informe os <b>dados</b> do contrato</>} subtitulo="Número, cliente, data, situação e classificação.">
        <div className="grid gap-3 md:grid-cols-4">
          <Campo rotulo="Número" obrigatorio>
            <div className="flex">
              <input className="campo rounded-r-none" disabled={!editNumero} value={editNumero ? d.numero : d.numero || String(proximoNumero)} onChange={(e) => set("numero", e.target.value)} />
              <button type="button" className="rounded-r border border-l-0 border-slate-300 bg-slate-50 px-2" title="Alterar o número" onClick={() => setEditNumero(!editNumero)}><Icone nome="editar" size={13} /></button>
            </div>
          </Campo>
          <Campo rotulo="Cliente" obrigatorio className="md:col-span-2">
            <BuscaPessoa papel="cliente" placeholder="Busque por nome, CPF ou CNPJ" inicial={d.clienteId ? { id: d.clienteId, nome: d.clienteNome } : null}
              onEscolher={(c) => setD((x) => ({ ...x, clienteId: c?.id ?? "", clienteNome: c?.nome ?? "" }))} />
          </Campo>
          <Campo rotulo="Data do contrato" obrigatorio>
            <input type="date" className="campo" value={d.dataInicio} onChange={(e) => { set("dataInicio", e.target.value); sugerir(d.diaVencimento, e.target.value); }} />
          </Campo>
          <Campo rotulo="Situação" obrigatorio>
            <select className="campo" value={d.situacao} onChange={(e) => set("situacao", e.target.value as DadosContrato["situacao"])}>
              {SITUACOES_CONTRATO.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Vendedor">
            <select className="campo" value={d.vendedorId} onChange={(e) => set("vendedorId", e.target.value)}>
              <option value="">—</option>
              {op.vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Canal de venda" obrigatorio>
            <select className="campo" value={d.canal} onChange={(e) => set("canal", e.target.value)}>{op.canais.map((c) => <option key={c}>{c}</option>)}</select>
          </Campo>
          <Campo rotulo="Centro de custo">
            <input className="campo" list="centros-contrato" value={d.centroCusto} onChange={(e) => set("centroCusto", e.target.value)} />
            <datalist id="centros-contrato">{op.centros.map((c) => <option key={c} value={c} />)}</datalist>
          </Campo>
        </div>
      </Bloco>

      <Bloco icone="servicos" titulo={<>Adicione os <b>serviços</b> do contrato</>} subtitulo="Cada cobrança gera uma venda de serviços com estas linhas." corpo="p-0">
        <div className="overflow-x-auto">
          <table className="tabela">
            <thead><tr>
              <th className="min-w-72">Serviço *</th><th className="min-w-40">Detalhes</th><th className="w-24 text-right">Quant. *</th>
              <th className="w-28 text-right">Valor *</th><th className="w-28 text-right">Subtotal</th><th className="w-12"></th>
            </tr></thead>
            <tbody>
              {d.servicos.map((l, i) => (
                <tr key={i}>
                  <td>
                    {l.servicoId ? <div className="text-[13px]"><span className="font-mono text-[11px] text-slate-500">{l.codigo}</span> {l.nome}</div> : (
                      <Busca<ServicoBusca> url={(q) => `/api/itens/busca?tipo=servico&q=${encodeURIComponent(q)}`} valor={null} rotulo={(s) => s.nome} autoFocus larguraMin={480}
                        linha={(s) => <LinhaItemBusca codigo={s.codigo} nome={s.nome} valor={s.preco} />}
                        onEscolher={(s) => s && setServ(i, { servicoId: s.id, nome: s.nome, codigo: s.codigo, valorUnit: n2(s.preco) })} />
                    )}
                  </td>
                  <td><input className="campo" value={l.detalhes} onChange={(e) => setServ(i, { detalhes: e.target.value })} /></td>
                  <td><input className="campo text-right" value={l.quantidade} onChange={(e) => setServ(i, { quantidade: e.target.value })} /></td>
                  <td><input className="campo text-right" value={l.valorUnit} onChange={(e) => setServ(i, { valorUnit: e.target.value })} /></td>
                  <td className="text-right font-semibold">{n2(subtotalServico(l))}</td>
                  <td><button type="button" className="btn-icone text-red-600" title="Remover" onClick={() => set("servicos", d.servicos.filter((_, j) => j !== i))}><Icone nome="excluir" size={13} /></button></td>
                </tr>
              ))}
              {!d.servicos.length && <tr><td colSpan={6} className="py-6 text-center text-slate-500">Nenhum serviço neste contrato</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="p-3"><button type="button" className="btn-sec" onClick={() => set("servicos", [...d.servicos, novo()])}><Icone nome="mais" size={14} /> Adicionar outro serviço</button></div>
      </Bloco>

      <Bloco icone="valor" titulo={<>Confira o <b>total</b> de cada cobrança</>} subtitulo="Soma dos serviços menos o desconto.">
        <div className="grid gap-3 md:grid-cols-4">
          <Campo rotulo="Serviços"><input className="campo bg-slate-50 text-right" disabled value={n2(tot.servicos)} /></Campo>
          <Campo rotulo="Desconto">
            <div className="flex">
              <input className="campo rounded-r-none text-right" value={d.desconto} onChange={(e) => set("desconto", e.target.value)} />
              <button type="button" className="rounded-r border border-l-0 border-slate-300 bg-slate-50 px-2 text-[12px] font-semibold" onClick={() => set("descontoPct", !d.descontoPct)}>{d.descontoPct ? "%" : "R$"}</button>
            </div>
          </Campo>
          <Campo rotulo="Valor de cada cobrança" className="md:col-span-2"><input className="campo bg-slate-50 text-right text-[15px] font-semibold" disabled value={brl(tot.total)} /></Campo>
        </div>
      </Bloco>

      <Bloco icone="prazo" titulo={<>Defina a <b>recorrência</b> da cobrança</>} subtitulo="Quando vence, de quanto em quanto tempo repete e até quando.">
        <div className="grid gap-3 md:grid-cols-4">
          <Campo rotulo="Periodicidade" obrigatorio>
            <select className="campo" value={d.periodicidade} onChange={(e) => set("periodicidade", e.target.value as DadosContrato["periodicidade"])}>
              {PERIODICIDADES.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Dia do vencimento" obrigatorio>
            <input className="campo" inputMode="numeric" value={d.diaVencimento} onChange={(e) => { set("diaVencimento", e.target.value); sugerir(e.target.value, d.dataInicio); }} />
          </Campo>
          <Campo rotulo="Próximo vencimento" obrigatorio>
            <input type="date" className="campo" value={d.proximoVencimento} onChange={(e) => set("proximoVencimento", e.target.value)} />
          </Campo>
          <Campo rotulo="Forma de pagamento">
            <select className="campo" value={d.formaPagamentoId} onChange={(e) => set("formaPagamentoId", e.target.value)}>
              <option value="">—</option>
              {op.formas.map((f) => <option key={f.id} value={f.id}>{f.nome}{f.boletoInter ? " (boleto Inter)" : ""}</option>)}
            </select>
          </Campo>
          <div className="md:col-span-4">
            <span className="rotulo">Término</span>
            <div className="flex flex-wrap items-center gap-2">
              {([["SEM", "Sem término"], ["DATA", "Até uma data"], ["VEZES", "Por vezes"]] as const).map(([v, r]) => (
                <button key={v} type="button" onClick={() => set("termino", v)} className={`rounded border px-3 py-1.5 text-[13px] ${d.termino === v ? "border-marca bg-marca text-white" : "border-slate-300 bg-white"}`}>{r}</button>
              ))}
              {d.termino === "DATA" && <input type="date" className="campo w-44" value={d.dataFim} onChange={(e) => set("dataFim", e.target.value)} />}
              {d.termino === "VEZES" && <><input className="campo w-24" inputMode="numeric" value={d.totalCobrancas} onChange={(e) => set("totalCobrancas", e.target.value)} /> <span className="text-[13px] text-slate-600">cobranças</span></>}
            </div>
          </div>
        </div>
      </Bloco>

      <Bloco icone="envios" titulo={<>Cobrança <b>automática</b></>} subtitulo="O que o sistema faz sozinho a cada vencimento.">
        <div className="space-y-3 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            Gerar a venda{forma?.boletoInter ? " e o boleto" : ""}
            <input className="campo w-16 text-center" inputMode="numeric" value={d.diasAntecedencia} onChange={(e) => set("diasAntecedencia", e.target.value)} />
            dias antes do vencimento
          </div>
          {forma?.boletoInter && !interAtivo && <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">O boleto só é registrado com o Banco Inter configurado em <Link href="/financeiro/conciliacao/inter" className="underline">Configurações → Banco Inter</Link>.</p>}
          <label className="flex items-center gap-2"><input type="checkbox" checked={d.enviarBoleto} onChange={(e) => set("enviarBoleto", e.target.checked)} /> Enviar a cobrança{forma?.boletoInter ? " com o boleto" : ""} assim que for gerada</label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2"><input type="checkbox" checked={d.lembrete} onChange={(e) => set("lembrete", e.target.checked)} /> Enviar lembrete de pagamento</label>
            {d.lembrete && <><input className="campo w-16 text-center" inputMode="numeric" value={d.diasLembrete} onChange={(e) => set("diasLembrete", e.target.value)} /> dias antes do vencimento (se ainda não foi pago)</>}
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={d.emitirNota} onChange={(e) => set("emitirNota", e.target.checked)} /> Emitir a nota fiscal de serviço (NFS-e) automaticamente</label>
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-semibold">Mandar a cobrança e o lembrete por:</span>
            <label className="flex items-center gap-2"><input type="checkbox" checked={d.canalEmail} onChange={(e) => set("canalEmail", e.target.checked)} /> E-mail</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={d.canalWhatsapp} onChange={(e) => set("canalWhatsapp", e.target.checked)} /> WhatsApp (MXChat){forma?.boletoInter ? ", com o boleto em PDF" : ""}</label>
          </div>
          {d.canalWhatsapp && !whatsappAtivo && <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">O WhatsApp só sai com o MXChat ligado em <Link href="/whatsapp" className="underline">Configurações → WhatsApp (MXChat)</Link>.</p>}
          <div className="grid max-w-3xl gap-3 md:grid-cols-2">
            {d.canalEmail && <Campo rotulo="E-mail de cobrança (vazio = e-mail do cadastro; separe vários com vírgula)">
              <input className="campo" value={d.emailCobranca} onChange={(e) => set("emailCobranca", e.target.value)} placeholder="financeiro@cliente.com.br" />
            </Campo>}
            {d.canalWhatsapp && <Campo rotulo="WhatsApp de cobrança (vazio = celular do cadastro do cliente)">
              <input className="campo" value={d.whatsappCobranca} onChange={(e) => set("whatsappCobranca", e.target.value)} placeholder="(11) 98765-4321" inputMode="tel" />
            </Campo>}
          </div>
        </div>
      </Bloco>

      <Bloco icone="anotacoes" titulo={<>Observações</>}>
        <div className="grid gap-3 md:grid-cols-2">
          <Campo rotulo="Observações (vão na venda gerada)"><textarea className="campo min-h-20" value={d.observacoes} onChange={(e) => set("observacoes", e.target.value)} /></Campo>
          <Campo rotulo="Observações internas"><textarea className="campo min-h-20" value={d.observacaoInterna} onChange={(e) => set("observacaoInterna", e.target.value)} /></Campo>
        </div>
      </Bloco>

      {estado && !estado.ok && <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{estado.mensagem}</p>}
      <div className="flex gap-2">
        <button className="btn-verde" disabled={pendente}><Icone nome="ok" size={15} /> {pendente ? "Salvando…" : "Salvar"}</button>
        <Link href={d.id ? `/contratos/${d.id}` : "/contratos"} className="btn-sec">Cancelar</Link>
      </div>
    </form>
  );
}
