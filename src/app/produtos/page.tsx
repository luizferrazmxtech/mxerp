import Link from "next/link";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { whereProdutos, ordemProdutos, type ParamsLista } from "@/lib/itens/filtros";
import { situacaoAtivo } from "@/lib/itens/ativos";
import { estoquesDe } from "@/lib/itens/produtos";
import { ajustarProdutosAcao, ajustarValoresAcao, clonarProdutoAcao, excluirProdutoAcao, excluirProdutosAcao } from "@/lib/itens/acoes";
import { colunasVisiveis } from "@/lib/ui/colunas";
import { dataSP, num2, qtd } from "@/lib/ui/format";
import { Pagina } from "@/components/ui/Pagina";
import BarraCadastro from "@/components/ui/BarraCadastro";
import { LinkSuspenso, urlCom } from "@/components/ui/BarraLista";
import GerenciarColunas from "@/components/ui/GerenciarColunas";
import Paginacao, { Ordenar, lerPagina } from "@/components/ui/Paginacao";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import Suspenso from "@/components/ui/Suspenso";
import FormSelecao, { FormAcao } from "@/components/ui/FormSelecao";
import Icone from "@/components/Icone";
import BuscaFornecedor from "@/components/itens/BuscaFornecedor";
import CelulaEstoque from "@/components/estoque/CelulaEstoque";
import FiltroAtivos from "@/components/ui/FiltroAtivos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Produtos" };

const COLUNAS = [{ chave: "codigo", rotulo: "Código" }, { chave: "nome", rotulo: "Nome" }, { chave: "valor", rotulo: "Valor" }, { chave: "estoque", rotulo: "Estoque" }, { chave: "cadastrado", rotulo: "Cadastrado em" }];

export default async function Produtos({ searchParams }: { searchParams: Promise<ParamsLista> }) {
  const sp = await searchParams;
  const u = await usuarioAtual();
  const where = await whereProdutos(sp);
  const { pagina, porPagina, skip, take } = lerPagina(sp);
  const [lista, total, grupos, empresas, campos, tipos, fornecedor] = await Promise.all([
    prisma.produto.findMany({ where, orderBy: [ordemProdutos(sp.o), { id: "asc" }], skip, take, select: { id: true, codigo: true, nome: true, precoVenda: true, unidade: true, controlaEstoque: true, estoqueMinimo: true, estoqueMaximo: true, ativo: true, createdAt: true } }),
    prisma.produto.count({ where }),
    prisma.grupoProduto.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true, paiId: true } }),
    prisma.empresa.findMany({ select: { id: true, nomeFantasia: true, razaoSocial: true } }),
    prisma.campoExtra.findMany({ where: { entidade: "PRODUTO" }, orderBy: [{ ordem: "asc" }, { nome: "asc" }] }),
    prisma.tipoValor.findMany({ orderBy: { nome: "asc" } }),
    sp.forn ? prisma.pessoa.findUnique({ where: { id: sp.forn }, select: { id: true, nome: true } }) : null,
  ]);
  const est = await estoquesDe(lista.map((p) => p.id));
  const vis = colunasVisiveis(u?.preferencias, "/produtos", COLUNAS, ["codigo", "nome", "valor", "estoque"]);
  const tem = (c: string) => vis.includes(c);
  const modo = sp.acao;
  const selecao = modo === "massa" || modo === "excluir" || modo === "etiquetas";
  const filtros = Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && !["p", "pp", "acao", "busca", "o"].includes(k)));
  const nomeGrupo = (g: { nome: string; paiId: string | null }) => (g.paiId ? `${grupos.find((x) => x.id === g.paiId)?.nome ?? ""} › ${g.nome}` : g.nome);

  const tabela = (
    <div className="cartao overflow-x-auto">
      <table className="tabela">
        <thead><tr>
          {selecao && <th className="w-8"></th>}
          {tem("codigo") && <Ordenar base="/produtos" params={sp} campo="codigo" className="w-36">Código</Ordenar>}
          {tem("nome") && <Ordenar base="/produtos" params={sp} campo="nome">Nome</Ordenar>}
          {tem("valor") && <Ordenar base="/produtos" params={sp} campo="valor" className="w-32 text-right">Valor</Ordenar>}
          {tem("estoque") && <th className="w-28 text-right">Estoque</th>}
          {tem("cadastrado") && <Ordenar base="/produtos" params={sp} campo="cadastrado" className="w-32">Cadastrado em</Ordenar>}
          <th className="w-28 text-right">Ações</th>
        </tr></thead>
        <tbody>
          {lista.map((p) => {
            const e = est.get(p.id)!;
            return (
              <tr key={p.id} className={p.ativo ? "" : "text-slate-400"}>
                {selecao && <td><input type="checkbox" name="ids" value={p.id} /></td>}
                {tem("codigo") && <td>{p.codigo}</td>}
                {tem("nome") && <td><Link href={`/produtos/${p.id}`} className="hover:underline">{p.nome}</Link>{!p.ativo && <span className="ml-2 text-[11px]">(inativo)</span>}</td>}
                {tem("valor") && <td className="text-right">{num2(p.precoVenda)}</td>}
                {tem("estoque") && <td className="text-right"><CelulaEstoque controla={p.controlaEstoque} fisico={e.fisico} reservado={e.reservado} fisicoCarros={e.fisicoCarros} livreCarros={e.carros} minimo={p.estoqueMinimo} maximo={p.estoqueMaximo} /></td>}
                {tem("cadastrado") && <td>{dataSP(p.createdAt)}</td>}
                <td>
                  <div className="flex justify-end gap-1">
                    {e.reservado > 0 && <Link href={`/produtos/${p.id}?aba=estoque#reservas`} className="btn-icone text-amber-700" title="Onde está reservado"><Icone nome="hoje" size={13} /></Link>}
                    <Link href={`/produtos/${p.id}`} className="btn-icone" title="Visualizar"><Icone nome="ver" size={13} /></Link>
                    <Link href={`/produtos/${p.id}/editar`} className="btn-icone" title="Editar"><Icone nome="editar" size={13} /></Link>
                    <Suspenso direita classe="btn-icone" botao={<Icone nome="opcoes" size={13} />}>
                      <LinkSuspenso href={`/produtos/${p.id}?aba=movimentacoes`} icone="atualizar">Movimentações de estoque</LinkSuspenso>
                      <LinkSuspenso href={`/produtos/${p.id}?aba=historico`} icone="relogio">Histórico de valores</LinkSuspenso>
                      <form action={clonarProdutoAcao.bind(null, p.id)}><button className="flex w-full items-center gap-2 px-3 py-[7px] text-left hover:bg-slate-100"><Icone nome="copiar" size={15} /> Clonar produto</button></form>
                      <BotaoExcluir acao={excluirProdutoAcao.bind(null, p.id)} pergunta={`Excluir ${p.nome}?`} rotulo="Excluir" />
                    </Suspenso>
                  </div>
                </td>
              </tr>
            );
          })}
          {!lista.length && <tr><td colSpan={8} className="py-10 text-center text-slate-500">Nenhum produto encontrado.</td></tr>}
        </tbody>
      </table>
      <Paginacao base="/produtos" params={sp} total={total} pagina={pagina} porPagina={porPagina} />
    </div>
  );

  return (
    <Pagina titulo="Produtos" icone="produtos" trilha={[{ rotulo: "Produtos", href: "/produtos" }, { rotulo: "Listar" }]}>
      <BarraCadastro base="/produtos" params={sp} adicionar={{ href: "/produtos/adicionar" }} placeholder="Buscar por nome ou código"
        filtros={<FiltroAtivos base="/produtos" params={sp} />}
        colunas={<GerenciarColunas lista="/produtos" colunas={COLUNAS} visiveis={vis} />}
        maisAcoes={<>
          <LinkSuspenso href="/produtos/importar" icone="importar">Importar</LinkSuspenso>
          <LinkSuspenso href="/produtos/importar?origem=nfe" icone="notas">Importar de notas fiscais de vendas</LinkSuspenso>
          <a href={urlCom("/api/itens/exportar", filtros, {})} className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="exportar" size={15} /> Exportar cadastros</a>
          <LinkSuspenso href={urlCom("/produtos", sp, { acao: "valores" })} icone="valor">Ajustar valores em massa</LinkSuspenso>
          <LinkSuspenso href={urlCom("/produtos", sp, { acao: "massa" })} icone="ajustes">Ajustar produtos em massa</LinkSuspenso>
          <LinkSuspenso href={urlCom("/produtos", sp, { acao: "etiquetas" })} icone="etiqueta">Gerar etiquetas</LinkSuspenso>
          <LinkSuspenso href={urlCom("/produtos", sp, { acao: "excluir" })} icone="excluir">Excluir produtos</LinkSuspenso>
        </>} />

      {sp.busca === "1" && (
        <form action="/produtos" className="cartao no-print mb-3 p-4">
          <input type="hidden" name="busca" value="1" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label><span className="rotulo">Loja</span>
              <select name="loja" defaultValue={sp.loja ?? ""} className="campo"><option value="">Todas</option>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nomeFantasia || e.razaoSocial}</option>)}</select></label>
            <label><span className="rotulo">Grupo</span>
              <select name="grupo" defaultValue={sp.grupo ?? ""} className="campo"><option value="">Todos</option>{grupos.map((g) => <option key={g.id} value={g.id}>{nomeGrupo(g)}</option>)}</select></label>
            <label><span className="rotulo">Nome</span><input name="nome" defaultValue={sp.nome} className="campo" /></label>
            <label><span className="rotulo">Código</span><input name="codigo" defaultValue={sp.codigo} className="campo" /></label>
            <label><span className="rotulo">Ativo</span>
              <select name="ativo" defaultValue={situacaoAtivo(sp.ativo)} className="campo"><option value="sim">Somente ativos</option><option value="nao">Somente inativos</option><option value="todos">Todos</option></select></label>
            <label className="lg:col-span-2"><span className="rotulo">Situação</span>
              <select name="sit" defaultValue={sp.sit ?? ""} className="campo">
                <option value="">Independe</option>
                <option value="zero">Somente com estoque menor ou igual a zero</option>
                <option value="positivo">Somente com estoque acima de zero</option>
                <option value="minimo">Somente com estoque mínimo alcançado</option>
                <option value="maximo">Somente com estoque máximo alcançado</option>
              </select></label>
            <div><span className="rotulo">Fornecedor</span><BuscaFornecedor nome="forn" inicial={fornecedor} /></div>
            {campos.map((c) => <label key={c.id}><span className="rotulo">{c.nome}</span><input name={`ce_${c.id}`} defaultValue={sp[`ce_${c.id}`]} className="campo" /></label>)}
          </div>
          <div className="mt-3 flex gap-2"><button className="btn"><Icone nome="buscar" size={14} /> Buscar</button><Link href="/produtos?busca=1" className="btn-sec"><Icone nome="fechar" size={14} /> Limpar</Link></div>
        </form>
      )}

      {modo === "valores" && (
        <FormAcao acao={ajustarValoresAcao} className="cartao mb-3 p-4">
          <input type="hidden" name="filtros" value={JSON.stringify(filtros)} />
          <div className="mb-2 font-semibold">Ajustar valores em massa <span className="font-normal text-slate-500">· vale para os {total} produto(s) da lista filtrada</span></div>
          <div className="grid items-end gap-3 sm:grid-cols-4">
            <label><span className="rotulo">Valor de venda</span><select name="tipoValorId" className="campo">{tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></label>
            <label><span className="rotulo">Como ajustar</span><select name="modo" className="campo"><option value="percentual">Aumentar/diminuir em %</option><option value="lucro">Recalcular pelo lucro do tipo de valor</option></select></label>
            <label><span className="rotulo">Percentual (%)</span><input name="percentual" className="campo" placeholder="ex.: 10 ou -5" /></label>
            <div className="flex gap-2"><button className="btn">Aplicar</button><Link href={urlCom("/produtos", sp, { acao: undefined })} className="btn-sec">Fechar</Link></div>
          </div>
        </FormAcao>
      )}

      {modo === "massa" ? (
        <FormSelecao acao={ajustarProdutosAcao} titulo="Ajustar produtos em massa" botao="Aplicar nos marcados" voltar={urlCom("/produtos", sp, { acao: undefined })}
          campos={<>
            <select name="grupoId" className="campo"><option value="">Grupo: não mudar</option><option value="-">Sem grupo</option>{grupos.map((g) => <option key={g.id} value={g.id}>{nomeGrupo(g)}</option>)}</select>
            <select name="ativo" className="campo"><option value="">Ativo: não mudar</option><option value="sim">Ativo</option><option value="nao">Inativo</option></select>
            <select name="vendePdv" className="campo"><option value="">PDV: não mudar</option><option value="sim">Vende no PDV</option><option value="nao">Não vende no PDV</option></select>
            <input name="ncm" className="campo" placeholder="NCM: não mudar" />
            <input name="unidade" className="campo" placeholder="Unidade: não mudar" />
            <input name="comissao" className="campo" placeholder="Comissão %: não mudar" />
          </>}>{tabela}</FormSelecao>
      ) : modo === "excluir" ? (
        <FormSelecao acao={excluirProdutosAcao} perigo titulo="Excluir produtos" botao="Excluir marcados" voltar={urlCom("/produtos", sp, { acao: undefined })}
          confirmar="Excluir os produtos marcados? Os que têm movimentação serão só inativados.">{tabela}</FormSelecao>
      ) : modo === "etiquetas" ? (
        <form action="/etiquetas/gerar">
          <div className="mb-2 flex flex-wrap items-center gap-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-[13px]">
            <b>Gerar etiquetas</b> Marque os produtos e clique em continuar.
            <span className="ml-auto flex gap-2"><Link href={urlCom("/produtos", sp, { acao: undefined })} className="btn-sec py-1">Cancelar</Link><button className="btn py-1">Continuar</button></span>
          </div>
          {tabela}
        </form>
      ) : tabela}
    </Pagina>
  );
}
