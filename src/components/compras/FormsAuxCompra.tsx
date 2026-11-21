"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import { useState } from "react";
import Icone from "@/components/Icone";
import { Bloco } from "@/components/ui/Pagina";
import { salvarConfigEstoqueAcao, salvarSituacaoCompraAcao, type Resultado } from "@/lib/compras/acoes";
import { CORES } from "@/lib/orcamentos/tipos";
import type { ConfigEstoque } from "@/lib/estoque/config";
import { PAPEIS, Radio, Rodape } from "@/components/orcamentos/FormsAuxOrc";

export type SituacaoCompraForm = { id: string; nome: string; cor: string; padrao: boolean; exibir: boolean; lancamento: string; permiteEdicao: boolean; bloqueados: string[] };

const SimNao = ({ name, valor, rotulo, dica }: { name: string; valor: boolean; rotulo: string; dica?: string }) => (
  <label><span className="rotulo">{rotulo}</span>
    <select name={name} defaultValue={valor ? "1" : "0"} className="campo"><option value="1">Sim</option><option value="0">Não</option></select>
    {dica && <span className="text-[11px] text-slate-500">{dica}</span>}</label>
);

/** Situação de compra (Gestão Click): o que ela lança — estoque e/ou financeiro. */
export function FormSituacaoCompra({ s, usada }: { s?: SituacaoCompraForm; usada: number }) {
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(salvarSituacaoCompraAcao, null);
  const [corSel, setCor] = useState(s?.cor ?? "cinza");
  const [lanc, setLanc] = useState(s?.lancamento ?? "NAO");
  const [bloq, setBloq] = useState<string[]>(s?.bloqueados ?? []);
  const livres = PAPEIS.filter(([p]) => !bloq.includes(p));
  const travado = usada > 0;
  return (
    <form {...formAcao}>
      {s && <input type="hidden" name="id" value={s.id} />}
      <Bloco icone="editar" titulo={<>Informe a <b>situação</b> da compra</>} subtitulo="Nome, cor, se é a padrão das compras novas e se aparece na listagem.">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <label><span className="rotulo obrig">Nome</span><input name="nome" defaultValue={s?.nome} required autoFocus maxLength={60} className="campo" /></label>
          <div><span className="rotulo">Cor</span><input type="hidden" name="cor" value={corSel} />
            <div className="flex h-[34px] items-center gap-1.5">{Object.entries(CORES).map(([k, c]) => (
              <button key={k} type="button" title={c.rotulo} onClick={() => setCor(k)} className={`h-6 w-6 rounded-full ${c.ponto} ${corSel === k ? "ring-2 ring-marca ring-offset-2" : ""}`} />
            ))}</div></div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <SimNao name="padrao" valor={!!s?.padrao} rotulo="Situação padrão" dica="Vem marcada nas compras novas." />
          <SimNao name="exibir" valor={s?.exibir ?? true} rotulo="Exibir na listagem" dica="Com Não, as compras ficam ocultas da lista." />
          <SimNao name="permiteEdicao" valor={s?.permiteEdicao ?? true} rotulo="Permite edição" dica="Com Não, a compra fica travada." />
        </div>
      </Bloco>

      <Bloco icone="urgente" titulo={<>Defina o que a situação <b>lança</b></>} subtitulo="O que acontece quando uma compra entra nesta situação.">
        {travado && <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-[12px] text-amber-800">{usada} compra(s) estão nesta situação: o lançamento não pode mudar. Crie uma situação nova e mova as compras, se precisar.</p>}
        <input type="hidden" name="lancamento" value={lanc} />
        <div className={`grid gap-2 sm:grid-cols-2 ${travado ? "pointer-events-none opacity-60" : ""}`}>
          <Radio name="_l" valor="NAO" atual={lanc} titulo="Não lança" onChange={setLanc}>Nada entra no estoque nem no financeiro (e o que entrou sai).</Radio>
          <Radio name="_l" valor="AMBOS" atual={lanc} titulo="Lança estoque e financeiro" onChange={setLanc}>As peças entram no estoque e as parcelas viram contas a pagar.</Radio>
          <Radio name="_l" valor="ESTOQUE" atual={lanc} titulo="Lança somente estoque" onChange={setLanc}>As peças entram; o financeiro fica para depois.</Radio>
          <Radio name="_l" valor="FINANCEIRO" atual={lanc} titulo="Lança somente financeiro" onChange={setLanc}>As contas a pagar são geradas; a mercadoria ainda não chegou.</Radio>
        </div>
      </Bloco>

      <Bloco icone="senha" titulo={<>Bloqueie <b>grupos de usuários</b> nesta situação</>} subtitulo="Quem está no grupo não consegue trocar a situação nem editar a compra."
        acoes={livres.length > 0 ? (
          <select value="" onChange={(e) => e.target.value && setBloq([...bloq, e.target.value])} className="campo h-8 w-44 text-[12px]">
            <option value="">+ Bloquear grupo</option>{livres.map(([p, n]) => <option key={p} value={p}>{n}</option>)}
          </select>) : undefined}>
        {bloq.length === 0 ? <p className="text-[13px] text-slate-500">Nenhum grupo bloqueado.</p> : (
          <ul className="divide-y rounded border">{bloq.map((p) => (
            <li key={p} className="flex items-center px-3 py-2"><input type="hidden" name="bloqueados" value={p} />{PAPEIS.find((x) => x[0] === p)?.[1]}
              <button type="button" onClick={() => setBloq(bloq.filter((x) => x !== p))} className="ml-auto text-red-600" title="Remover"><Icone nome="excluir" size={15} /></button></li>
          ))}</ul>)}
      </Bloco>
      <Rodape r={r} pendente={pendente} voltar="/compras/situacoes" editando={!!s} />
    </form>
  );
}

const DOCS: [string, string][] = [["numeroItem", "Número do item"], ["codigoProduto", "Código do produto"], ["unidade", "Unidade"], ["imagemProduto", "Imagem do produto"], ["ncm", "NCM"], ["valorUnitario", "Valor unitário"], ["subtotal", "Subtotal"]];

/** Configurações › Estoque (Gestão Click ?modulo=estoque). */
export function FormConfigEstoque({ c, ultimos }: { c: ConfigEstoque; ultimos: Record<"cotacao" | "compra" | "ajuste" | "transferencia", number> }) {
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(salvarConfigEstoqueAcao, null);
  const [nums, setNums] = useState(Object.fromEntries(Object.entries(ultimos).map(([k, v]) => [k, String(v)])) as Record<string, string>);
  const [lote, setLote] = useState(c.controleLote);
  const [aba, setAba] = useState<"compras" | "cotacoes">("compras");
  const sel = (name: string, valor: string, ops: [string, string][]) => <select name={name} defaultValue={valor} className="campo">{ops.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>;
  const chave = (name: string, valor: boolean, titulo: string, texto?: string) => (
    <label className="flex items-start gap-3 rounded border border-slate-200 p-3"><input type="checkbox" name={name} value="1" defaultChecked={valor} className="chave mt-0.5" /><span><b className="block text-[13px]">{titulo}</b>{texto && <span className="text-[12px] text-slate-500">{texto}</span>}</span></label>
  );
  const LOTE: [string, string][] = [["VENCER", "Primeiro a vencer sai primeiro"], ["ENTRAR", "Primeiro a entrar sai primeiro"], ["MANUAL", "Seleção manual pelo operador"]];
  return (
    <form {...formAcao}>
      <Bloco icone="dinheiro" titulo={<>Defina o <b>valor de custo</b> nas compras</>} subtitulo="Como o custo do produto muda quando uma compra lança o estoque.">
        <div className="max-w-md">{sel("custoCompra", c.custoCompra, [["MEDIA", "Média de todas as compras"], ["ULTIMA", "Valor da última compra"], ["NAO", "Não atualizar"]])}</div>
      </Bloco>
      <Bloco icone="locais" titulo={<>Controle o estoque por <b>lote e localização</b></>}>
        <div className="grid gap-3 lg:grid-cols-2">
          <label className="flex items-start gap-3 rounded border border-slate-200 p-3"><input type="checkbox" name="controleLote" value="1" checked={lote} onChange={(e) => setLote(e.target.checked)} className="chave mt-0.5" /><span><b className="block text-[13px]">Controle de lote</b><span className="text-[12px] text-slate-500">Guarda lote e validade na entrada.</span></span></label>
          {chave("localizacao", c.localizacao, "Localização de estoque", "Campo de localização no produto, na etiqueta e no relatório (corredor, prateleira, nível).")}
        </div>
        {lote && <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label><span className="rotulo">Saída de lote no PDV</span>{sel("saidaLotePdv", c.saidaLotePdv, LOTE)}</label>
          <label><span className="rotulo">Seleção de lote nas vendas</span>{sel("loteVendas", c.loteVendas, LOTE)}</label>
        </div>}
        {!lote && <><input type="hidden" name="saidaLotePdv" value={c.saidaLotePdv} /><input type="hidden" name="loteVendas" value={c.loteVendas} /></>}
      </Bloco>
      <Bloco icone="email" titulo={<>Avisos de <b>cotações</b></>}>
        <label className="block max-w-md"><span className="rotulo">Cotações respondidas</span>{sel("avisoCotacao", c.avisoCotacao, [["AMBOS", "No sistema e por e-mail"], ["SISTEMA", "Somente no sistema"], ["EMAIL", "Somente por e-mail"], ["NAO", "Não receber"]])}</label>
      </Bloco>
      <Bloco icone="lista" titulo={<>Defina o <b>último número</b> de cada registro</>} subtitulo="O número vale só para a loja atual." corpo="p-0">
        <table className="tabela">
          <thead><tr><th>Registro</th><th className="w-48">Último número usado</th><th className="w-48">Próximo sai como</th></tr></thead>
          <tbody>{([["cotacao", "Cotações"], ["compra", "Compras"], ["ajuste", "Ajustes de estoque"], ["transferencia", "Transferências"]] as const).map(([k, t]) => (
            <tr key={k}><td>{t}</td><td><input name={`ultimo_${k}`} value={nums[k]} onChange={(e) => setNums({ ...nums, [k]: e.target.value.replace(/\D/g, "") })} className="campo h-8 w-32" inputMode="numeric" /></td>
              <td><span className="pilula border-slate-300 bg-slate-50 text-slate-700">Próximo · {Number(nums[k] || 0) + 1}</span></td></tr>
          ))}</tbody>
        </table>
      </Bloco>
      <Bloco icone="editar" titulo={<>Escreva os <b>textos padrão</b></>} subtitulo="Saem na impressão quando o documento não tem observação própria."
        acoes={<div className="flex gap-1">{(["compras", "cotacoes"] as const).map((a) => <button key={a} type="button" onClick={() => setAba(a)} className={`aba ${aba === a ? "aba-ativa" : ""}`}>{a === "compras" ? "Compras" : "Cotações"}</button>)}</div>}>
        <textarea name="textoCompras" defaultValue={c.textoCompras} rows={4} className={`campo h-auto ${aba === "compras" ? "" : "hidden"}`} placeholder="Texto padrão das compras" />
        <textarea name="textoCotacoes" defaultValue={c.textoCotacoes} rows={4} className={`campo h-auto ${aba === "cotacoes" ? "" : "hidden"}`} placeholder="Texto padrão das cotações (aparece na página do fornecedor)" />
      </Bloco>
      <Bloco icone="olho" titulo={<>Escolha o que aparece nos <b>documentos</b></>}>
        <div className="grid gap-1 sm:grid-cols-3">{DOCS.map(([k, t]) => <label key={k} className="flex items-center gap-2 py-1"><input type="checkbox" name={`doc_${k}`} value="1" defaultChecked={c.documentos[k]} className="chave" /> {t}</label>)}</div>
      </Bloco>
      <Bloco icone="importar" titulo={<>Ajuste a <b>importação do XML</b> na compra</>}>
        <div className="grid gap-3 lg:grid-cols-2">
          {chave("xmlFrete", c.xml.frete, "Considerar frete")}
          {chave("xmlDesconto", c.xml.desconto, "Considerar desconto")}
          {chave("xmlImpostos", c.xml.impostos, "Considerar impostos", "ICMS-ST, IPI, seguro e imposto de importação.")}
          {chave("xmlOutras", c.xml.outras, "Considerar outras despesas")}
        </div>
        <label className="mt-3 block max-w-md"><span className="rotulo">Vincular produtos por</span>{sel("vincularPor", c.xml.vincularPor, [["NOME", "Nome do produto"], ["CODIGO", "Código do produto"], ["AMBOS", "Código e nome"]])}</label>
      </Bloco>
      <Rodape r={r} pendente={pendente} voltar="/estoque" editando rotulo="Salvar configurações" />
    </form>
  );
}
