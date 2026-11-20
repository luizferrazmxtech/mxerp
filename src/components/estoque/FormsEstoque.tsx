"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import Icone from "@/components/Icone";
import { Bloco, Campo } from "@/components/ui/Pagina";
import Busca from "@/components/ui/Busca";
import LinhaItemBusca, { fundoEstoque } from "@/components/itens/LinhaItemBusca";
import type { SituacaoEstoque } from "@/lib/itens/estoqueSituacao";
import { lerCodigoAcao, registrarContagemAcao, resumoInventarioAcao, salvarAjusteForm, zerarEstoqueAcao, salvarInventarioForm, salvarTransferenciaForm, type Resultado } from "@/lib/compras/acoes";
import type { DadosInventario, ItemAjuste } from "@/lib/estoque/documentos";
import { lerNumero } from "@/lib/itens/tipos";
import { ResumoConversao, SeletorUnidade } from "@/components/itens/CelulaConversao";

type ProdutoBusca = { id: string; codigo: string; nome: string; unidade: string; custo: number; fisico: number | null; disponivel?: number | null; situacao?: SituacaoEstoque; minimo?: number; unidadeCompra?: string | null; fatorConversao?: number };
const n2 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const n = (s: string) => lerNumero(s) ?? 0;

function Erro({ r }: { r: Resultado }) {
  return r && !r.ok ? <div className="mb-2 rounded bg-red-50 px-3 py-2 text-[13px] text-red-700">{r.mensagem}</div> : null;
}

function LinhaProduto({ item, onEscolher }: { item: { produtoId: string; nome?: string; codigo?: string }; onEscolher: (p: ProdutoBusca) => void }) {
  return item.produtoId ? <div className="text-[13px]"><span className="font-mono text-[11px] text-slate-500">{item.codigo}</span> {item.nome}</div> : (
    <Busca<ProdutoBusca> url={(q) => `/api/itens/busca?tipo=produto&q=${encodeURIComponent(q)}`} valor={null} rotulo={(p) => p.nome} autoFocus larguraMin={560} classeLinha={(p) => fundoEstoque(p.situacao)}
      linha={(p) => <LinhaItemBusca codigo={p.codigo} nome={p.nome} unidade={p.unidade} valor={p.custo} rotuloValor="Custo" disponivel={p.disponivel ?? p.fisico} situacao={p.situacao} minimo={p.minimo} />}
      onEscolher={(p) => p && onEscolher(p)} />
  );
}

/** Ajuste de estoque: entrada soma, saída retira. Trocar o tipo limpa a lista de produtos. */
export function FormAjuste({ inicial }: { inicial?: { tipo: "ENTRADA" | "SAIDA"; frete: string; observacoes: string; itens: ItemAjuste[] } }) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(salvarAjusteForm, null);
  const [tipo, setTipo] = useState<"" | "ENTRADA" | "SAIDA">(inicial?.tipo ?? "");
  const [frete, setFrete] = useState(inicial?.frete ?? "0,00");
  const [obs, setObs] = useState(inicial?.observacoes ?? "");
  const [itens, setItens] = useState<ItemAjuste[]>(inicial?.itens ?? []);
  const [atualizarCusto, setAtualizarCusto] = useState(false);
  const up = (i: number, m: Partial<ItemAjuste>) => setItens(itens.map((x, j) => (j === i ? { ...x, ...m } : x)));
  const total = itens.reduce((s, i) => s + n(i.quantidade) * n(i.custo), 0) + n(frete);
  return (
    <form action={acao}>
      <input type="hidden" name="dados" value={JSON.stringify({ tipo, frete, observacoes: obs, itens, atualizarCusto: tipo === "ENTRADA" && atualizarCusto })} />
      <Bloco icone="ajustes" titulo={<>Defina o <b>tipo do ajuste</b></>} subtitulo="Entrada soma ao estoque da loja; saída retira. Trocar o tipo limpa a lista de produtos.">
        <div className="grid items-end gap-3 sm:grid-cols-3">
          <Campo rotulo="Movimentação" obrigatorio><select className="campo" value={tipo} onChange={(e) => { setTipo(e.target.value as "ENTRADA" | "SAIDA"); setItens([]); }}><option value="">Selecione</option><option value="ENTRADA">Entrada</option><option value="SAIDA">Saída</option></select></Campo>
          <Campo rotulo="Valor frete (R$)"><input className="campo text-right" value={frete} onChange={(e) => setFrete(e.target.value)} /></Campo>
          <Campo rotulo="Valor total (R$)"><input className="campo text-right font-semibold" readOnly value={n2(total)} /></Campo>
        </div>
      </Bloco>
      {tipo && (
        <Bloco icone="produtos" titulo={<>Informe os <b>produtos</b> do ajuste</>} corpo="p-0">
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead><tr><th className="min-w-72">Produto *</th><th className="w-28 text-right">Quantidade *</th><th className="w-28">Unidade *</th><th className="w-32 text-right">Custo *</th><th className="w-28 text-right">Total *</th><th className="w-12"></th></tr></thead>
              <tbody>
                {itens.map((l, i) => (
                  <tr key={i}>
                    <td><LinhaProduto item={l} onEscolher={(p) => up(i, { produtoId: p.id, nome: p.nome, codigo: p.codigo, unidade: p.unidade, custo: n2(p.custo), conversaoProduto: p.unidadeCompra ? { unidade: p.unidadeCompra, fator: p.fatorConversao ?? 1 } : null })} /></td>
                    <td><input className="campo text-right" value={l.quantidade} onChange={(e) => up(i, { quantidade: e.target.value })} /></td>
                    <td className="text-[12px]">{l.produtoId && tipo === "ENTRADA" ? <SeletorUnidade l={{ ...l, unidade: l.unidade ?? "UN" }} onChange={(m) => {
                      // trocar de unidade leva o custo junto (custo do metro × 305 = custo da caixa)
                      const fa = (l.unidadeCompra ?? "").trim() ? n(l.fator ?? "") || 1 : 1;
                      const fn = (m.unidadeCompra ?? l.unidadeCompra ?? "").trim() ? n(m.fator ?? l.fator ?? "") || fa : 1;
                      up(i, { ...m, ...(fn !== fa && n(l.custo) > 0 ? { custo: n2((n(l.custo) / fa) * fn) } : {}) });
                    }} /> : l.unidade}</td>
                    <td><input className="campo text-right" value={l.custo} onChange={(e) => up(i, { custo: e.target.value })} /></td>
                    <td className="text-right font-semibold">{n2(n(l.quantidade) * n(l.custo))}{l.produtoId && <ResumoConversao l={{ ...l, unidade: l.unidade ?? "UN" }} quantidade={l.quantidade} subtotal={n(l.quantidade) * n(l.custo)} />}</td>
                    <td><button type="button" className="btn-icone text-red-600" title="Remover" onClick={() => setItens(itens.filter((_, j) => j !== i))}><Icone nome="excluir" size={13} /></button></td>
                  </tr>
                ))}
                {!itens.length && <tr><td colSpan={6} className="py-6 text-center text-slate-500">Nenhum produto no ajuste</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="p-3"><button type="button" className="btn-sec" onClick={() => setItens([...itens, { produtoId: "", quantidade: "1", custo: "0,00" }])}><Icone nome="mais" size={14} /> Adicionar produto</button></div>
        </Bloco>
      )}
      {tipo === "ENTRADA" && (
        <label className="cartao mb-3 flex items-start gap-2 p-3 text-[13px]"><input type="checkbox" className="mt-0.5" checked={atualizarCusto} onChange={(e) => setAtualizarCusto(e.target.checked)} />
          <span><b>Atualizar o custo dos produtos</b> com o custo desta entrada (média ou último custo, como nas compras, conforme as configurações de estoque). Deixe desmarcado em correções de saldo.</span></label>
      )}
      <Bloco icone="notas" titulo={<>Anote as <b>observações</b> do ajuste</>}>
        <textarea rows={3} className="campo h-auto" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: inventário, quebra, uso interno" />
      </Bloco>
      <div className="sticky bottom-0 z-10 mt-3 border-t bg-white px-4 py-3">
        <Erro r={r} />
        <div className="flex items-center gap-3"><span className="text-[13px]">Valor total <b className="text-[16px]">{brl(total)}</b></span>
          <Link href="/estoque/ajustes" className="btn-sec ml-auto">Cancelar</Link><button className="btn px-5" disabled={pendente || !tipo}>{pendente ? "Salvando…" : "Cadastrar"}</button></div>
      </div>
    </form>
  );
}

/** Transferência entre lojas (depósitos): o saldo sai da origem e entra no destino. */
export function FormTransferencia({ depositos }: { depositos: { id: string; nome: string }[] }) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(salvarTransferenciaForm, null);
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [obs, setObs] = useState("");
  const [itens, setItens] = useState<{ produtoId: string; nome?: string; codigo?: string; unidade?: string; quantidade: string; custo: number }[]>([]);
  const up = (i: number, m: Partial<(typeof itens)[number]>) => setItens(itens.map((x, j) => (j === i ? { ...x, ...m } : x)));
  const total = itens.reduce((s, i) => s + n(i.quantidade) * i.custo, 0);
  return (
    <form action={acao}>
      <input type="hidden" name="dados" value={JSON.stringify({ origemDepositoId: origem, destinoDepositoId: destino, observacoes: obs, itens })} />
      <Bloco icone="lojas" titulo={<>Informe as <b>lojas</b> da transferência</>} subtitulo="Os produtos entram depois de escolher a origem e o destino.">
        <div className="grid items-end gap-3 sm:grid-cols-3">
          <Campo rotulo="Loja de origem" obrigatorio><select className="campo" value={origem} onChange={(e) => setOrigem(e.target.value)}><option value="">Selecione</option>{depositos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}</select></Campo>
          <Campo rotulo="Loja de destino" obrigatorio><select className="campo" value={destino} onChange={(e) => setDestino(e.target.value)}><option value="">Selecione</option>{depositos.filter((d) => d.id !== origem).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}</select></Campo>
          <Campo rotulo="Valor total (R$)"><input className="campo text-right font-semibold" readOnly value={n2(total)} /><span className="text-[11px] text-slate-500">Soma do custo dos itens.</span></Campo>
        </div>
      </Bloco>
      {origem && destino && (
        <Bloco icone="produtos" titulo={<>Informe os <b>produtos</b> da transferência</>} corpo="p-0">
          <table className="tabela">
            <thead><tr><th className="min-w-72">Produto *</th><th className="w-28 text-right">Quantidade *</th><th className="w-20">Unidade</th><th className="w-28 text-right">Custo</th><th className="w-12"></th></tr></thead>
            <tbody>
              {itens.map((l, i) => (
                <tr key={i}>
                  <td><LinhaProduto item={l} onEscolher={(p) => up(i, { produtoId: p.id, nome: p.nome, codigo: p.codigo, unidade: p.unidade, custo: p.custo })} /></td>
                  <td><input className="campo text-right" value={l.quantidade} onChange={(e) => up(i, { quantidade: e.target.value })} /></td>
                  <td className="text-[12px]">{l.unidade}</td><td className="text-right">{n2(l.custo * n(l.quantidade))}</td>
                  <td><button type="button" className="btn-icone text-red-600" title="Remover" onClick={() => setItens(itens.filter((_, j) => j !== i))}><Icone nome="excluir" size={13} /></button></td>
                </tr>
              ))}
              {!itens.length && <tr><td colSpan={5} className="py-6 text-center text-slate-500">Nenhum produto na transferência</td></tr>}
            </tbody>
          </table>
          <div className="p-3"><button type="button" className="btn-sec" onClick={() => setItens([...itens, { produtoId: "", quantidade: "1", custo: 0 }])}><Icone nome="mais" size={14} /> Adicionar produto</button></div>
        </Bloco>
      )}
      <Bloco icone="notas" titulo={<>Registre <b>observações internas</b></>} subtitulo="Saem na impressão A4.">
        <textarea rows={3} className="campo h-auto" value={obs} onChange={(e) => setObs(e.target.value)} />
      </Bloco>
      <div className="sticky bottom-0 z-10 mt-3 border-t bg-white px-4 py-3">
        <Erro r={r} />
        <div className="flex items-center gap-3"><span className="text-[13px]">Valor total <b className="text-[16px]">{brl(total)}</b></span>
          <Link href="/estoque/transferencias" className="btn-sec ml-auto">Cancelar</Link><button className="btn px-5" disabled={pendente}>{pendente ? "Salvando…" : "Cadastrar"}</button></div>
      </div>
    </form>
  );
}

/** Novo inventário: quem conta, quais produtos entram e as regras da contagem. */
export function FormInventario({ usuarios, grupos, usuarioAtual }: { usuarios: { id: string; nome: string }[]; grupos: { id: string; nome: string }[]; usuarioAtual: { id: string; nome: string } }) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(salvarInventarioForm, null);
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [d, setD] = useState<DadosInventario>({ descricao: "", responsavelId: usuarioAtual.id, responsavelNome: usuarioAtual.nome, data: hoje, motivo: "", escopo: "TODOS", filtroIds: [], contagemCega: true, somarLeituras: true, considerarMovimento: true });
  const [escolhidos, setEscolhidos] = useState<{ id: string; nome: string }[]>([]);
  const [resumo, setResumo] = useState<{ produtos: number; grupos: number; unidades: number; valor: number } | null>(null);
  const set = <K extends keyof DadosInventario>(k: K, v: DadosInventario[K]) => setD((x) => ({ ...x, [k]: v }));
  useEffect(() => { let vivo = true; resumoInventarioAcao(d.escopo, d.filtroIds).then((x) => vivo && setResumo(x)); return () => { vivo = false; }; }, [d.escopo, d.filtroIds]);
  const toggle = (k: keyof DadosInventario, titulo: string, texto: string) => (
    <label className="flex items-start gap-3 rounded border border-slate-200 p-3"><input type="checkbox" checked={!!d[k]} onChange={(e) => set(k, e.target.checked as never)} className="chave mt-0.5" /><span><b className="block text-[13px]">{titulo}</b><span className="text-[12px] text-slate-500">{texto}</span></span></label>
  );
  return (
    <form action={acao}>
      <input type="hidden" name="dados" value={JSON.stringify(d)} />
      <Bloco icone="editar" titulo={<>Defina o <b>inventário</b></>}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo rotulo="Descrição" obrigatorio className="lg:col-span-2"><input className="campo" value={d.descricao} onChange={(e) => set("descricao", e.target.value)} placeholder="Ex.: Inventário de fim de ano" autoFocus /></Campo>
          <Campo rotulo="Responsável pelo inventário" obrigatorio><select className="campo" value={d.responsavelId} onChange={(e) => { const u = usuarios.find((x) => x.id === e.target.value); setD((x) => ({ ...x, responsavelId: e.target.value, responsavelNome: u?.nome ?? "" })); }}>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></Campo>
          <Campo rotulo="Data do inventário" obrigatorio><input type="date" className="campo" value={d.data} onChange={(e) => set("data", e.target.value)} /></Campo>
          <Campo rotulo="Motivo do inventário" className="lg:col-span-4"><input className="campo" value={d.motivo} onChange={(e) => set("motivo", e.target.value)} /></Campo>
        </div>
      </Bloco>
      <Bloco icone="produtos" titulo={<>Escolha os <b>produtos que entram</b></>} subtitulo="Só produtos com controle de estoque.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Produtos" obrigatorio><select className="campo" value={d.escopo} onChange={(e) => { setD((x) => ({ ...x, escopo: e.target.value as DadosInventario["escopo"], filtroIds: [] })); setEscolhidos([]); }}>
            <option value="TODOS">Todos com controle de estoque</option><option value="GRUPOS">De grupos</option><option value="FORNECEDORES">De fornecedores</option><option value="PRODUTOS">Escolher produtos</option></select></Campo>
          {d.escopo === "GRUPOS" && <Campo rotulo="Grupos"><select className="campo" value="" onChange={(e) => { const g = grupos.find((x) => x.id === e.target.value); if (g && !d.filtroIds.includes(g.id)) { set("filtroIds", [...d.filtroIds, g.id]); setEscolhidos([...escolhidos, g]); } }}><option value="">+ Adicionar grupo</option>{grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select></Campo>}
          {(d.escopo === "FORNECEDORES" || d.escopo === "PRODUTOS") && (
            <div><span className="rotulo">{d.escopo === "FORNECEDORES" ? "Fornecedores" : "Produtos"}</span>
              <Busca<{ id: string; nome: string; codigo?: string }> url={(q) => (d.escopo === "PRODUTOS" ? `/api/itens/busca?tipo=produto&q=${encodeURIComponent(q)}` : `/api/pessoas?papel=fornecedor&q=${encodeURIComponent(q)}`)} valor={null} rotulo={(p) => p.nome}
                linha={(p) => <span>{p.codigo && <span className="font-mono text-[11px] text-slate-500">{p.codigo} </span>}{p.nome}</span>}
                onEscolher={(p) => { if (p && !d.filtroIds.includes(p.id)) { set("filtroIds", [...d.filtroIds, p.id]); setEscolhidos([...escolhidos, p]); } }} /></div>
          )}
        </div>
        {escolhidos.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{escolhidos.map((x) => <span key={x.id} className="pilula border-slate-300 bg-slate-50">{x.nome}<button type="button" className="ml-1 text-red-600" onClick={() => { set("filtroIds", d.filtroIds.filter((y) => y !== x.id)); setEscolhidos(escolhidos.filter((y) => y.id !== x.id)); }}>×</button></span>)}</div>}
        <div className="mt-3 grid gap-3 sm:grid-cols-4">{([["Produtos que entram", resumo?.produtos], ["Grupos", resumo?.grupos], ["Unidades em estoque", resumo?.unidades?.toLocaleString("pt-BR")], ["Valor a custo", resumo ? brl(resumo.valor) : undefined]] as [string, unknown][]).map(([t, v]) => (
          <div key={t} className="rounded border border-slate-200 p-3"><div className="text-[12px] text-slate-500">{t}</div><div className="text-[18px] font-semibold">{v == null ? "…" : String(v)}</div></div>
        ))}</div>
      </Bloco>
      <Bloco icone="ajustes" titulo={<>Ajuste as <b>regras da contagem</b></>}>
        <div className="grid gap-3 lg:grid-cols-3">
          {toggle("contagemCega", "Contagem cega", "Quem conta não vê o saldo do sistema.")}
          {toggle("somarLeituras", "Somar leituras repetidas", "Cada leitura do mesmo código soma 1 (ou a quantidade informada).")}
          {toggle("considerarMovimento", "Considerar entradas e saídas durante a contagem", "O que entrar ou sair depois do início é somado à contagem ao concluir.")}
        </div>
      </Bloco>
      <div className="sticky bottom-0 z-10 mt-3 border-t bg-white px-4 py-3">
        <Erro r={r} />
        <div className="flex items-center gap-3"><Link href="/estoque/inventarios" className="btn-sec ml-auto">Cancelar</Link><button className="btn px-5" disabled={pendente}>{pendente ? "Criando…" : "Começar inventário"}</button></div>
      </div>
    </form>
  );
}

/** Zerar estoque: gera um ajuste de saída com todo o saldo positivo. Pede para digitar ZERAR. */
export function FormZerar({ produtos, unidades }: { produtos: number; unidades: number }) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(zerarEstoqueAcao, null);
  return (
    <form action={acao} className="cartao max-w-2xl space-y-3 p-5">
      <div className="rounded border border-red-200 bg-red-50 p-3 text-[13px] text-red-800">
        <b>Atenção:</b> {produtos.toLocaleString("pt-BR")} produto(s) com {unidades.toLocaleString("pt-BR")} unidade(s) em estoque vão ficar com saldo zero. O sistema gera um ajuste de saída com tudo, e você pode desfazer depois com um ajuste de entrada (clonando o ajuste gerado).
      </div>
      <Campo rotulo="Observação"><input name="observacao" className="campo" defaultValue="Estoque zerado" /></Campo>
      <Campo rotulo="Digite ZERAR para confirmar" obrigatorio><input name="confirmacao" className="campo" autoComplete="off" /></Campo>
      <Erro r={r} />
      <div className="flex gap-2"><Link href="/estoque/ajustes" className="btn-sec">Cancelar</Link><button className="btn bg-red-600 hover:bg-red-700" disabled={pendente}>{pendente ? "Zerando…" : "Zerar estoque"}</button></div>
    </form>
  );
}

/** Leitor do inventário: código de barras ou código, com quantidade (padrão 1). */
export function LeitorInventario({ id }: { id: string }) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(lerCodigoAcao, null);
  return (
    <form action={acao} className="flex flex-wrap items-end gap-2" key={r?.ok ? r.mensagem + Date.now() : "f"}>
      <input type="hidden" name="id" value={id} />
      <Campo rotulo="Código de barras ou código" className="min-w-64 flex-1"><input name="codigo" className="campo" autoFocus autoComplete="off" placeholder="Leia o código e tecle Enter" /></Campo>
      <Campo rotulo="Quantidade" className="w-28"><input name="quantidade" className="campo text-right" defaultValue="1" /></Campo>
      <button className="btn" disabled={pendente}><Icone nome="mais" size={14} /> Registrar</button>
      {r && <span className={`w-full text-[13px] ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.ok ? "✓ " : ""}{r.mensagem}</span>}
    </form>
  );
}

/** Contagem digitada do inventário: um campo por produto, salvo de uma vez. */
export function ContagemInventario({ id, cega, itens }: { id: string; cega: boolean; itens: { id: string; codigo: string; nome: string; unidade: string; saldo: number; contado: number | null }[] }) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(registrarContagemAcao, null);
  const [filtro, setFiltro] = useState("");
  const f = filtro.trim().toLowerCase();
  return (
    <form action={acao}>
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center gap-2 p-3">
        <input className="campo w-72" placeholder="Filtrar por código ou nome" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        {r && <span className={`text-[13px] ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.mensagem}</span>}
        <button className="btn ml-auto" disabled={pendente}>{pendente ? "Salvando…" : "Salvar contagem"}</button>
      </div>
      <div className="max-h-[60vh] overflow-auto">
        <table className="tabela">
          <thead><tr><th className="w-32">Código</th><th>Produto</th>{!cega && <th className="w-28 text-right">Saldo</th>}<th className="w-32 text-right">Contado</th>{!cega && <th className="w-28 text-right">Diferença</th>}</tr></thead>
          <tbody>{itens.map((i) => {
            const some = f && !i.codigo.toLowerCase().includes(f) && !i.nome.toLowerCase().includes(f);
            const dif = i.contado == null ? null : i.contado - i.saldo;
            return (
              <tr key={i.id} className={some ? "hidden" : ""}>
                <td className="font-mono text-[12px]">{i.codigo}</td><td>{i.nome}</td>
                {!cega && <td className="text-right">{i.saldo.toLocaleString("pt-BR")} {i.unidade}</td>}
                <td><input key={`${i.id}-${i.contado}`} name={`c_${i.id}`} className="campo text-right" defaultValue={i.contado == null ? "" : String(i.contado).replace(".", ",")} placeholder="—" /></td>
                {!cega && <td className={`text-right ${dif == null ? "text-slate-400" : dif < 0 ? "text-red-600" : dif > 0 ? "text-emerald-700" : ""}`}>{dif == null ? "—" : (dif > 0 ? "+" : "") + dif.toLocaleString("pt-BR")}</td>}
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </form>
  );
}
