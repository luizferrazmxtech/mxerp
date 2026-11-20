"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import Icone from "@/components/Icone";
import { Bloco, Campo } from "@/components/ui/Pagina";
import Busca from "@/components/ui/Busca";
import LinhaItemBusca, { fundoEstoque } from "./LinhaItemBusca";
import { gerarCodigoAcao, salvarProdutoForm, type Resultado } from "@/lib/itens/acoes";
import { ORIGENS, PRODUTOS_ESPECIFICOS, lerNumero, lucroDe, valorSugerido, type DadosProduto } from "@/lib/itens/tipos";
import type { LinhaEstoque } from "@/lib/estoque/consultas";
import AbasVerticais, { Ajuda, Fotos, LinhaToggle, SimNao } from "./AbasVerticais";
import BuscaFornecedor from "./BuscaFornecedor";

export type InicialProduto = DadosProduto & { id?: string; fotos: string[] };
type Opcoes = {
  grupos: { id: string; nome: string }[]; unidades: { sigla: string; nome: string }[];
  tiposValor: { id: string; nome: string; lucro: number }[]; locais: { id: string; codigo: string; deposito: string }[];
  depositos: { id: string; nome: string; quantidade: number }[]; lojas: { id: string; nome: string; cnpj: string }[];
  campos: { id: string; nome: string }[];
};

const ABAS = [
  { chave: "dados", titulo: "Dados", sub: "Nome, códigos e configurações", icone: "editar" },
  { chave: "detalhes", titulo: "Detalhes", sub: "Pesos, dimensões e campos extras", icone: "detalhes" },
  { chave: "valores", titulo: "Valores", sub: "Custo e valores de venda", icone: "valor" },
  { chave: "estoque", titulo: "Estoque", sub: "Quantidades e limites por loja", icone: "estoque" },
  { chave: "fotos", titulo: "Fotos", sub: "Imagens do produto", icone: "foto" },
  { chave: "fiscal", titulo: "Fiscal", sub: "NCM, CEST, origem e regras", icone: "fiscal" },
  { chave: "fornecedores", titulo: "Fornecedores", sub: "Quem fornece este produto", icone: "fornecedores" },
  { chave: "lojas", titulo: "Lojas", sub: "Onde o produto fica disponível", icone: "lojas" },
];
const n2 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FormProduto({ inicial, op }: { inicial: InicialProduto; op: Opcoes }) {
  const [d, setD] = useState(inicial);
  const [aba, setAba] = useState("dados");
  const [estado, acao, pendente] = useActionState<Resultado, FormData>(salvarProdutoForm, null);
  const [removidas, setRemovidas] = useState<string[]>([]);
  const set = <K extends keyof InicialProduto>(k: K, v: InicialProduto[K]) => setD((x) => ({ ...x, [k]: v }));
  const custoFinal = (lerNumero(d.custo) ?? 0) + (lerNumero(d.despesasAcessorias) ?? 0) + (lerNumero(d.outrasDespesas) ?? 0);
  const setValor = (i: number, m: Partial<DadosProduto["valores"][number]>) => set("valores", d.valores.map((v, j) => (j === i ? { ...v, ...m } : v)));
  const un = d.unidade || "UN";

  return (
    <form action={acao}>
      <input type="hidden" name="dados" value={JSON.stringify(d)} />
      <input type="hidden" name="ordemFotos" value={d.fotos.join(",")} />
      {removidas.map((r) => <input key={r} type="hidden" name="removerFoto" value={r} />)}
      <div className="grid gap-4 lg:grid-cols-[230px_1fr]">
        <div><AbasVerticais abas={ABAS} ativa={aba} onTrocar={setAba} /></div>
        <div>
          {/* ------------------------------ Dados */}
          <div hidden={aba !== "dados"}>
            <Bloco icone="editar" titulo={<>Informe os <b>dados principais</b> do produto</>}>
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                <Campo rotulo="Nome" obrigatorio className="lg:col-span-2"><input className="campo" required value={d.nome} onChange={(e) => set("nome", e.target.value)} autoFocus={!d.id} /></Campo>
                <div>
                  <span className="rotulo obrig">Código interno</span>
                  <div className="flex"><input className="campo rounded-r-none" value={d.codigo} onChange={(e) => set("codigo", e.target.value)} />
                    <button type="button" className="btn-sec rounded-l-none border-l-0 px-2 text-[12px]" onClick={async () => set("codigo", await gerarCodigoAcao())}><Icone nome="atualizar" size={13} /> Gerar</button></div>
                </div>
                <div>
                  <span className="rotulo">Código de barra <Ajuda texto="GTIN/EAN que vem na embalagem. O leitor do PDV acha o produto por ele." /></span>
                  <input className="campo" value={d.gtin} onChange={(e) => set("gtin", e.target.value.replace(/\s/g, ""))} />
                </div>
                <Campo rotulo="Grupo do produto">
                  <select className="campo" value={d.grupoId} onChange={(e) => set("grupoId", e.target.value)}>
                    <option value="">Selecione</option>{op.grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
                  </select>
                </Campo>
                <div><span className="rotulo">Movimenta estoque? <Ajuda texto="Não: o produto é vendido sem controle de quantidade (ex.: taxa, item sob encomenda)." /></span><SimNao valor={d.controlaEstoque} onChange={(v) => set("controlaEstoque", v)} /></div>
                <div><span className="rotulo">Habilitar nota fiscal? <Ajuda texto="Não: o produto não entra nas notas fiscais." /></span><SimNao valor={d.emiteNota} onChange={(v) => set("emiteNota", v)} /></div>
                <div><span className="rotulo">Possui variações? <Ajuda texto="Sim: cadastre a grade (cor, tamanho…) de variações do produto." /></span><SimNao valor={d.possuiVariacoes} onChange={(v) => set("possuiVariacoes", v)} /></div>
                <div><span className="rotulo">Possui composição? <Ajuda texto="Sim: o produto é um kit formado por outros produtos; o estoque baixa dos componentes." /></span><SimNao valor={d.possuiComposicao} onChange={(v) => set("possuiComposicao", v)} /></div>
              </div>
              {d.possuiVariacoes && (
                <div className="mt-4 rounded border border-slate-200 p-3">
                  <div className="mb-2 text-[13px] font-semibold">Variações</div>
                  {d.variacoes.map((v, i) => (
                    <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                      <input className="campo" placeholder="Variação (ex.: Preto / M)" value={v.nome} onChange={(e) => set("variacoes", d.variacoes.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} />
                      <input className="campo" placeholder="Código" value={v.codigo} onChange={(e) => set("variacoes", d.variacoes.map((x, j) => (j === i ? { ...x, codigo: e.target.value } : x)))} />
                      <input className="campo" placeholder="Código de barras" value={v.gtin} onChange={(e) => set("variacoes", d.variacoes.map((x, j) => (j === i ? { ...x, gtin: e.target.value } : x)))} />
                      <button type="button" className="btn-icone text-red-600" onClick={() => set("variacoes", d.variacoes.filter((_, j) => j !== i))}><Icone nome="excluir" size={13} /></button>
                    </div>
                  ))}
                  <button type="button" className="btn-sec" onClick={() => set("variacoes", [...d.variacoes, { nome: "", codigo: "", gtin: "" }])}><Icone nome="mais" size={14} /> Adicionar variação</button>
                </div>
              )}
              {d.possuiComposicao && (
                <div className="mt-4 rounded border border-slate-200 p-3">
                  <div className="mb-2 text-[13px] font-semibold">Composição (kit)</div>
                  {d.componentes.map((c, i) => (
                    <div key={i} className="mb-2 flex items-center gap-2 text-[13px]">
                      <span className="flex-1">{c.nome}</span>
                      <input className="campo w-28 text-right" value={c.quantidade} onChange={(e) => set("componentes", d.componentes.map((x, j) => (j === i ? { ...x, quantidade: e.target.value } : x)))} />
                      <button type="button" className="btn-icone text-red-600" onClick={() => set("componentes", d.componentes.filter((_, j) => j !== i))}><Icone nome="excluir" size={13} /></button>
                    </div>
                  ))}
                  <Busca<LinhaEstoque> url={(q) => `/api/produtos?q=${encodeURIComponent(q)}`} valor={null} limparAoEscolher placeholder="Buscar componente"
                    rotulo={(p) => p.nome} larguraMin={480} classeLinha={(p) => fundoEstoque(p.situacao)} linha={(p) => <LinhaItemBusca codigo={p.codigo} nome={p.nome} unidade={p.unidade} disponivel={p.disponivel} situacao={p.situacao} minimo={p.minimo} />}
                    onEscolher={(p) => p && set("componentes", [...d.componentes, { componenteId: p.id, nome: p.nome, quantidade: "1" }])} />
                </div>
              )}
            </Bloco>
            <Bloco icone="etiqueta" titulo={<>Defina a <b>unidade de medida</b> do produto</>}>
              <LinhaToggle titulo="Compro em uma unidade e vendo em outra" texto="Ex.: compra a caixa de 305 metros e vende por metro. A entrada da nota converte sozinha." ligado={d.converte} onChange={(v) => set("converte", v)} />
              <div className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                <Campo rotulo={d.converte ? "Unidade de venda" : "Unidade de medida"} obrigatorio>
                  <input className="campo" list="unidades" value={d.unidade} onChange={(e) => set("unidade", e.target.value.toUpperCase())} />
                </Campo>
                {d.converte && (
                  <>
                    <Campo rotulo="Unidade de compra" obrigatorio><input className="campo" list="unidades" value={d.unidadeCompra} onChange={(e) => set("unidadeCompra", e.target.value.toUpperCase())} /></Campo>
                    <div className="lg:col-span-2">
                      <span className="rotulo obrig">Quantas unidades de venda tem 1 unidade de compra</span>
                      <div className="flex items-center gap-2 text-[13px]">1 {d.unidadeCompra || "CX"} = <input className="campo w-28 text-right" value={d.fatorConversao} onChange={(e) => set("fatorConversao", e.target.value)} /> {un}</div>
                    </div>
                  </>
                )}
              </div>
              {d.id && (
                <p className="mt-2 text-[12px] text-slate-500">Mudou a conversão de um produto que já tem compras? Se o custo não for alterado aqui, ele é recalculado pelo novo fator ao salvar.
                  Para corrigir também as compras já lançadas e o estoque que entrou por elas, use <a href={`/produtos/${d.id}?aba=estoque&acao=conversao`} className="text-marca hover:underline">Alterar conversão</a> na tela do produto.</p>
              )}
              <datalist id="unidades">{op.unidades.map((u) => <option key={u.sigla} value={u.sigla}>{u.nome}</option>)}</datalist>
            </Bloco>
          </div>

          {/* ------------------------------ Detalhes */}
          <div hidden={aba !== "detalhes"}>
            <Bloco icone="ajustes" titulo={<>Defina as <b>regras de venda</b> do produto</>}>
              <div className="grid gap-3 lg:grid-cols-2">
                <LinhaToggle titulo="Produto ativo" texto="Inativo, o produto deixa de aparecer nas vendas e buscas." ligado={d.ativo} onChange={(v) => set("ativo", v)} />
                <LinhaToggle titulo="Vendido separadamente" texto="Pode ser vendido sozinho, e não só como parte de uma composição." ligado={d.vendidoSeparadamente} onChange={(v) => set("vendidoSeparadamente", v)} />
                <LinhaToggle titulo="Comercializável no PDV" texto="Aparece no PDV para venda no balcão." ligado={d.vendePdv} onChange={(v) => set("vendePdv", v)} />
                <Campo rotulo="Comissão do vendedor (%)"><input className="campo text-right" value={d.comissao} onChange={(e) => set("comissao", e.target.value)} /></Campo>
              </div>
            </Bloco>
            <Bloco icone="auxiliares" titulo={<>Adicione <b>campos extras</b> ao produto</>} subtitulo="Marca, modelo, cor, voltagem... Ex.: Marca → Adidas.">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {op.campos.map((c) => <Campo key={c.id} rotulo={c.nome}><input className="campo" value={d.camposExtras[c.id] ?? ""} onChange={(e) => set("camposExtras", { ...d.camposExtras, [c.id]: e.target.value })} /></Campo>)}
              </div>
              <Link href="/campos-extras?entidade=PRODUTO" className="btn-sec mt-3"><Icone nome="mais" size={14} /> Adicionar campo extra</Link>
            </Bloco>
            <Bloco icone="frete" titulo={<>Informe <b>pesos e dimensões</b></>} subtitulo="Usados no cálculo de frete e na nota fiscal.">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Campo rotulo="Peso (kg)"><input className="campo text-right" value={d.peso} onChange={(e) => set("peso", e.target.value)} /></Campo>
                <Campo rotulo="Largura (m)"><input className="campo text-right" value={d.largura} onChange={(e) => set("largura", e.target.value)} /></Campo>
                <Campo rotulo="Altura (m)"><input className="campo text-right" value={d.altura} onChange={(e) => set("altura", e.target.value)} /></Campo>
                <Campo rotulo="Comprimento (m)"><input className="campo text-right" value={d.comprimento} onChange={(e) => set("comprimento", e.target.value)} /></Campo>
              </div>
            </Bloco>
            <Bloco icone="notas" titulo={<>Escreva a <b>descrição</b> do produto</>}>
              <textarea rows={4} className="campo" value={d.descricao} onChange={(e) => set("descricao", e.target.value)} />
            </Bloco>
          </div>

          {/* ------------------------------ Valores */}
          <div hidden={aba !== "valores"}>
            <Bloco icone="dinheiro" titulo={<><b>Custo</b> do produto</>}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Campo rotulo={`Valor de custo (R$ por ${un})`}><input className="campo text-right" value={d.custo} onChange={(e) => set("custo", e.target.value)} /></Campo>
                <Campo rotulo="Despesas acessórias (R$)"><input className="campo text-right" value={d.despesasAcessorias} onChange={(e) => set("despesasAcessorias", e.target.value)} /></Campo>
                <Campo rotulo="Outras despesas (R$)"><input className="campo text-right" value={d.outrasDespesas} onChange={(e) => set("outrasDespesas", e.target.value)} /></Campo>
                <Campo rotulo="Custo final (R$)"><input className="campo text-right font-semibold" readOnly value={n2(custoFinal)} /></Campo>
              </div>
            </Bloco>
            <Bloco icone="valor" titulo={<>Defina os <b>valores de venda</b> do produto</>} corpo="p-0">
              <p className="mx-4 mt-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] text-slate-600"><b>Como funcionam os valores de venda:</b> o valor sugerido é o custo final mais o lucro do tipo de valor; o valor utilizado é o que vai para a venda. O valor marcado como padrão é o usado no PDV, vendas e OS.</p>
              <div className="overflow-x-auto p-4">
                <table className="tabela">
                  <thead><tr><th>Tipo</th><th className="text-right">Lucro sugerido (%)</th><th className="text-right">Lucro utilizado (%)</th><th className="text-right">Valor sugerido (R$)</th><th className="text-right">Valor utilizado (R$)</th><th>Situação</th><th></th></tr></thead>
                  <tbody>
                    {d.valores.map((v, i) => {
                      const sug = valorSugerido(custoFinal, lerNumero(v.lucroSugerido) ?? 0);
                      return (
                        <tr key={i}>
                          <td>
                            {v.tipoValorId ? v.nome : (
                              <select className="campo" value="" onChange={(e) => { const t = op.tiposValor.find((x) => x.id === e.target.value); if (t) setValor(i, { tipoValorId: t.id, nome: t.nome, lucroSugerido: String(t.lucro) }); }}>
                                <option value="">Selecione</option>{op.tiposValor.filter((t) => !d.valores.some((x) => x.tipoValorId === t.id)).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                              </select>
                            )}
                          </td>
                          <td className="text-right">{n2(lerNumero(v.lucroSugerido) ?? 0)}</td>
                          <td><input className="campo w-24 text-right" value={v.lucroUtilizado} onChange={(e) => setValor(i, { lucroUtilizado: e.target.value, valor: n2(valorSugerido(custoFinal, lerNumero(e.target.value) ?? 0)) })} /></td>
                          <td className="text-right">{n2(sug)}</td>
                          <td><input className="campo w-28 text-right font-semibold" value={v.valor} onChange={(e) => setValor(i, { valor: e.target.value, lucroUtilizado: n2(lucroDe(custoFinal, lerNumero(e.target.value) ?? 0)) })} /></td>
                          <td><select className="campo w-24" value={v.ativo ? "1" : "0"} onChange={(e) => setValor(i, { ativo: e.target.value === "1" })}><option value="1">Ativo</option><option value="0">Inativo</option></select></td>
                          <td><button type="button" className="btn-icone text-red-600" onClick={() => set("valores", d.valores.filter((_, j) => j !== i))}><Icone nome="excluir" size={13} /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="mt-3 flex gap-2">
                  <button type="button" className="btn-sec" onClick={() => set("valores", d.valores.map((v) => ({ ...v, lucroUtilizado: v.lucroSugerido, valor: n2(valorSugerido(custoFinal, lerNumero(v.lucroSugerido) ?? 0)) })))}><Icone nome="caixa" size={14} /> Calcular valor de venda</button>
                  <button type="button" className="btn-sec" disabled={d.valores.length >= op.tiposValor.length} onClick={() => set("valores", [...d.valores, { tipoValorId: "", nome: "", lucroSugerido: "0", lucroUtilizado: "0", valor: "0,00", ativo: true }])}><Icone nome="mais" size={14} /> Novo valor de venda</button>
                </div>
              </div>
            </Bloco>
          </div>

          {/* ------------------------------ Estoque */}
          <div hidden={aba !== "estoque"}>
            {op.depositos.map((dep) => (
              <Bloco key={dep.id} icone="estoque" titulo={<>Estoque em <b>{dep.nome}</b></>}>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Campo rotulo="Estoque mínimo"><div className="flex"><input className="campo rounded-r-none text-right" value={d.estoqueMinimo} onChange={(e) => set("estoqueMinimo", e.target.value)} /><span className="rounded-r border border-l-0 border-slate-300 bg-slate-50 px-2 py-[7px] text-[12px]">{un}</span></div></Campo>
                  <Campo rotulo="Estoque máximo"><div className="flex"><input className="campo rounded-r-none text-right" value={d.estoqueMaximo} onChange={(e) => set("estoqueMaximo", e.target.value)} /><span className="rounded-r border border-l-0 border-slate-300 bg-slate-50 px-2 py-[7px] text-[12px]">{un}</span></div></Campo>
                  {d.id ? (
                    <Campo rotulo="Quantidade atual"><div className="flex"><input className="campo rounded-r-none text-right" readOnly value={dep.quantidade.toLocaleString("pt-BR")} /><span className="rounded-r border border-l-0 border-slate-300 bg-slate-50 px-2 py-[7px] text-[12px]">{un}</span></div></Campo>
                  ) : (
                    <Campo rotulo="Quantidade atual"><div className="flex"><input className="campo rounded-r-none text-right" value={d.quantidadeInicial} onChange={(e) => set("quantidadeInicial", e.target.value)} disabled={!d.controlaEstoque} /><span className="rounded-r border border-l-0 border-slate-300 bg-slate-50 px-2 py-[7px] text-[12px]">{un}</span></div></Campo>
                  )}
                </div>
                {d.id && <p className="mt-2 text-[11px] text-slate-500">Para mudar a quantidade use Estoque › ajuste, assim fica registrado nas movimentações.</p>}
              </Bloco>
            ))}
            <Bloco icone="locais" titulo={<>Defina a <b>prateleira</b> do produto</>} subtitulo="Local onde o produto fica guardado; as entradas vão para ele.">
              <select className="campo max-w-md" value={d.localId} onChange={(e) => set("localId", e.target.value)}>
                <option value="">Sem local definido</option>{op.locais.map((l) => <option key={l.id} value={l.id}>{l.deposito} · {l.codigo}</option>)}
              </select>
            </Bloco>
          </div>

          {/* ------------------------------ Fotos */}
          <div hidden={aba !== "fotos"}>
            <Bloco icone="foto" titulo={<>Adicione as <b>fotos</b> do produto</>}>
              <Fotos existentes={d.fotos} url={(id) => `/api/cadastros/anexo/${id}`} onOrdem={(ids) => set("fotos", ids)}
                onRemover={(id) => { set("fotos", d.fotos.filter((x) => x !== id)); setRemovidas((r) => [...r, id]); }} />
            </Bloco>
          </div>

          {/* ------------------------------ Fiscal */}
          <div hidden={aba !== "fiscal"}>
            <Bloco icone="fiscal" titulo={<>Informe os <b>dados fiscais</b> do produto</>}>
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                <Campo rotulo="Cód. benefício"><input className="campo" value={d.codigoBeneficio} onChange={(e) => set("codigoBeneficio", e.target.value)} /></Campo>
                <Campo rotulo="NCM"><input className="campo" value={d.ncm} onChange={(e) => set("ncm", e.target.value)} /></Campo>
                <Campo rotulo="CEST"><input className="campo" value={d.cest} onChange={(e) => set("cest", e.target.value)} /></Campo>
                <Campo rotulo="Origem"><select className="campo" value={d.origem} onChange={(e) => set("origem", e.target.value)}>{ORIGENS.map((o, i) => <option key={i} value={i}>{o}</option>)}</select></Campo>
                <Campo rotulo="Peso líquido (kg)"><input className="campo text-right" value={d.pesoLiquido} onChange={(e) => set("pesoLiquido", e.target.value)} /></Campo>
                <Campo rotulo="Peso bruto (kg)"><input className="campo text-right" value={d.pesoBruto} onChange={(e) => set("pesoBruto", e.target.value)} /></Campo>
                <Campo rotulo="Número FCI"><input className="campo" value={d.numeroFci} onChange={(e) => set("numeroFci", e.target.value)} /></Campo>
                <Campo rotulo="Produto específico"><select className="campo" value={d.produtoEspecifico || "Não usar"} onChange={(e) => set("produtoEspecifico", e.target.value)}>{PRODUTOS_ESPECIFICOS.map((o) => <option key={o}>{o}</option>)}</select></Campo>
              </div>
            </Bloco>
            <Bloco icone="ajustes" titulo={<>Defina as <b>regras fiscais</b> do produto</>} subtitulo="A regra cadastrada aqui tem prioridade no cálculo dos impostos da nota.">
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                <Campo rotulo="CFOP dentro do estado"><input className="campo" value={d.cfopInterno} onChange={(e) => set("cfopInterno", e.target.value)} placeholder="5102" /></Campo>
                <Campo rotulo="CFOP fora do estado"><input className="campo" value={d.cfopExterno} onChange={(e) => set("cfopExterno", e.target.value)} placeholder="6102" /></Campo>
                <Campo rotulo="CSOSN (Simples)"><input className="campo" value={d.csosn} onChange={(e) => set("csosn", e.target.value)} placeholder="102" /></Campo>
                <Campo rotulo="CST ICMS"><input className="campo" value={d.cstIcms} onChange={(e) => set("cstIcms", e.target.value)} /></Campo>
                <Campo rotulo="Alíquota ICMS (%)"><input className="campo text-right" value={d.aliquotaIcms} onChange={(e) => set("aliquotaIcms", e.target.value)} /></Campo>
                <Campo rotulo="CST PIS"><input className="campo" value={d.cstPis} onChange={(e) => set("cstPis", e.target.value)} /></Campo>
                <Campo rotulo="CST COFINS"><input className="campo" value={d.cstCofins} onChange={(e) => set("cstCofins", e.target.value)} /></Campo>
                <Campo rotulo="cClassTrib (IBS/CBS)"><input className="campo" value={d.cClassTrib} onChange={(e) => set("cClassTrib", e.target.value)} /></Campo>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Em branco, vale a regra padrão da empresa. Regras por NCM e por grupo entram no módulo Fiscal.</p>
            </Bloco>
          </div>

          {/* ------------------------------ Fornecedores */}
          <div hidden={aba !== "fornecedores"}>
            <Bloco icone="fornecedores" titulo={<>Vincule os <b>fornecedores</b> do produto</>} subtitulo="Os produtos do fornecedor entram sozinhos na compra ou cotação.">
              {d.fornecedores.map((f, i) => (
                <div key={i} className="mb-2 flex items-center gap-2 text-[13px]">
                  <span className="flex-1">{f.nome}</span>
                  <input className="campo w-48" placeholder="Código no fornecedor" value={f.codigo} onChange={(e) => set("fornecedores", d.fornecedores.map((x, j) => (j === i ? { ...x, codigo: e.target.value } : x)))} />
                  <button type="button" className="btn-icone text-red-600" onClick={() => set("fornecedores", d.fornecedores.filter((_, j) => j !== i))}><Icone nome="excluir" size={13} /></button>
                </div>
              ))}
              {!d.fornecedores.length && <p className="mb-2 text-[13px] text-slate-500">Nenhum fornecedor vinculado.</p>}
              <div className="max-w-md"><BuscaFornecedor key={d.fornecedores.length} onEscolher={(p) => p && !d.fornecedores.some((x) => x.fornecedorId === p.id) && set("fornecedores", [...d.fornecedores, { fornecedorId: p.id, nome: p.nome, codigo: "" }])} /></div>
            </Bloco>
          </div>

          {/* ------------------------------ Lojas */}
          <div hidden={aba !== "lojas"}>
            <Bloco icone="lojas" titulo={<>Selecione as <b>lojas</b></>} subtitulo="Selecione ao menos uma loja" acoes={<span className="text-[12px] text-slate-500">{d.lojas.length} de {op.lojas.length} lojas selecionadas</span>}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {op.lojas.map((l) => {
                  const sel = d.lojas.includes(l.id);
                  return (
                    <button type="button" key={l.id} onClick={() => set("lojas", sel ? d.lojas.filter((x) => x !== l.id) : [...d.lojas, l.id])}
                      className={`flex items-center gap-3 rounded border p-3 text-left ${sel ? "border-marca bg-marca/5" : "border-slate-200"}`}>
                      <span className={`flex h-5 w-5 items-center justify-center rounded border ${sel ? "border-marca bg-marca text-white" : "border-slate-300"}`}>{sel && <Icone nome="ok" size={13} />}</span>
                      <span><b className="block text-[13px] uppercase">{l.nome}</b><span className="text-[11px] text-slate-500">{l.cnpj}{sel ? " · Disponível nesta loja" : ""}</span></span>
                    </button>
                  );
                })}
              </div>
            </Bloco>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-2px_6px_rgba(0,0,0,0.04)] md:-mx-5 md:px-5">
        {estado && !estado.ok && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-[13px] text-red-700">{estado.mensagem}</div>}
        <div className="flex items-center gap-3">
          <Link href={d.id ? `/produtos/${d.id}` : "/produtos"} className="btn-sec">Cancelar</Link>
          <button className="btn ml-auto px-5" disabled={pendente}>{pendente ? "Salvando…" : d.id ? "Salvar" : "Cadastrar"}</button>
        </div>
      </div>
    </form>
  );
}
