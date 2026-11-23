"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LinhaEstoque } from "@/lib/estoque/consultas";
import LinhaItemBusca, { fundoEstoque } from "@/components/itens/LinhaItemBusca";
import Pagamentos, { type Forma, type LinhaPag } from "@/components/Pagamentos";
import Icone from "@/components/Icone";
import { fecharBalcao, type ResultadoSimples } from "./actions";
import PixPdv from "@/components/pagseguro/PixPdv";
import BuscaPessoa from "@/components/orcamentos/BuscaPessoa";
import type { PessoaBusca } from "@/lib/cadastros/tipos";

type Item = { produtoId: string; codigo: string; nome: string; locais: string | null; quantidade: number; valorUnit: number };
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Tecla({ k, children }: { k: string; children: React.ReactNode }) {
  return <span className="whitespace-nowrap"><kbd className="rounded border bg-slate-50 px-1.5 text-[11px]">{k}</kbd> {children}</span>;
}

export default function Pdv({ formas, caixa, podeDesconto = true, podeSangria = true, podeCancelar = false }: { formas: Forma[]; caixa: { abertoEm: string; vendas: number; total: number }; podeDesconto?: boolean; podeSangria?: boolean; podeCancelar?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [opcoes, setOpcoes] = useState<LinhaEstoque[]>([]);
  const [foco, setFoco] = useState(0);
  const [itens, setItens] = useState<Item[]>([]);
  const [desconto, setDesconto] = useState(0);
  const [pagamentos, setPagamentos] = useState<LinhaPag[]>([]);
  const [resultado, setResultado] = useState<ResultadoSimples>(null);
  const [chave, setChave] = useState(0); // recria o editor de pagamentos depois de cada venda
  const [pendente, startTransition] = useTransition();
  const [cliente, setCliente] = useState<PessoaBusca | null>(null);
  const campoCliente = useRef<HTMLDivElement>(null);
  const [pixValor, setPixValor] = useState<number | null>(null); // PIX do PagSeguro: QR aberto
  const busca = useRef<HTMLInputElement>(null);
  const campoDesconto = useRef<HTMLInputElement>(null);

  const total = Math.round((itens.reduce((s, i) => s + i.quantidade * i.valorUnit, 0) - desconto) * 100) / 100;
  const unidades = itens.reduce((s, i) => s + i.quantidade, 0);

  useEffect(() => {
    if (q.trim().length < 2) { setOpcoes([]); return; }
    const c = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/produtos?q=${encodeURIComponent(q)}`, { signal: c.signal }).then((r) => r.json()).then((r: LinhaEstoque[]) => {
        // leitor de código de barras: correspondência exata entra direto
        const exato = r.find((p) => p.codigo === q.trim());
        if (exato) { incluir(exato); return; }
        setOpcoes(r); setFoco(0);
      }).catch(() => {});
    }, 150);
    return () => { clearTimeout(t); c.abort(); };
  }, [q]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); busca.current?.focus(); }
      if (e.key === "F3") { e.preventDefault(); campoCliente.current?.querySelector<HTMLInputElement>("input.campo")?.focus(); }
      if (e.key === "F4") { e.preventDefault(); campoDesconto.current?.focus(); campoDesconto.current?.select(); }
      if (e.key === "F8") { e.preventDefault(); fechar(); }
      if (e.key === "F10") { e.preventDefault(); router.push("/pdv?acao=fechar"); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  function incluir(p: LinhaEstoque) {
    setItens((atual) => {
      const ja = atual.find((i) => i.produtoId === p.id);
      if (ja) return atual.map((i) => (i.produtoId === p.id ? { ...i, quantidade: i.quantidade + 1 } : i));
      return [...atual, { produtoId: p.id, codigo: p.codigo, nome: p.nome, locais: p.locais, quantidade: 1, valorUnit: p.precoVenda }];
    });
    setQ(""); setOpcoes([]); setResultado(null);
    busca.current?.focus();
  }

  function fechar(cobrancaPixId?: string) {
    if (!itens.length || pendente || total <= 0) return;
    const valorPix = Math.round(pagamentos.filter((p) => p.valor > 0 && formas.find((f) => f.id === p.formaPagamentoId)?.pix).reduce((s, p) => s + p.valor, 0) * 100) / 100;
    if (valorPix > 0 && !cobrancaPixId) { setPixValor(valorPix); return; }
    startTransition(async () => {
      const r = await fecharBalcao({
        clienteId: cliente?.id,
        itens: itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade, valorUnit: i.valorUnit })),
        pagamentos: pagamentos.filter((p) => p.valor > 0),
        desconto, cobrancaPixId,
      });
      setPixValor(null);
      setResultado(r);
      if (r?.ok) { setItens([]); setDesconto(0); setCliente(null); setChave((k) => k + 1); router.refresh(); busca.current?.focus(); }
    });
  }

  return (
    <div className="flex min-h-[calc(100vh-50px)] flex-col p-3 md:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-[12px] text-slate-600">
        <span className="flex items-center gap-1.5 text-[18px] text-slate-800"><Icone nome="pdv" size={18} /> PDV</span>
        <span className="rounded border bg-white px-2 py-1">Caixa aberto em {caixa.abertoEm}</span>
        <span className="rounded border bg-white px-2 py-1">{caixa.vendas} venda(s) · {brl(caixa.total)}</span>
        <Link href="/vendas/balcao" className="ml-auto hover:underline">Vendas do balcão</Link>
        {podeSangria && <Link href="/pdv?acao=sangria" className="btn-sec py-1 text-[12px]" title="Retirar dinheiro da gaveta">Sangria</Link>}
        {podeSangria && <Link href="/pdv?acao=suprimento" className="btn-sec py-1 text-[12px]" title="Colocar troco na gaveta">Suprimento</Link>}
        <Link href="/pdv?acao=fechar" className="btn-sec py-1 text-[12px]"><Icone nome="caixa" size={13} /> Fechar caixa</Link>
      </div>

      <div className="grid flex-1 gap-4 lg:grid-cols-[1fr_390px]">
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Icone nome="buscar" size={18} className="absolute left-3 top-3.5 text-slate-400" />
            <input ref={busca} autoFocus className="campo py-3 pl-10 text-[16px]" placeholder="Código de barras, código ou nome do produto (F2)"
              value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setFoco((f) => Math.min(f + 1, opcoes.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setFoco((f) => Math.max(f - 1, 0)); }
                if (e.key === "Enter" && opcoes[foco]) incluir(opcoes[foco]);
                if (e.key === "Escape") { setQ(""); setOpcoes([]); }
              }} />
            {opcoes.length > 0 && (
              <ul className="absolute z-30 mt-1 max-h-96 w-full overflow-auto rounded-md border bg-white shadow-lg">
                {opcoes.map((o, i) => (
                  <li key={o.id}>
                    <button type="button" onMouseEnter={() => setFoco(i)} onClick={() => incluir(o)} className={`block w-full border-b border-slate-100 px-3 py-2 text-left text-[13px] ${i === foco ? "bg-slate-100" : fundoEstoque(o.situacao)}`}>
                      <LinhaItemBusca codigo={o.codigo} nome={o.nome} unidade={o.unidade} valor={o.precoVenda} disponivel={o.disponivel} situacao={o.situacao} minimo={o.minimo} extra={o.locais ?? "sem local"} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="cartao flex-1 overflow-x-auto">
            <table className="tabela">
              <thead><tr><th className="w-10">#</th><th>Produto</th><th className="w-40">Prateleira</th><th className="w-24 text-right">Qtd</th><th className="w-28 text-right">Valor</th><th className="w-28 text-right">Subtotal</th><th className="w-10"></th></tr></thead>
              <tbody>
                {itens.map((i, k) => (
                  <tr key={i.produtoId}>
                    <td className="text-slate-500">{k + 1}</td>
                    <td><span className="font-mono text-[11px] text-slate-500">{i.codigo}</span> {i.nome}</td>
                    <td className="text-[11px] text-slate-500">{i.locais}</td>
                    <td><input className="campo py-1 text-right" type="number" min={0.001} step="any" value={i.quantidade}
                      onChange={(e) => setItens(itens.map((x, j) => (j === k ? { ...x, quantidade: Number(e.target.value) } : x)))} /></td>
                    <td><input className="campo py-1 text-right" type="number" step="0.01" value={i.valorUnit}
                      onChange={(e) => setItens(itens.map((x, j) => (j === k ? { ...x, valorUnit: Number(e.target.value) } : x)))} /></td>
                    <td className="text-right">{brl(i.quantidade * i.valorUnit)}</td>
                    <td><button className="btn-icone text-red-600" title="Remover" onClick={() => setItens(itens.filter((_, j) => j !== k))}><Icone nome="excluir" size={13} /></button></td>
                  </tr>
                ))}
                {!itens.length && <tr><td colSpan={7} className="py-16 text-center text-slate-400">Passe o leitor ou busque um produto.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="cartao flex h-fit flex-col gap-3 p-4 lg:sticky lg:top-[66px]">
          <div ref={campoCliente} className="text-[13px]">
            <span className="mb-1 block text-slate-600">Cliente (F3)</span>
            <BuscaPessoa key={chave} papel="cliente" inicial={cliente} onEscolher={setCliente} placeholder="Consumidor final: digite nome, CPF/CNPJ ou telefone" />
          </div>
          <div className="flex justify-between text-[13px] text-slate-600"><span>{itens.length} item(ns) · {unidades} un.</span></div>
          <div className="flex items-center justify-between text-[13px]">
            <span>Desconto (F4)</span>
            <input ref={campoDesconto} disabled={!podeDesconto} title={podeDesconto ? undefined : "Sem permissão para dar desconto"} className="campo w-28 py-1 text-right" type="number" step="0.01" value={desconto || ""} onChange={(e) => setDesconto(Number(e.target.value))} />
          </div>
          <div className="flex items-end justify-between border-t pt-3">
            <span className="text-[13px] text-slate-500">Total</span>
            <span className="text-[34px] font-semibold leading-none">{brl(total)}</span>
          </div>
          <Pagamentos key={chave} formas={formas} total={total} onChange={setPagamentos} />
          <button className="btn w-full py-3 text-[16px]" disabled={!itens.length || pendente || total <= 0} onClick={() => fechar()}>
            {pendente ? "Finalizando…" : "Finalizar venda (F8)"}
          </button>
          {resultado && (
            <p className={`text-[13px] ${resultado.ok ? "text-emerald-700" : "text-red-700"}`}>
              {resultado.mensagem}{" "}
              {resultado.vendaId && <Link className="underline" href={`/vendas/${resultado.vendaId}?aba=notas`}>ver venda / emitir NFC-e</Link>}
              {resultado.vendaId && podeCancelar && <> · <Link className="text-red-700 underline" href={`/vendas/${resultado.vendaId}?cancelar=1`}>cancelar esta venda</Link></>}
            </p>
          )}
        </aside>
      </div>

      {pixValor != null && <PixPdv valor={pixValor} onPago={(id) => fechar(id)} onFechar={() => setPixValor(null)} />}
      <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-1 rounded-md border bg-white py-2 text-[12px] text-slate-600">
        <Tecla k="F2">Buscar produto</Tecla><Tecla k="F3">Cliente</Tecla><Tecla k="F4">Desconto</Tecla><Tecla k="F8">Finalizar venda</Tecla>
        <Tecla k="F10">Fechar caixa</Tecla><Tecla k="Esc">Limpar busca</Tecla>
      </div>
    </div>
  );
}
