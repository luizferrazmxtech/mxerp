import Link from "next/link";
import { paramsDe, periodoRelatorio } from "@/lib/relatorios/periodo";
import { depositosParaFiltro, relatorioTransferencias } from "@/lib/estoque/relatorioTransferencias";
import { BarraRelatorio, Kpi } from "@/components/relatorios/Barra";
import { Pagina } from "@/components/ui/Pagina";
import Icone from "@/components/Icone";
import { brl, dataHora, num2, qtd } from "@/lib/ui/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Relatório de transferências" };

const Carro = () => <span className="etiqueta ml-1 text-[11px] text-slate-500">carro</span>;

/** Relatório de transferências de estoque: período, origem, destino, carro e produto; por item ou somado por produto. */
export default async function RelatorioTransferencias({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const per = periodoRelatorio(sp);
  const params = paramsDe(sp);
  const base = "/estoque/transferencias/relatorio";
  const [r, depositos] = await Promise.all([
    relatorioTransferencias({ de: per.de, ate: per.ate, origem: sp.origem, destino: sp.destino, carro: sp.carro, produto: sp.produto }),
    depositosParaFiltro(),
  ]);
  const porProduto = sp.por === "produtos";
  const filtros = [sp.origem && "origem", sp.destino && "destino", sp.carro && "carro", sp.produto && "produto"].filter(Boolean);
  const nomeDep = (id?: string) => depositos.find((d) => d.id === id)?.nome;
  const selDep = (name: string, rotulo: string, soCarros = false) => (
    <label><span className="rotulo">{rotulo}</span>
      <select name={name} defaultValue={sp[name] ?? ""} className="campo min-w-48">
        <option value="">Todos</option>
        {depositos.filter((d) => !soCarros || d.equipeId).map((d) => <option key={d.id} value={d.id}>{d.nome}{d.equipeId && !soCarros ? " (carro)" : ""}{d.ativo ? "" : " (inativo)"}</option>)}
      </select>
    </label>
  );
  return (
    <Pagina titulo="Relatório de transferências" icone="transferir"
      trilha={[{ rotulo: "Transferências", href: "/estoque/transferencias" }, { rotulo: "Relatório" }]}>
      <BarraRelatorio base={base} params={params} csv={`/api/relatorios/transferencias?${new URLSearchParams(params)}`}
        opcoes={[{ chave: "por", padrao: "itens", valores: [["itens", "Item a item"], ["produtos", "Somado por produto"]] }]} />
      <form action={base} className="no-print cartao mb-3 flex flex-wrap items-end gap-2 p-3">
        {Object.entries(params).filter(([k]) => ["periodo", "pde", "pate", "por"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        {selDep("origem", "Origem")}
        {selDep("destino", "Destino")}
        {selDep("carro", "Entrou ou saiu do carro", true)}
        <label><span className="rotulo">Produto</span><input name="produto" defaultValue={sp.produto} className="campo min-w-56" placeholder="Código, nome ou código de barras" /></label>
        <button className="btn"><Icone nome="buscar" size={14} /> Filtrar</button>
        {filtros.length > 0 && <Link href={`${base}?${new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([k]) => ["periodo", "pde", "pate", "por"].includes(k))))}`} className="btn-sec">Limpar filtros</Link>}
      </form>
      <p className="mb-2 text-[12px] text-slate-500">
        {per.rotulo}
        {sp.origem && <> · origem: <b>{nomeDep(sp.origem)}</b></>}
        {sp.destino && <> · destino: <b>{nomeDep(sp.destino)}</b></>}
        {sp.carro && <> · carro: <b>{nomeDep(sp.carro)}</b></>}
        {sp.produto && <> · produto: <b>{sp.produto}</b></>}
        {" "}· valores pelo custo do produto na hora da transferência
      </p>
      <div className="mb-3 grid gap-3 md:grid-cols-4">
        <Kpi rotulo="Transferências" valor={String(r.resumo.transferencias)} dica={`${r.resumo.itens} item(ns)`} />
        <Kpi rotulo="Quantidade transferida" valor={qtd(r.resumo.quantidade)} />
        <Kpi rotulo="Valor (custo)" valor={brl(r.resumo.total)} />
        <Kpi rotulo="Carros" valor={`${r.resumo.paraCarros} abastecer · ${r.resumo.dosCarros} devolver`} dica="transferências para e dos carros" />
      </div>
      {r.limitado && <p className="mb-2 text-[13px] text-amber-700">Mostrando as 2.000 transferências mais recentes. Diminua o período para ver todas.</p>}
      <div className="cartao overflow-x-auto">
        {porProduto ? (
          <table className="tabela">
            <thead><tr><th className="w-32">Código</th><th>Produto</th><th className="text-right">Transferências</th><th className="text-right">Quantidade</th><th className="text-right">Valor (custo)</th></tr></thead>
            <tbody>
              {r.produtos.map((p) => (
                <tr key={p.produtoId}>
                  <td>{p.codigo}</td><td><Link href={`/estoque/produto/${p.produtoId}`} className="hover:underline">{p.produto}</Link></td>
                  <td className="text-right">{p.transferencias}</td><td className="text-right">{qtd(p.quantidade)} {p.unidade}</td><td className="text-right">{num2(p.total)}</td>
                </tr>
              ))}
              {!r.produtos.length && <tr><td colSpan={5} className="py-10 text-center text-slate-500">Nenhuma transferência no período.</td></tr>}
            </tbody>
            {r.produtos.length > 0 && <tfoot><tr className="font-semibold"><td colSpan={3}>Total</td><td className="text-right">{qtd(r.resumo.quantidade)}</td><td className="text-right">{num2(r.resumo.total)}</td></tr></tfoot>}
          </table>
        ) : (
          <table className="tabela">
            <thead><tr>
              <th className="w-20">Nº</th><th className="w-32">Data</th><th>Origem</th><th>Destino</th><th>Produto</th>
              <th className="text-right">Quantidade</th><th className="text-right">Custo unit.</th><th className="text-right">Total</th><th>Usuário</th>
            </tr></thead>
            <tbody>
              {r.linhas.map((l, i) => (
                <tr key={`${l.transferenciaId}-${i}`}>
                  <td><Link href={`/estoque/transferencias/${l.transferenciaId}`} className="font-medium text-marca hover:underline">{l.numero}</Link></td>
                  <td className="whitespace-nowrap text-[12px]">{dataHora(l.data)}</td>
                  <td className="uppercase">{l.origem}{l.origemCarro && <Carro />}</td>
                  <td className="uppercase">{l.destino}{l.destinoCarro && <Carro />}</td>
                  <td><span className="text-slate-500">{l.codigo}</span> · {l.produto}</td>
                  <td className="whitespace-nowrap text-right">{qtd(l.quantidade)} {l.unidade}</td>
                  <td className="text-right">{num2(l.custoUnit)}</td>
                  <td className="text-right">{num2(l.total)}</td>
                  <td className="text-[12px]">{l.usuario}</td>
                </tr>
              ))}
              {!r.linhas.length && <tr><td colSpan={9} className="py-10 text-center text-slate-500">Nenhuma transferência no período.</td></tr>}
            </tbody>
            {r.linhas.length > 0 && <tfoot><tr className="font-semibold"><td colSpan={5}>Total</td><td className="text-right">{qtd(r.resumo.quantidade)}</td><td /><td className="text-right">{num2(r.resumo.total)}</td><td /></tr></tfoot>}
          </table>
        )}
      </div>
    </Pagina>
  );
}
