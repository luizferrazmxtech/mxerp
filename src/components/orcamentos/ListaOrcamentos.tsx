import Link from "next/link";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { cor, ordemOrcamentos, whereOrcamentos, type ParamsOrcamentos } from "@/lib/orcamentos/orcamentos";
import { clonarOrcamentoAcao, excluirOrcamentoAcao, excluirOrcamentosAcao, situacaoEmMassaAcao } from "@/lib/orcamentos/acoes";
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
import BuscaPessoa from "./BuscaPessoa";
import FormSituacao from "./FormSituacao";

const COLUNAS = [
  { chave: "numero", rotulo: "Nº" }, { chave: "cliente", rotulo: "Cliente" }, { chave: "data", rotulo: "Data" }, { chave: "entrega", rotulo: "Entrega" },
  { chave: "situacao", rotulo: "Situação" }, { chave: "valor", rotulo: "Valor" }, { chave: "loja", rotulo: "Loja" },
];
const dataBr = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "");

/** Lista de orçamentos de produtos ou de serviços, no padrão do Gestão Click. */
export default async function ListaOrcamentos({ tipo, sp }: { tipo: "PRODUTO" | "SERVICO"; sp: ParamsOrcamentos }) {
  const base = tipo === "SERVICO" ? "/orcamentos/servicos" : "/orcamentos";
  const titulo = tipo === "SERVICO" ? "Orçamentos de serviços" : "Orçamentos de produtos";
  const u = await usuarioAtual();
  const where = await whereOrcamentos(tipo, sp);
  const { pagina, porPagina, skip, take } = lerPagina(sp);
  const [lista, total, soma, situacoes, empresas, cliente, produto, servico] = await Promise.all([
    prisma.orcamento.findMany({ where, orderBy: ordemOrcamentos(sp.o), skip, take, include: { cliente: { select: { id: true, nome: true, fantasia: true } }, situacao: true } }),
    prisma.orcamento.count({ where }),
    prisma.orcamento.aggregate({ where, _sum: { total: true } }),
    prisma.situacaoOrcamento.findMany({ orderBy: { ordem: "asc" } }),
    prisma.empresa.findMany({ select: { id: true, nomeFantasia: true, razaoSocial: true } }),
    sp.cli ? prisma.pessoa.findUnique({ where: { id: sp.cli }, select: { id: true, nome: true } }) : null,
    sp.prod ? prisma.produto.findUnique({ where: { id: sp.prod }, select: { id: true, nome: true } }) : null,
    sp.serv ? prisma.servico.findUnique({ where: { id: sp.serv }, select: { id: true, nome: true } }) : null,
  ]);
  const centros = (await prisma.orcamento.findMany({ where: { centroCusto: { not: null } }, distinct: ["centroCusto"], select: { centroCusto: true } })).map((x) => x.centroCusto!);
  const vis = colunasVisiveis(u?.preferencias, base, COLUNAS, ["numero", "cliente", "data", "situacao", "valor"]);
  const tem = (c: string) => vis.includes(c);
  const loja = (id: string | null) => { const e = empresas.find((x) => x.id === id) ?? empresas[0]; return e ? e.nomeFantasia || e.razaoSocial : ""; };
  const modo = sp.acao;
  const selecao = modo === "situacoes" || modo === "excluir" || modo === "imprimir";
  const filtros = Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && !["p", "pp", "acao", "busca", "o", "situacao"].includes(k)));
  const sem = urlCom(base, sp, { acao: undefined, situacao: undefined });
  const emSituacao = sp.situacao ? await prisma.orcamento.findUnique({ where: { id: sp.situacao }, select: { id: true, numero: true, situacaoId: true } }) : null;

  const tabela = (
    <div className="cartao overflow-x-auto">
      <table className="tabela">
        <thead><tr>
          {selecao && <th className="w-8"></th>}
          {tem("numero") && <Ordenar base={base} params={sp} campo="numero" className="w-20">Nº</Ordenar>}
          {tem("cliente") && <Ordenar base={base} params={sp} campo="cliente">Cliente</Ordenar>}
          {tem("data") && <Ordenar base={base} params={sp} campo="data" className="w-28">Data</Ordenar>}
          {tem("entrega") && <Ordenar base={base} params={sp} campo="entrega" className="w-28">Entrega</Ordenar>}
          {tem("situacao") && <th className="w-40">Situação</th>}
          {tem("valor") && <Ordenar base={base} params={sp} campo="valor" className="w-32 text-right">Valor</Ordenar>}
          {tem("loja") && <th className="w-32">Loja</th>}
          <th className="w-28 text-right">Ações</th>
        </tr></thead>
        <tbody>
          {lista.map((o) => {
            const c = cor(o.situacao.cor);
            return (
              <tr key={o.id}>
                {selecao && <td><input type="checkbox" name="ids" value={o.id} /></td>}
                {tem("numero") && <td>{o.numero}</td>}
                {tem("cliente") && <td><Link href={`/clientes/${o.cliente.id}`} className="underline decoration-slate-300 hover:decoration-slate-700">{o.cliente.nome}</Link>{o.cliente.fantasia && <i className="block text-[11px] text-slate-500">{o.cliente.fantasia}</i>}</td>}
                {tem("data") && <td>{dataBr(o.data)}</td>}
                {tem("entrega") && <td>{dataBr(o.prazoEntrega)}</td>}
                {tem("situacao") && <td><span className={`pilula ${c.pilula}`}><span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${c.ponto}`} />{o.situacao.nome}</span></td>}
                {tem("valor") && <td className="text-right">{num2(o.total)}</td>}
                {tem("loja") && <td className="text-[12px] uppercase">{loja(o.empresaId)}</td>}
                <td>
                  <div className="flex justify-end gap-1">
                    <Link href={`/orcamentos/${o.id}`} className="btn-icone" title="Visualizar"><Icone nome="ver" size={13} /></Link>
                    <Link href={`/orcamentos/${o.id}/editar`} className="btn-icone" title="Editar"><Icone nome="editar" size={13} /></Link>
                    <Suspenso direita classe="btn-icone" botao={<Icone nome="opcoes" size={13} />}>
                      <a href={`/proposta/${o.token}`} target="_blank" className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="olho" size={15} /> Ver proposta</a>
                      <LinkSuspenso href={urlCom(base, sp, { situacao: o.id })} icone="atualizar">Alterar situação</LinkSuspenso>
                      <a href={`/orcamentos/${o.id}/imprimir`} target="_blank" className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="imprimir" size={15} /> Imprimir</a>
                      <LinkSuspenso href={`/orcamentos/${o.id}?compartilhar=1`} icone="compartilhar">Compartilhar</LinkSuspenso>
                      <BotaoAcao acao={clonarOrcamentoAcao.bind(null, o.id)} icone="copiar">Gerar cópia</BotaoAcao>
                      <BotaoExcluir acao={excluirOrcamentoAcao.bind(null, o.id)} pergunta={`Excluir o orçamento nº ${o.numero}?`} rotulo="Excluir" />
                    </Suspenso>
                  </div>
                </td>
              </tr>
            );
          })}
          {!lista.length && <tr><td colSpan={9} className="py-10 text-center text-slate-500">Nenhum orçamento no período.</td></tr>}
        </tbody>
        {lista.length > 0 && <tfoot><tr><td colSpan={9} className="text-right text-[12px] text-slate-600">Total dos {total} orçamento(s): <b>R$ {num2(soma._sum.total)}</b></td></tr></tfoot>}
      </table>
      <Paginacao base={base} params={sp} total={total} pagina={pagina} porPagina={porPagina} />
    </div>
  );

  return (
    <Pagina titulo={titulo} icone="notas" trilha={[{ rotulo: titulo, href: base }, { rotulo: "Listar" }]}>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <Link href={`${base}/adicionar`} className="btn"><Icone nome="mais" size={15} /> Adicionar</Link>
        <Suspenso classe="btn-sec" botao={<><Icone nome="ajustes" size={15} /> Mais ações <Icone nome="abaixo" size={13} /></>}>
          <a href={urlCom("/api/orcamentos/exportar", { ...filtros, tipo }, {})} className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="exportar" size={15} /> Exportar</a>
          <LinkSuspenso href={urlCom(base, sp, { acao: "imprimir" })} icone="imprimir">Imprimir</LinkSuspenso>
          <LinkSuspenso href={urlCom(base, sp, { acao: "situacoes" })} icone="atualizar">Alterar situação</LinkSuspenso>
          <LinkSuspenso href={urlCom(base, sp, { acao: "excluir" })} icone="excluir">Excluir</LinkSuspenso>
        </Suspenso>
        <div className="ml-auto flex items-center gap-2">
          <GerenciarColunas lista={base} colunas={COLUNAS} visiveis={vis} />
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
            <div><span className="rotulo">Data do orçamento</span><div className="flex items-center gap-1"><input type="date" name="de" defaultValue={sp.de} className="campo" /> a <input type="date" name="ate" defaultValue={sp.ate} className="campo" /></div></div>
            <div><span className="rotulo">Previsão de entrega</span><div className="flex items-center gap-1"><input type="date" name="ede" defaultValue={sp.ede} className="campo" /> a <input type="date" name="eate" defaultValue={sp.eate} className="campo" /></div></div>
            <label><span className="rotulo">Situação</span><select name="s" defaultValue={sp.s ?? ""} className="campo"><option value="">Todos</option>{situacoes.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>
            <div><span className="rotulo">Cliente</span><BuscaPessoa nome="cli" papel="cliente" inicial={cliente} /></div>
            <div><span className="rotulo">Produto</span><BuscaPessoa nome="prod" papel="produto" inicial={produto} /></div>
            <div><span className="rotulo">Serviço</span><BuscaPessoa nome="serv" papel="servico" inicial={servico} /></div>
            <label><span className="rotulo">Centro de custo</span><select name="cc" defaultValue={sp.cc ?? ""} className="campo"><option value="">Todos</option>{centros.map((c) => <option key={c}>{c}</option>)}</select></label>
          </div>
          <div className="mt-3 flex gap-2"><button className="btn"><Icone nome="buscar" size={14} /> Buscar</button><Link href={`${base}?busca=1`} className="btn-sec"><Icone nome="fechar" size={14} /> Limpar</Link></div>
        </form>
      )}

      {emSituacao && <FormSituacao id={emSituacao.id} numero={emSituacao.numero} atual={emSituacao.situacaoId} situacoes={situacoes} voltar={sem} />}

      {modo === "situacoes" ? (
        <FormSelecao acao={situacaoEmMassaAcao} titulo="Alterar situação" botao="Aplicar nos marcados" voltar={sem}
          campos={<select name="situacaoId" className="campo"><option value="">Escolha a situação</option>{situacoes.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select>}>{tabela}</FormSelecao>
      ) : modo === "excluir" ? (
        <FormSelecao acao={excluirOrcamentosAcao} perigo titulo="Excluir orçamentos" botao="Excluir marcados" voltar={sem} confirmar="Excluir os orçamentos marcados? Não dá para desfazer.">{tabela}</FormSelecao>
      ) : modo === "imprimir" ? (
        <form action="/orcamentos/imprimir" target="_blank">
          <div className="mb-2 flex flex-wrap items-center gap-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-[13px]">
            <b>Imprimir</b> Marque os orçamentos e clique em imprimir.
            <span className="ml-auto flex gap-2"><Link href={sem} className="btn-sec py-1">Cancelar</Link><button className="btn py-1">Imprimir</button></span>
          </div>
          {tabela}
        </form>
      ) : tabela}
    </Pagina>
  );
}
