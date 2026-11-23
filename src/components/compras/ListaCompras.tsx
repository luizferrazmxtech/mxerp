import Link from "next/link";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { cor } from "@/lib/orcamentos/tipos";
import { ordemCompras, whereCompras, type ParamsCompras } from "@/lib/compras/compras";
import { rotuloLancamento } from "@/lib/compras/tipos";
import { alterarSituacaoCompraAcao, clonarCompraAcao, excluirCompraAcao, excluirComprasAcao, situacaoComprasEmMassaAcao } from "@/lib/compras/acoes";
import { colunasVisiveis } from "@/lib/ui/colunas";
import { brl, num2 } from "@/lib/ui/format";
import { Pagina } from "@/components/ui/Pagina";
import { LinkSuspenso, urlCom } from "@/components/ui/BarraLista";
import GerenciarColunas from "@/components/ui/GerenciarColunas";
import Paginacao, { Ordenar, lerPagina } from "@/components/ui/Paginacao";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import BotaoAcao from "@/components/ui/BotaoAcao";
import Suspenso from "@/components/ui/Suspenso";
import FormSelecao from "@/components/ui/FormSelecao";
import SeletorPeriodo from "@/components/ui/SeletorPeriodo";
import Icone from "@/components/Icone";
import BuscaPessoa from "@/components/orcamentos/BuscaPessoa";
import FormSituacao from "@/components/orcamentos/FormSituacao";
import { baseCompras, tituloCompras } from "./PaginaFormCompra";
import Resumo from "@/components/ui/Resumo";

const COLUNAS = [
  { chave: "codigo", rotulo: "Código" }, { chave: "fornecedor", rotulo: "Fornecedor" }, { chave: "data", rotulo: "Data" }, { chave: "situacao", rotulo: "Situação" },
  { chave: "valor", rotulo: "Valor" }, { chave: "nfe", rotulo: "NF-e" }, { chave: "cadastrado", rotulo: "Cadastrado em" }, { chave: "loja", rotulo: "Loja" },
];
const dataUtc = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "");
const dataHoraBr = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

/** Lista de compras de produtos ou de serviços (Gestão Click › Estoque › Compras). */
export default async function ListaCompras({ tipo, sp }: { tipo: "PRODUTO" | "SERVICO"; sp: ParamsCompras }) {
  const base = baseCompras(tipo);
  const titulo = tituloCompras(tipo);
  const u = await usuarioAtual();
  const where = whereCompras(tipo, sp);
  const { pagina, porPagina, skip, take } = lerPagina(sp);
  const [lista, total, soma, situacoes, empresas, fornecedor, produto, servico] = await Promise.all([
    prisma.compra.findMany({ where, orderBy: ordemCompras(sp.o), skip, take, include: { fornecedor: { select: { id: true, nome: true, fantasia: true } }, situacaoCfg: true } }),
    prisma.compra.count({ where }),
    prisma.compra.aggregate({ where, _sum: { total: true } }),
    prisma.situacaoCompraConfig.findMany({ orderBy: { ordem: "asc" } }),
    prisma.empresa.findMany({ select: { id: true, nomeFantasia: true, razaoSocial: true } }),
    sp.forn ? prisma.pessoa.findUnique({ where: { id: sp.forn }, select: { id: true, nome: true } }) : null,
    sp.prod ? prisma.produto.findUnique({ where: { id: sp.prod }, select: { id: true, nome: true } }) : null,
    sp.serv ? prisma.servico.findUnique({ where: { id: sp.serv }, select: { id: true, nome: true } }) : null,
  ]);
  const centros = (await prisma.compra.findMany({ where: { centroCusto: { not: null } }, distinct: ["centroCusto"], select: { centroCusto: true } })).map((x) => x.centroCusto!);
  const vis = colunasVisiveis(u?.preferencias, base, COLUNAS, ["fornecedor", "data", "situacao", "valor", "nfe"]);
  const tem = (c: string) => vis.includes(c);
  const loja = () => { const e = empresas[0]; return e ? e.nomeFantasia || e.razaoSocial : ""; };
  const modo = sp.acao;
  const selecao = modo === "situacoes" || modo === "excluir";
  const filtros = Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && !["p", "pp", "acao", "busca", "o", "situacao"].includes(k)));
  const sem = urlCom(base, sp, { acao: undefined, situacao: undefined });
  const emSituacao = sp.situacao ? await prisma.compra.findUnique({ where: { id: sp.situacao }, select: { id: true, numero: true, situacaoId: true } }) : null;
  const opcoesSit = situacoes.map((s) => ({ id: s.id, nome: s.nome, aviso: rotuloLancamento(s.lancamento).toLowerCase() }));

  // cartões de resumo do período (sem o filtro de situação)
  const resumo = await prisma.compra.findMany({ where: whereCompras(tipo, { ...sp, s: undefined }), select: { total: true, recebida: true, situacaoCfg: { select: { nome: true } } } });
  const cancelada = (c: (typeof resumo)[number]) => /cancel/i.test(c.situacaoCfg?.nome ?? "");
  const somaC = (f: (c: (typeof resumo)[number]) => boolean) => resumo.filter(f).reduce((a, c) => ({ n: a.n + 1, v: a.v + Number(c.total) }), { n: 0, v: 0 });
  const tudoC = somaC(() => true), pendentes = somaC((c) => !c.recebida && !cancelada(c)), recebidas = somaC((c) => c.recebida && !cancelada(c)), canceladas = somaC(cancelada);
  const pctC = (x: number) => (tudoC.v > 0 ? (x / tudoC.v) * 100 : 0);
  const qtdC = (n: number) => `${n} compra${n === 1 ? "" : "s"}`;

  const tabela = (
    <div className="cartao overflow-x-auto">
      <table className="tabela">
        <thead><tr>
          {selecao && <th className="w-8"></th>}
          {tem("codigo") && <Ordenar base={base} params={sp} campo="codigo" className="w-20">Código</Ordenar>}
          {tem("fornecedor") && <Ordenar base={base} params={sp} campo="fornecedor">Fornecedor</Ordenar>}
          {tem("data") && <Ordenar base={base} params={sp} campo="data" className="w-28">Data</Ordenar>}
          {tem("situacao") && <Ordenar base={base} params={sp} campo="situacao" className="w-40 text-center">Situação</Ordenar>}
          {tem("valor") && <Ordenar base={base} params={sp} campo="valor" className="w-32 text-right">Valor</Ordenar>}
          {tem("nfe") && <th className="w-24">NF-e</th>}
          {tem("cadastrado") && <th className="w-36">Cadastrado em</th>}
          {tem("loja") && <th className="w-32">Loja</th>}
          <th className="w-28 text-right">Ações</th>
        </tr></thead>
        <tbody>
          {lista.map((c) => {
            const k = cor(c.situacaoCfg?.cor ?? "cinza");
            return (
              <tr key={c.id}>
                {selecao && <td><input type="checkbox" name="ids" value={c.id} /></td>}
                {tem("codigo") && <td>{c.numero}</td>}
                {tem("fornecedor") && <td><Link href={`/fornecedores/${c.fornecedor.id}`} className="sublinhado">{c.fornecedor.nome}</Link>{c.fornecedor.fantasia && <i className="block text-[11px] text-slate-500">{c.fornecedor.fantasia}</i>}</td>}
                {tem("data") && <td>{dataUtc(c.data)}</td>}
                {tem("situacao") && <td className="text-center"><span className={`pilula ${k.pilula}`}>{c.situacaoCfg?.nome ?? "—"}</span></td>}
                {tem("valor") && <td className="text-right">{num2(c.total)}</td>}
                {tem("nfe") && <td>{c.numeroNfe ? <Link href={`/compras/${c.id}?aba=detalhes`} className="text-marca underline">{c.numeroNfe}</Link> : <span className="text-slate-400">—</span>}</td>}
                {tem("cadastrado") && <td className="text-[12px]">{dataHoraBr(c.createdAt)}</td>}
                {tem("loja") && <td className="text-[12px] uppercase">{loja()}</td>}
                <td>
                  <div className="flex justify-end gap-1">
                    <Link href={`/compras/${c.id}`} className="btn-icone" title="Visualizar"><Icone nome="ver" size={13} /></Link>
                    <Link href={`/compras/${c.id}/editar`} className="btn-icone" title="Editar"><Icone nome="editar" size={13} /></Link>
                    <Suspenso direita classe="btn-icone" botao={<Icone nome="opcoes" size={13} />}>
                      <LinkSuspenso href={urlCom(base, sp, { situacao: c.id })} icone="atualizar">Alterar situação</LinkSuspenso>
                      <LinkSuspenso href={`/financeiro?tipo=PAGAR&periodo=todos&doc=${c.id}`} icone="financeiro">Ver no financeiro</LinkSuspenso>
                      <LinkSuspenso href={`/compras/${c.id}?compartilhar=1`} icone="compartilhar">Compartilhar</LinkSuspenso>
                      <a href={`/compras/${c.id}/imprimir`} target="_blank" className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="imprimir" size={15} /> Imprimir</a>
                      <LinkSuspenso href={`/compras/${c.id}?aba=anexos`} icone="anexos">Documentos</LinkSuspenso>
                      <BotaoAcao acao={clonarCompraAcao.bind(null, c.id)} icone="copiar">Cópia</BotaoAcao>
                      <BotaoExcluir acao={excluirCompraAcao.bind(null, c.id)} pergunta={`Excluir a compra nº ${c.numero}? O estoque lançado sai e as contas a pagar em aberto são apagadas.`} rotulo="Excluir" />
                    </Suspenso>
                  </div>
                </td>
              </tr>
            );
          })}
          {!lista.length && <tr><td colSpan={10} className="py-10 text-center text-slate-500">Nenhuma compra no período.</td></tr>}
        </tbody>
        {lista.length > 0 && <tfoot><tr><td colSpan={10} className="text-right text-[12px] text-slate-600">Total das {total} compra(s): <b>R$ {num2(soma._sum.total)}</b></td></tr></tfoot>}
      </table>
      <Paginacao base={base} params={sp} total={total} pagina={pagina} porPagina={porPagina} />
    </div>
  );

  return (
    <Pagina titulo="Compras" icone="carrinho" trilha={[{ rotulo: "Compras", href: base }, { rotulo: "Listar" }]}>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <Link href={`${base}/adicionar`} className="btn"><Icone nome="mais" size={15} /> Adicionar</Link>
        <Suspenso classe="btn-sec" botao={<><Icone nome="ajustes" size={15} /> Mais ações <Icone nome="abaixo" size={13} /></>}>
          <LinkSuspenso href="/compras/importar-xml" icone="importar">Importar XML</LinkSuspenso>
          <a href={urlCom("/api/compras/exportar", { ...filtros, tipo }, {})} className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="exportar" size={15} /> Exportar</a>
          <LinkSuspenso href={urlCom(base, sp, { acao: "situacoes" })} icone="atualizar">Alterar situação</LinkSuspenso>
          <LinkSuspenso href={urlCom(base, sp, { acao: "excluir" })} icone="excluir">Excluir</LinkSuspenso>
        </Suspenso>
        <span className="ml-2 text-[12px] text-slate-500">{titulo}</span>
        <div className="ml-auto flex items-center gap-2">
          <GerenciarColunas lista={base} colunas={COLUNAS} visiveis={vis} />
          <SeletorPeriodo base={base} params={sp} />
          <form action={base} className="flex">
            {Object.entries(sp).filter(([k, v]) => v && !["q", "p"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <input name="q" defaultValue={sp.q} placeholder="Buscar por nº, fornecedor ou NF-e" className="campo w-64 rounded-r-none" />
            <button className="btn rounded-l-none px-2.5" title="Buscar"><Icone nome="buscar" size={15} /></button>
          </form>
          <Link href={urlCom(base, sp, { busca: sp.busca === "1" ? undefined : "1" })} className={sp.busca === "1" ? "btn-sec" : "btn"} title="Busca avançada"><Icone nome="filtro" size={15} /></Link>
        </div>
      </div>

      {sp.busca === "1" && (
        <form action={base} className="cartao no-print mb-3 p-4">
          <input type="hidden" name="busca" value="1" /><input type="hidden" name="periodo" value="todos" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label><span className="rotulo">Loja</span><select name="loja" defaultValue={sp.loja ?? ""} className="campo"><option value="">Todas</option>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nomeFantasia || e.razaoSocial}</option>)}</select></label>
            <label><span className="rotulo">Código</span><input name="codigo" defaultValue={sp.codigo} className="campo" /></label>
            <div><span className="rotulo">Fornecedor</span><BuscaPessoa nome="forn" papel="fornecedor" inicial={fornecedor} /></div>
            <label><span className="rotulo">Situação</span><select name="s" defaultValue={sp.s ?? ""} className="campo"><option value="">Todas</option>{situacoes.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>
            <div><span className="rotulo">Produto</span><BuscaPessoa nome="prod" papel="produto" inicial={produto} /></div>
            <div><span className="rotulo">Serviço</span><BuscaPessoa nome="serv" papel="servico" inicial={servico} /></div>
            <div><span className="rotulo">Período</span><div className="flex items-center gap-1"><input type="date" name="de" defaultValue={sp.de} className="campo" /> a <input type="date" name="ate" defaultValue={sp.ate} className="campo" /></div></div>
            <label><span className="rotulo">Nº NF-e</span><input name="nfe" defaultValue={sp.nfe} className="campo" /></label>
            <label><span className="rotulo">Centro de custo</span><select name="cc" defaultValue={sp.cc ?? ""} className="campo"><option value="">Todos</option>{centros.map((c) => <option key={c}>{c}</option>)}</select></label>
          </div>
          <div className="mt-3 flex gap-2"><button className="btn"><Icone nome="buscar" size={14} /> Buscar</button><Link href={`${base}?busca=1`} className="btn-sec"><Icone nome="fechar" size={14} /> Limpar</Link></div>
        </form>
      )}

      <Resumo cartoes={[
        { rotulo: "Total do período", valor: brl(tudoC.v), legenda: `${qtdC(tudoC.n)} no período`, icone: "total", cor: "tinta", pct: tudoC.v > 0 ? 100 : 0 },
        { rotulo: "Pendentes", valor: brl(pendentes.v), legenda: `${qtdC(pendentes.n)} sem entrada no estoque`, icone: "hoje", cor: "amarelo", pct: pctC(pendentes.v) },
        { rotulo: "Recebidas", valor: brl(recebidas.v), legenda: `${qtdC(recebidas.n)} com entrada no estoque`, icone: "confirmado", cor: "verde", pct: pctC(recebidas.v) },
        { rotulo: "Canceladas", valor: brl(canceladas.v), legenda: qtdC(canceladas.n), icone: "fechar", cor: "vermelho", pct: pctC(canceladas.v) },
        { rotulo: "Ticket médio", valor: brl(tudoC.n ? tudoC.v / tudoC.n : 0), legenda: "por compra", icone: "valor", cor: "cinza" },
      ]} />

      {emSituacao && <FormSituacao id={emSituacao.id} numero={emSituacao.numero} atual={emSituacao.situacaoId ?? ""} situacoes={opcoesSit} voltar={sem} acao={alterarSituacaoCompraAcao} rotulo="da compra" />}

      {modo === "situacoes" ? (
        <FormSelecao acao={situacaoComprasEmMassaAcao} titulo="Alterar situação" botao="Aplicar nas marcadas" voltar={sem}
          campos={<select name="situacaoId" className="campo"><option value="">Escolha a situação</option>{opcoesSit.map((s) => <option key={s.id} value={s.id}>{s.nome} ({s.aviso})</option>)}</select>}>{tabela}</FormSelecao>
      ) : modo === "excluir" ? (
        <FormSelecao acao={excluirComprasAcao} perigo titulo="Excluir compras" botao="Excluir marcadas" voltar={sem} confirmar="Excluir as compras marcadas? O estoque lançado sai e as contas a pagar em aberto são apagadas.">{tabela}</FormSelecao>
      ) : tabela}
    </Pagina>
  );
}
