import Link from "next/link";
import { prisma } from "@/lib/db";
import { exigirArea } from "@/lib/auth/atual";
import { BASES_MARGEM, FILTROS_CUSTO, relatorioCustos, type ParamsCustos } from "@/lib/estoque/custos";
import { brl, data, qtd } from "@/lib/ui/format";
import { Pagina } from "@/components/ui/Pagina";
import Paginacao, { Ordenar, lerPagina } from "@/components/ui/Paginacao";
import { urlCom } from "@/components/ui/BarraLista";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Custos e margens" };

const VISOES = [
  { chave: "produtos", rotulo: "Por produto", icone: "produtos" },
  { chave: "fornecedores", rotulo: "Por fornecedor", icone: "fornecedores" },
  { chave: "compras", rotulo: "Compras (linha a linha)", icone: "carrinho" },
];
const r4 = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 }));
const pc = (v: number | null | undefined) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const corMargem = (m: number | null, lim: number) => (m == null ? "text-slate-400" : m < 0 ? "font-semibold text-red-600" : m < lim ? "text-amber-700" : "text-emerald-700");

/**
 * Custos e margens: o custo do cadastro ao lado do que as compras dizem (último, médio, menor, maior por unidade de venda,
 * já convertido de caixa para metro), margem e markup pela base escolhida, melhor fornecedor e as compras linha a linha.
 */
export default async function Custos({ searchParams }: { searchParams: Promise<ParamsCustos> }) {
  await exigirArea("/estoque/custos");
  const sp = await searchParams;
  const base = "/estoque/custos";
  const visao = VISOES.some((v) => v.chave === sp.visao) ? sp.visao! : "produtos";
  const [r, grupos, fornecedores] = await Promise.all([
    relatorioCustos(sp),
    prisma.grupoProduto.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.pessoa.findMany({ where: { compras: { some: {} } }, orderBy: { nome: "asc" }, select: { id: true, nome: true, fantasia: true } }),
  ]);
  const { pagina, porPagina, skip, take } = lerPagina(sp);
  const lista = visao === "fornecedores" ? r.fornecedores : visao === "compras" ? r.compras : r.linhas;
  const total = lista.length;
  const params = { ...sp, visao: visao === "produtos" ? undefined : visao };
  const hidden = (k: string) => sp[k] ? <input type="hidden" name={k} value={sp[k]} /> : null;

  return (
    <Pagina titulo="Custos e margens" icone="dinheiro" trilha={[{ rotulo: "Estoque", href: "/estoque" }, { rotulo: "Custos e margens" }]}
      acoes={<a href={urlCom(`${base}/csv`, { ...sp, visao }, {})} className="btn-sec"><Icone nome="exportar" size={14} /> Exportar CSV</a>}>
      <form action={base} className="cartao mb-3 grid items-end gap-3 p-3 text-[13px] sm:grid-cols-2 lg:grid-cols-6">
        {hidden("visao")}
        <label className="lg:col-span-2"><span className="rotulo">Produto</span><input name="q" defaultValue={sp.q} placeholder="Código, nome ou código de barras" className="campo" /></label>
        <label><span className="rotulo">Compras de</span><input type="date" name="de" defaultValue={r.de} className="campo" /></label>
        <label><span className="rotulo">até</span><input type="date" name="ate" defaultValue={r.ate} className="campo" /></label>
        <label><span className="rotulo">Grupo</span><select name="grupo" defaultValue={sp.grupo ?? ""} className="campo"><option value="">Todos</option>{grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select></label>
        <label><span className="rotulo">Fornecedor</span><select name="forn" defaultValue={sp.forn ?? ""} className="campo"><option value="">Todos</option>{fornecedores.map((f) => <option key={f.id} value={f.id}>{f.fantasia || f.nome}</option>)}</select></label>
        <label className="lg:col-span-2"><span className="rotulo">Mostrar</span><select name="filtro" defaultValue={sp.filtro ?? ""} className="campo">{FILTROS_CUSTO.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
        <label><span className="rotulo">Margem e markup sobre</span><select name="base" defaultValue={r.base} className="campo">{BASES_MARGEM.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
        <label><span className="rotulo">Limite de margem (%)</span><input name="margemMax" defaultValue={String(r.margemMax)} className="campo text-right" /></label>
        <label className="flex items-center gap-2 pb-2"><input type="checkbox" name="rateio" value="0" defaultChecked={!r.rateio} /> Sem frete/impostos no custo</label>
        <div className="flex gap-2"><button className="btn"><Icone nome="buscar" size={14} /> Aplicar</button><Link href={visao === "produtos" ? base : `${base}?visao=${visao}`} className="btn-sec">Limpar</Link></div>
      </form>

      <div className="mb-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {([
          ["Produtos", r.resumo.produtos.toLocaleString("pt-BR"), ""], ["Com compras no período", r.resumo.comCompras.toLocaleString("pt-BR"), ""],
          ["Sem custo no cadastro", r.resumo.semCusto.toLocaleString("pt-BR"), r.resumo.semCusto ? "text-red-600" : ""],
          ["Vendendo abaixo do custo", r.resumo.negativos.toLocaleString("pt-BR"), r.resumo.negativos ? "text-red-600" : ""],
          ["Margem média", pc(r.resumo.margemMedia), ""], ["Estoque a custo", brl(r.resumo.valorEstoque), ""],
        ] as [string, string, string][]).map(([t, v, c]) => <div key={t} className="cartao p-3"><div className="text-[12px] text-slate-500">{t}</div><div className={`text-[18px] font-semibold ${c}`}>{v}</div></div>)}
      </div>

      <nav className="mb-2 flex flex-wrap gap-1">
        {VISOES.map((v) => <Link key={v.chave} href={urlCom(base, sp, { visao: v.chave === "produtos" ? undefined : v.chave, p: undefined })} className={`aba ${visao === v.chave ? "aba-ativa" : ""}`}><Icone nome={v.icone} size={14} /> {v.rotulo}</Link>)}
      </nav>
      <p className="mb-2 text-[12px] text-slate-500">
        Custos por unidade de venda, já convertidos (ex.: caixa de 305 m → custo por metro){r.rateio ? ", com frete e impostos da nota rateados" : ""}. Compras recebidas de {data(r.de)} a {data(r.ate)}.
        Margem = (preço − custo) ÷ preço; markup = (preço − custo) ÷ custo.
      </p>

      <div className="cartao overflow-x-auto">
        {visao === "produtos" && (
          <table className="tabela text-[13px]">
            <thead><tr>
              <Ordenar base={base} params={params} campo="nome">Produto</Ordenar>
              <Ordenar base={base} params={params} campo="custo" className="text-right">Cadastro</Ordenar>
              <Ordenar base={base} params={params} campo="ultima" className="text-right">Último custo</Ordenar>
              <Ordenar base={base} params={params} campo="media" className="text-right">Médio</Ordenar>
              <th className="text-right">Menor / maior</th>
              <Ordenar base={base} params={params} campo="compras" className="text-right">Compras</Ordenar>
              <th className="text-right">Preço</th>
              <Ordenar base={base} params={params} campo="margem" className="text-right">Margem</Ordenar>
              <th className="text-right">Markup</th>
              <Ordenar base={base} params={params} campo="variacao" className="text-right">Última × média</Ordenar>
              <Ordenar base={base} params={params} campo="estoque" className="text-right">Estoque a custo</Ordenar>
            </tr></thead>
            <tbody>
              {r.linhas.slice(skip, skip + take).map((l) => (
                <tr key={l.id}>
                  <td><Link href={`/produtos/${l.id}?aba=estoque`} className="hover:underline">{l.nome}</Link>
                    <div className="text-[11px] text-slate-500"><span className="font-mono">{l.codigo}</span> · {l.unidade}{l.conversao && <> · <span className="text-marca">{l.conversao}</span></>}{l.grupo && ` · ${l.grupo}`}</div></td>
                  <td className={`text-right ${l.custoCadastro <= 0 ? "font-semibold text-red-600" : ""}`}>{l.custoCadastro > 0 ? r4(l.custoCadastro) : "sem custo"}
                    {l.divergencia != null && Math.abs(l.divergencia) > 15 && <div className="text-[11px] text-amber-700" title="Diferença entre o custo do cadastro e a última compra">{pc(l.divergencia)} da última</div>}</td>
                  <td className="text-right">{r4(l.ultima?.custo)}{l.ultima && <div className="text-[11px] text-slate-500">{data(l.ultima.data)} · {l.ultima.fornecedor}</div>}</td>
                  <td className="text-right">{r4(l.media)}</td>
                  <td className="text-right text-[12px]">{l.menor != null ? <>{r4(l.menor)}<br />{r4(l.maior)}</> : "—"}</td>
                  <td className="text-right">{l.nCompras || "—"}{l.nCompras > 0 && <div className="text-[11px] text-slate-500">{qtd(l.qtdComprada)} {l.unidade} · {l.nFornecedores} forn.</div>}</td>
                  <td className="text-right">{brl(l.preco)}</td>
                  <td className={`text-right ${corMargem(l.margem, r.margemMax)}`}>{pc(l.margem)}</td>
                  <td className="text-right">{pc(l.markup)}</td>
                  <td className={`text-right ${l.variacao != null && l.variacao > 0.5 ? "text-red-600" : l.variacao != null && l.variacao < -0.5 ? "text-emerald-700" : ""}`}>{l.variacao != null ? `${l.variacao > 0 ? "+" : ""}${pc(l.variacao)}` : "—"}</td>
                  <td className="text-right">{l.estoque ? <>{brl(l.valorEstoque)}<div className="text-[11px] text-slate-500">{qtd(l.estoque)} {l.unidade}</div></> : "—"}</td>
                </tr>
              ))}
              {!r.linhas.length && <tr><td colSpan={11} className="py-10 text-center text-slate-500">Nenhum produto com esses filtros.</td></tr>}
            </tbody>
          </table>
        )}

        {visao === "fornecedores" && (
          <table className="tabela text-[13px]">
            <thead><tr><th>Produto</th><th>Fornecedor</th><th className="text-right">Último custo</th><th className="text-right">Médio</th><th className="text-right">Menor</th><th className="text-right">Compras</th><th className="text-right">Quantidade</th><th className="text-right">× melhor</th></tr></thead>
            <tbody>
              {r.fornecedores.slice(skip, skip + take).map((l) => (
                <tr key={`${l.produtoId}-${l.fornecedorId}`} className={l.melhor ? "bg-emerald-50/50" : ""}>
                  <td><Link href={`/produtos/${l.produtoId}`} className="hover:underline">{l.nome}</Link><div className="font-mono text-[11px] text-slate-500">{l.codigo}</div></td>
                  <td><Link href={urlCom(base, sp, { forn: l.fornecedorId, visao: "compras", p: undefined })} className="hover:underline">{l.fornecedor}</Link></td>
                  <td className="text-right">{r4(l.ultima)}<div className="text-[11px] text-slate-500">{data(l.ultimaData)}</div></td>
                  <td className="text-right font-semibold">{r4(l.media)}</td>
                  <td className="text-right">{r4(l.menor)}</td>
                  <td className="text-right">{l.nCompras}</td>
                  <td className="text-right">{qtd(l.qtd)} {l.unidade}</td>
                  <td className="text-right">{l.melhor ? <span className="font-semibold text-emerald-700">melhor preço</span> : <span className="text-red-600">+{pc(l.acimaDoMelhor)}</span>}</td>
                </tr>
              ))}
              {!r.fornecedores.length && <tr><td colSpan={8} className="py-10 text-center text-slate-500">Nenhuma compra recebida no período.</td></tr>}
            </tbody>
          </table>
        )}

        {visao === "compras" && (
          <table className="tabela text-[13px]">
            <thead><tr><th>Data</th><th>Compra</th><th>Fornecedor</th><th>Produto</th><th className="text-right">Na nota</th><th className="text-right">Convertido</th><th className="text-right">Preço na nota</th><th className="text-right">Custo por unidade</th></tr></thead>
            <tbody>
              {r.compras.slice(skip, skip + take).map((c, i) => {
                const p = r.produtos.get(c.produtoId)!;
                return (
                  <tr key={`${c.compraId}-${c.produtoId}-${i}`}>
                    <td>{data(c.data)}</td>
                    <td><Link href={`/compras/${c.compraId}`} className="text-marca hover:underline">nº {c.numero}</Link></td>
                    <td>{c.fornecedor}</td>
                    <td><Link href={`/produtos/${p.id}`} className="hover:underline">{p.nome}</Link><div className="font-mono text-[11px] text-slate-500">{p.codigo}</div></td>
                    <td className="text-right">{qtd(c.quantidadeNota)} {c.unidadeNota || p.unidade}{c.fator !== 1 && <div className="text-[11px] text-slate-500">× {qtd(c.fator)}</div>}</td>
                    <td className="text-right">{qtd(c.quantidade)} {p.unidade}</td>
                    <td className="text-right">{r4(c.precoNota)}</td>
                    <td className="text-right font-semibold">{r4(c.custo)}{c.custo !== c.custoSemRateio && <div className="text-[11px] font-normal text-slate-500">{r4(c.custoSemRateio)} sem rateio</div>}</td>
                  </tr>
                );
              })}
              {!r.compras.length && <tr><td colSpan={8} className="py-10 text-center text-slate-500">Nenhuma compra recebida no período.</td></tr>}
            </tbody>
          </table>
        )}
        <Paginacao base={base} params={params} total={total} pagina={pagina} porPagina={porPagina} />
      </div>
    </Pagina>
  );
}
