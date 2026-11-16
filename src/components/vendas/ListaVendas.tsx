import Link from "next/link";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { cor } from "@/lib/orcamentos/tipos";
import { ordemVendas, whereVendas, type ParamsVendas } from "@/lib/vendas/pedidos";
import { clonarVendaAcao, emitirNotaVendaAcao, excluirVendaAcao, excluirVendasAcao, alterarSituacaoVendaAcao, situacaoVendasEmMassaAcao } from "@/lib/vendas/acoes";
import { colunasVisiveis } from "@/lib/ui/colunas";
import { num2 } from "@/lib/ui/format";
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

export type TipoLista = "PEDIDO" | "SERVICO" | "BALCAO";
const COLUNAS = [
  { chave: "numero", rotulo: "Nº" }, { chave: "nfe", rotulo: "NF-e" }, { chave: "cliente", rotulo: "Cliente" }, { chave: "data", rotulo: "Data" },
  { chave: "entrega", rotulo: "Entrega" }, { chave: "situacao", rotulo: "Situação" }, { chave: "valor", rotulo: "Valor" }, { chave: "loja", rotulo: "Loja" },
];
const dataBr = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
const dataUtc = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "");
export const baseVendas = (t: TipoLista) => (t === "SERVICO" ? "/vendas/servicos" : t === "BALCAO" ? "/vendas/balcao" : "/vendas");
export const tituloVendas = (t: TipoLista) => (t === "SERVICO" ? "Vendas de serviços" : t === "BALCAO" ? "Vendas balcão" : "Vendas de produtos");
/** Aviso no seletor de situação: o que cada uma faz com estoque e financeiro. */
export const avisoSituacao = (s: { estoque: string; financeiro: boolean }) =>
  s.estoque === "LANCAR" ? (s.financeiro ? "lança estoque e financeiro" : "lança somente estoque") : s.estoque === "RESERVAR" ? "reserva o estoque" : "não lança";

/** Lista de vendas de produtos, de serviços ou de balcão, no padrão do Gestão Click. */
export default async function ListaVendas({ tipo, sp }: { tipo: TipoLista; sp: ParamsVendas }) {
  const base = baseVendas(tipo);
  const titulo = tituloVendas(tipo);
  const balcao = tipo === "BALCAO";
  const u = await usuarioAtual();
  const where = await whereVendas(tipo, sp);
  const { pagina, porPagina, skip, take } = lerPagina(sp);
  const [lista, total, soma, situacoes, empresas, cliente, produto, servico] = await Promise.all([
    prisma.venda.findMany({ where, orderBy: ordemVendas(sp.o), skip, take, include: { cliente: { select: { id: true, nome: true, fantasia: true } }, situacaoCfg: true } }),
    prisma.venda.count({ where }),
    prisma.venda.aggregate({ where, _sum: { total: true } }),
    prisma.situacaoVendaConfig.findMany({ orderBy: { ordem: "asc" } }),
    prisma.empresa.findMany({ select: { id: true, nomeFantasia: true, razaoSocial: true } }),
    sp.cli ? prisma.pessoa.findUnique({ where: { id: sp.cli }, select: { id: true, nome: true } }) : null,
    sp.prod ? prisma.produto.findUnique({ where: { id: sp.prod }, select: { id: true, nome: true } }) : null,
    sp.serv ? prisma.servico.findUnique({ where: { id: sp.serv }, select: { id: true, nome: true } }) : null,
  ]);
  const notas = await prisma.notaFiscal.findMany({ where: { origemTipo: "VENDA", origemId: { in: lista.map((v) => v.id) }, modelo: { in: ["NFE", "NFCE"] }, status: { in: ["AUTORIZADA", "ASSINADA", "ENVIADA"] } }, select: { id: true, origemId: true, numero: true } });
  const notaDe = new Map(notas.map((n) => [n.origemId, n]));
  const centros = (await prisma.venda.findMany({ where: { centroCusto: { not: null } }, distinct: ["centroCusto"], select: { centroCusto: true } })).map((x) => x.centroCusto!);
  const cols = balcao ? COLUNAS.filter((c) => !["nfe", "entrega"].includes(c.chave)) : COLUNAS;
  const vis = colunasVisiveis(u?.preferencias, base, cols, balcao ? ["numero", "cliente", "data", "situacao", "valor"] : ["numero", "nfe", "cliente", "data", "situacao", "valor"]);
  const tem = (c: string) => vis.includes(c);
  const loja = () => { const e = empresas[0]; return e ? e.nomeFantasia || e.razaoSocial : ""; };
  const modo = sp.acao;
  const selecao = modo === "situacoes" || modo === "excluir" || modo === "imprimir";
  const filtros = Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && !["p", "pp", "acao", "busca", "o", "situacao"].includes(k)));
  const sem = urlCom(base, sp, { acao: undefined, situacao: undefined });
  const emSituacao = sp.situacao ? await prisma.venda.findUnique({ where: { id: sp.situacao }, select: { id: true, numero: true, situacaoId: true } }) : null;
  const opcoesSit = situacoes.map((s) => ({ id: s.id, nome: s.nome, aviso: avisoSituacao(s) }));

  const tabela = (
    <div className="cartao overflow-x-auto">
      <table className="tabela">
        <thead><tr>
          {selecao && <th className="w-8"></th>}
          {tem("numero") && <Ordenar base={base} params={sp} campo="numero" className="w-20">Nº</Ordenar>}
          {tem("nfe") && <th className="w-20">NF-e</th>}
          {tem("cliente") && <Ordenar base={base} params={sp} campo="cliente">Cliente</Ordenar>}
          {tem("data") && <Ordenar base={base} params={sp} campo="data" className="w-28">Data</Ordenar>}
          {tem("entrega") && <th className="w-28">Entrega</th>}
          {tem("situacao") && <Ordenar base={base} params={sp} campo="situacao" className="w-40">Situação</Ordenar>}
          {tem("valor") && <Ordenar base={base} params={sp} campo="valor" className="w-32 text-right">Valor</Ordenar>}
          {tem("loja") && <th className="w-32">Loja</th>}
          <th className="w-28 text-right">Ações</th>
        </tr></thead>
        <tbody>
          {lista.map((v) => {
            const c = cor(v.situacaoCfg?.cor ?? "cinza");
            const nf = notaDe.get(v.id);
            return (
              <tr key={v.id}>
                {selecao && <td><input type="checkbox" name="ids" value={v.id} /></td>}
                {tem("numero") && <td>{v.numero}</td>}
                {tem("nfe") && <td>{nf ? <Link href={`/fiscal/${nf.id}`} className="text-marca hover:underline">#{nf.numero}</Link> : <span className="text-slate-400">—</span>}</td>}
                {tem("cliente") && <td>{v.cliente ? <><Link href={`/clientes/${v.cliente.id}`} className="underline decoration-slate-300 hover:decoration-slate-700">{v.cliente.nome}</Link>{v.cliente.fantasia && <i className="block text-[11px] text-slate-500">{v.cliente.fantasia}</i>}</> : "Consumidor"}</td>}
                {tem("data") && <td>{dataBr(v.data)}</td>}
                {tem("entrega") && <td>{dataUtc(v.prazoEntrega)}</td>}
                {tem("situacao") && <td><span className={`pilula ${c.pilula}`}><span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${c.ponto}`} />{v.situacaoCfg?.nome ?? v.situacao}</span></td>}
                {tem("valor") && <td className="text-right">{num2(v.total)}</td>}
                {tem("loja") && <td className="text-[12px] uppercase">{loja()}</td>}
                <td>
                  <div className="flex justify-end gap-1">
                    <Link href={`/vendas/${v.id}`} className="btn-icone" title="Visualizar"><Icone nome="ver" size={13} /></Link>
                    {!balcao && <Link href={`/vendas/${v.id}/editar`} className="btn-icone" title="Editar"><Icone nome="editar" size={13} /></Link>}
                    <Suspenso direita classe="btn-icone" botao={<Icone nome="opcoes" size={13} />}>
                      <a href={`/cobranca/${v.token}`} target="_blank" className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="dinheiro" size={15} /> Link de cobrança</a>
                      <LinkSuspenso href={urlCom(base, sp, { situacao: v.id })} icone="atualizar">Alterar situação</LinkSuspenso>
                      <a href={`/vendas/${v.id}/imprimir`} target="_blank" className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="imprimir" size={15} /> Imprimir</a>
                      <LinkSuspenso href={`/vendas/${v.id}?compartilhar=1`} icone="compartilhar">Compartilhar</LinkSuspenso>
                      {v.situacao === "CONCLUIDA" && !nf && Number(v.totalProdutos) > 0 && <BotaoAcao acao={emitirNotaVendaAcao.bind(null, v.id, "NFE")} icone="notas" confirmar={`Emitir a NF-e da venda nº ${v.numero}?`}>Emitir NF-e</BotaoAcao>}
                      {v.situacao === "CONCLUIDA" && Number(v.totalServicos) > 0 && <BotaoAcao acao={emitirNotaVendaAcao.bind(null, v.id, "NFSE")} icone="notas" confirmar={`Emitir a NFS-e da venda nº ${v.numero}?`}>Emitir NFS-e</BotaoAcao>}
                      {!balcao && <BotaoAcao acao={clonarVendaAcao.bind(null, v.id)} icone="copiar">Gerar cópia</BotaoAcao>}
                      <LinkSuspenso href={`/financeiro?tipo=RECEBER&q=${encodeURIComponent(`Venda de nº ${v.numero}`)}`} icone="financeiro">Ver no financeiro</LinkSuspenso>
                      <BotaoExcluir acao={excluirVendaAcao.bind(null, v.id)} pergunta={`Excluir a venda nº ${v.numero}? O estoque volta e as contas a receber em aberto são apagadas.`} rotulo="Excluir" />
                    </Suspenso>
                  </div>
                </td>
              </tr>
            );
          })}
          {!lista.length && <tr><td colSpan={10} className="py-10 text-center text-slate-500">Nenhuma venda no período.</td></tr>}
        </tbody>
        {lista.length > 0 && <tfoot><tr><td colSpan={10} className="text-right text-[12px] text-slate-600">Total das {total} venda(s): <b>R$ {num2(soma._sum.total)}</b></td></tr></tfoot>}
      </table>
      <Paginacao base={base} params={sp} total={total} pagina={pagina} porPagina={porPagina} />
    </div>
  );

  return (
    <Pagina titulo={titulo} icone={balcao ? "balcao" : "vendas"} trilha={[{ rotulo: titulo, href: base }, { rotulo: "Listar" }]}>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        {balcao ? <Link href="/pdv" className="btn"><Icone nome="carrinho" size={15} /> Vender</Link> : <Link href={`${base}/adicionar`} className="btn"><Icone nome="mais" size={15} /> Adicionar</Link>}
        <Suspenso classe="btn-sec" botao={<><Icone nome="ajustes" size={15} /> Mais ações <Icone nome="abaixo" size={13} /></>}>
          <a href={urlCom("/api/vendas/exportar", { ...filtros, tipo }, {})} className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="exportar" size={15} /> Exportar</a>
          <LinkSuspenso href={urlCom(base, sp, { acao: "imprimir" })} icone="imprimir">Imprimir</LinkSuspenso>
          <LinkSuspenso href={urlCom(base, sp, { acao: "situacoes" })} icone="atualizar">Alterar situação</LinkSuspenso>
          <LinkSuspenso href={urlCom(base, sp, { acao: "excluir" })} icone="excluir">Excluir</LinkSuspenso>
        </Suspenso>
        <div className="ml-auto flex items-center gap-2">
          <GerenciarColunas lista={base} colunas={cols} visiveis={vis} />
          <SeletorPeriodo base={base} params={sp} />
          <form action={base} className="flex">
            {Object.entries(sp).filter(([k, v]) => v && !["q", "p"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <input name="q" defaultValue={sp.q} placeholder="Buscar por nº ou cliente" className="campo w-60 rounded-r-none" />
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
            <div><span className="rotulo">Data da venda</span><div className="flex items-center gap-1"><input type="date" name="de" defaultValue={sp.de} className="campo" /> a <input type="date" name="ate" defaultValue={sp.ate} className="campo" /></div></div>
            {!balcao && <div><span className="rotulo">Prazo de entrega</span><div className="flex items-center gap-1"><input type="date" name="ede" defaultValue={sp.ede} className="campo" /> a <input type="date" name="eate" defaultValue={sp.eate} className="campo" /></div></div>}
            <label><span className="rotulo">Situação</span><select name="s" defaultValue={sp.s ?? ""} className="campo"><option value="">Todos</option>{situacoes.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>
            <div><span className="rotulo">Cliente</span><BuscaPessoa nome="cli" papel="cliente" inicial={cliente} /></div>
            <div><span className="rotulo">Produto</span><BuscaPessoa nome="prod" papel="produto" inicial={produto} /></div>
            {!balcao && <div><span className="rotulo">Serviço</span><BuscaPessoa nome="serv" papel="servico" inicial={servico} /></div>}
            {!balcao && <label><span className="rotulo">Centro de custo</span><select name="cc" defaultValue={sp.cc ?? ""} className="campo"><option value="">Todos</option>{centros.map((c) => <option key={c}>{c}</option>)}</select></label>}
          </div>
          <div className="mt-3 flex gap-2"><button className="btn"><Icone nome="buscar" size={14} /> Buscar</button><Link href={`${base}?busca=1`} className="btn-sec"><Icone nome="fechar" size={14} /> Limpar</Link></div>
        </form>
      )}

      {emSituacao && <FormSituacao id={emSituacao.id} numero={emSituacao.numero} atual={emSituacao.situacaoId ?? ""} situacoes={opcoesSit} voltar={sem} acao={alterarSituacaoVendaAcao} rotulo="da venda" />}

      {modo === "situacoes" ? (
        <FormSelecao acao={situacaoVendasEmMassaAcao} titulo="Alterar situação" botao="Aplicar nos marcados" voltar={sem}
          campos={<select name="situacaoId" className="campo"><option value="">Escolha a situação</option>{opcoesSit.map((s) => <option key={s.id} value={s.id}>{s.nome} ({s.aviso})</option>)}</select>}>{tabela}</FormSelecao>
      ) : modo === "excluir" ? (
        <FormSelecao acao={excluirVendasAcao} perigo titulo="Excluir vendas" botao="Excluir marcadas" voltar={sem} confirmar="Excluir as vendas marcadas? O estoque volta e as contas a receber em aberto são apagadas.">{tabela}</FormSelecao>
      ) : modo === "imprimir" ? (
        <form action="/vendas/imprimir" target="_blank">
          <div className="mb-2 flex flex-wrap items-center gap-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-[13px]">
            <b>Imprimir</b> Marque as vendas e clique em imprimir.
            <span className="ml-auto flex gap-2"><Link href={sem} className="btn-sec py-1">Cancelar</Link><button className="btn py-1">Imprimir</button></span>
          </div>
          {tabela}
        </form>
      ) : tabela}
    </Pagina>
  );
}
