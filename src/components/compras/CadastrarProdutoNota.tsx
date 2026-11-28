"use client";

import { useState } from "react";
import Icone from "@/components/Icone";
import { cadastrarProdutoDaNotaAcao } from "@/lib/compras/acoes";
import type { ProdutoCriado, ProdutoDaNota } from "@/lib/compras/produtoDaNota";
import { fiscalSugerido, type ItemNota } from "@/lib/compras/tipos";
import { lerNumero, ORIGENS } from "@/lib/itens/tipos";
import { fatorPeloNome, mesmaUnidade, unidadeBase } from "@/lib/itens/unidades";

const num = (v: number, c = 4) => v.toLocaleString("pt-BR", { maximumFractionDigits: c });
const virgula = (v: number) => String(v).replace(".", ",");

/** Valores iniciais do cadastro: descrição, códigos e fiscal da nota; caixa/rolo com metragem no nome já vem convertido para metro. */
function inicialDaNota(nota: ItemNota, fornecedorId: string): ProdutoDaNota {
  const palpite = fatorPeloNome(nota.nome, "MT");
  const emMetro = !!palpite && !mesmaUnidade(nota.unidade, "MT");
  const f = fiscalSugerido(nota.st);
  return {
    fornecedorId, codigoFornecedor: nota.codigo, codigo: "", nome: nota.nome.trim(), gtin: nota.ean,
    unidade: emMetro ? "MT" : unidadeBase(nota.unidade) === "M" ? "MT" : nota.unidade || "UN",
    converte: emMetro, unidadeCompra: emMetro ? nota.unidade : "", fatorConversao: emMetro ? virgula(palpite!) : "",
    custoNota: virgula(nota.valorUnit), precoVenda: "",
    ncm: nota.ncm, cest: nota.cest, origem: /^[0-8]$/.test(nota.origem) ? nota.origem : "0", ...f,
  };
}

/** Botão "Cadastrar produto da nota" de uma linha da compra que não se ligou a nenhum produto. */
export default function CadastrarProdutoNota({ nota, fornecedorId, onCriado }: { nota: ItemNota; fornecedorId: string; onCriado: (p: ProdutoCriado) => void }) {
  const [aberto, setAberto] = useState(false);
  const [d, setD] = useState<ProdutoDaNota>(() => inicialDaNota(nota, fornecedorId));
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const set = <K extends keyof ProdutoDaNota>(k: K, v: ProdutoDaNota[K]) => setD((x) => ({ ...x, [k]: v }));
  const fator = d.converte ? lerNumero(d.fatorConversao) ?? 0 : 1;
  const custo = fator > 0 ? (lerNumero(d.custoNota) ?? 0) / fator : 0;

  async function salvar() {
    setSalvando(true); setErro("");
    const r = await cadastrarProdutoDaNotaAcao({ ...d, fornecedorId });
    setSalvando(false);
    if (!r.ok) { setErro(r.mensagem); return; }
    setAberto(false);
    onCriado(r.produto);
  }

  return (
    <>
      <button type="button" className="text-[11px] font-semibold text-marca hover:underline" onClick={() => { setD(inicialDaNota(nota, fornecedorId)); setErro(""); setAberto(true); }}>
        <Icone nome="mais" size={11} className="inline" /> Cadastrar produto com os dados da nota
      </button>
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-12" onClick={() => setAberto(false)}>
          <div className="cartao w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b bg-[#f7f7f7] px-4 py-3"><Icone nome="produtos" size={15} /><b className="text-[15px]">Cadastrar produto da nota</b>
              <button type="button" className="ml-auto text-slate-500 hover:text-slate-800" onClick={() => setAberto(false)}><Icone nome="fechar" size={16} /></button></div>
            <div className="space-y-4 px-4 py-3 text-[13px]">
              <p className="rounded bg-slate-50 px-3 py-2 text-[12px] text-slate-600">Na nota: <span className="font-mono">{nota.codigo}</span> {nota.nome} · {num(nota.quantidade)} {nota.unidade} × R$ {num(nota.valorUnit)}
                {nota.ncm && <> · NCM {nota.ncm}</>}{nota.cfop && <> · CFOP {nota.cfop}</>}{nota.cst && <> · CST/CSOSN {nota.cst}</>}{nota.st && <b className="text-amber-700"> · com ST</b>}</p>

              <div className="grid gap-3 sm:grid-cols-4">
                <label className="sm:col-span-3"><span className="rotulo obrig">Nome do produto</span><input className="campo" value={d.nome} onChange={(e) => set("nome", e.target.value)} /></label>
                <label><span className="rotulo">Código interno</span><input className="campo" value={d.codigo} placeholder="gerado ao salvar" onChange={(e) => set("codigo", e.target.value)} /></label>
                <label><span className="rotulo">Código de barras</span><input className="campo" value={d.gtin} onChange={(e) => set("gtin", e.target.value)} /></label>
                <label><span className="rotulo obrig">Vende / estoca em</span><input className="campo uppercase" value={d.unidade} onChange={(e) => set("unidade", e.target.value.toUpperCase())} /></label>
                <label><span className="rotulo">Valor de venda</span><input className="campo text-right" value={d.precoVenda} placeholder="margem padrão" onChange={(e) => set("precoVenda", e.target.value)} /></label>
              </div>

              <div className="rounded border border-slate-200 p-3">
                <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={d.converte} onChange={(e) => setD((x) => ({ ...x, converte: e.target.checked, unidadeCompra: x.unidadeCompra || nota.unidade, fatorConversao: x.fatorConversao || virgula(fatorPeloNome(nota.nome, x.unidade) ?? 1) }))} />
                  Compro numa unidade e vendo em outra (ex.: caixa de 305 metros)</label>
                {d.converte && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    1 <input className="campo w-20 uppercase" value={d.unidadeCompra} onChange={(e) => set("unidadeCompra", e.target.value.toUpperCase())} />
                    = <input className={`campo w-24 text-right ${fator > 0 ? "" : "border-red-400"}`} value={d.fatorConversao} placeholder="305" onChange={(e) => set("fatorConversao", e.target.value)} /> {d.unidade}
                  </div>
                )}
                <p className="mt-2 text-[12px] text-slate-600">
                  {d.converte && fator > 0
                    ? <>Esta compra entra como <b>{num(nota.quantidade * fator)} {d.unidade}</b> no estoque, com custo de <b>R$ {num(custo)}/{d.unidade}</b> (R$ {num(nota.valorUnit)} ÷ {num(fator)}).</>
                    : <>Custo de <b>R$ {num(custo)}/{d.unidade}</b>.</>}
                </p>
              </div>

              <div>
                <b className="text-[12px] uppercase text-slate-500">Fiscal (veio da nota{nota.st ? "; o item tem ST" : ""})</b>
                <div className="mt-1 grid gap-3 sm:grid-cols-4">
                  <label><span className="rotulo">NCM</span><input className="campo" value={d.ncm} onChange={(e) => set("ncm", e.target.value)} /></label>
                  <label><span className="rotulo">CEST</span><input className="campo" value={d.cest} onChange={(e) => set("cest", e.target.value)} /></label>
                  <label className="sm:col-span-2"><span className="rotulo">Origem</span>
                    <select className="campo" value={d.origem} onChange={(e) => set("origem", e.target.value)}>{ORIGENS.map((o, i) => <option key={i} value={String(i)}>{o}</option>)}</select></label>
                  <label><span className="rotulo">CFOP dentro do estado</span><input className="campo" value={d.cfopInterno} onChange={(e) => set("cfopInterno", e.target.value)} /></label>
                  <label><span className="rotulo">CFOP fora do estado</span><input className="campo" value={d.cfopExterno} onChange={(e) => set("cfopExterno", e.target.value)} /></label>
                  <label><span className="rotulo">CSOSN (Simples)</span><input className="campo" value={d.csosn} onChange={(e) => set("csosn", e.target.value)} /></label>
                  <label><span className="rotulo">CST ICMS</span><input className="campo" value={d.cstIcms} onChange={(e) => set("cstIcms", e.target.value)} /></label>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">CFOP e CSOSN/CST são os de venda: {nota.st ? "como o item já veio com ST, a sugestão é 5405/6404 e CSOSN 500 (CST 60)" : "sem ST na nota, a sugestão é 5102/6102 e CSOSN 102 (CST 00)"}. Confira antes de salvar.</p>
              </div>

              {erro && <p className="rounded bg-red-50 px-3 py-2 text-red-700">{erro}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t px-4 py-3">
              <button type="button" className="btn-sec" onClick={() => setAberto(false)}>Cancelar</button>
              <button type="button" className="btn" disabled={salvando || !d.nome.trim() || !d.unidade.trim()} onClick={salvar}>{salvando ? "Cadastrando…" : "Cadastrar e usar nesta linha"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
