import Link from "next/link";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { whereServicos, ordemServicos, type ParamsLista } from "@/lib/itens/filtros";
import { excluirServicoAcao, excluirServicosAcao } from "@/lib/itens/acoes";
import { colunasVisiveis } from "@/lib/ui/colunas";
import { dataSP, num2 } from "@/lib/ui/format";
import { Pagina } from "@/components/ui/Pagina";
import BarraCadastro, { AcoesLinha } from "@/components/ui/BarraCadastro";
import { LinkSuspenso, urlCom } from "@/components/ui/BarraLista";
import GerenciarColunas from "@/components/ui/GerenciarColunas";
import Paginacao, { Ordenar, lerPagina } from "@/components/ui/Paginacao";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import FormSelecao from "@/components/ui/FormSelecao";
import Icone from "@/components/Icone";
import BuscaFornecedor from "@/components/itens/BuscaFornecedor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Serviços" };

const COLUNAS = [{ chave: "codigo", rotulo: "Código" }, { chave: "nome", rotulo: "Nome" }, { chave: "custo", rotulo: "Valor de custo" }, { chave: "valor", rotulo: "Valor de venda" }, { chave: "cadastrado", rotulo: "Cadastrado em" }];

export default async function Servicos({ searchParams }: { searchParams: Promise<ParamsLista> }) {
  const sp = await searchParams;
  const u = await usuarioAtual();
  const where = whereServicos(sp);
  const { pagina, porPagina, skip, take } = lerPagina(sp);
  const [lista, total, empresas, fornecedor] = await Promise.all([
    prisma.servico.findMany({ where, orderBy: [ordemServicos(sp.o), { id: "asc" }], skip, take, select: { id: true, codigo: true, nome: true, custo: true, preco: true, ativo: true, createdAt: true } }),
    prisma.servico.count({ where }),
    prisma.empresa.findMany({ select: { id: true, nomeFantasia: true, razaoSocial: true } }),
    sp.forn ? prisma.pessoa.findUnique({ where: { id: sp.forn }, select: { id: true, nome: true } }) : null,
  ]);
  const vis = colunasVisiveis(u?.preferencias, "/servicos", COLUNAS, ["codigo", "nome", "custo", "valor"]);
  const tem = (c: string) => vis.includes(c);
  const excluir = sp.acao === "excluir";
  const filtros = Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && !["p", "pp", "acao", "busca", "o"].includes(k)));

  const tabela = (
    <div className="cartao overflow-x-auto">
      <table className="tabela">
        <thead><tr>
          {excluir && <th className="w-8"></th>}
          {tem("codigo") && <Ordenar base="/servicos" params={sp} campo="codigo" className="w-28">Código</Ordenar>}
          {tem("nome") && <Ordenar base="/servicos" params={sp} campo="nome">Nome</Ordenar>}
          {tem("custo") && <Ordenar base="/servicos" params={sp} campo="custo" className="w-36 text-right">Valor de custo</Ordenar>}
          {tem("valor") && <Ordenar base="/servicos" params={sp} campo="valor" className="w-36 text-right">Valor de venda</Ordenar>}
          {tem("cadastrado") && <th className="w-32">Cadastrado em</th>}
          <th className="w-28 text-right">Ações</th>
        </tr></thead>
        <tbody>
          {lista.map((s) => (
            <tr key={s.id} className={s.ativo ? "" : "text-slate-400"}>
              {excluir && <td><input type="checkbox" name="ids" value={s.id} /></td>}
              {tem("codigo") && <td>{s.codigo}</td>}
              {tem("nome") && <td><Link href={`/servicos/${s.id}`} className="hover:underline">{s.nome}</Link>{!s.ativo && <span className="ml-2 text-[11px]">(inativo)</span>}</td>}
              {tem("custo") && <td className="text-right">{num2(s.custo)}</td>}
              {tem("valor") && <td className="text-right">{num2(s.preco)}</td>}
              {tem("cadastrado") && <td>{dataSP(s.createdAt)}</td>}
              <td><AcoesLinha ver={`/servicos/${s.id}`} editar={`/servicos/${s.id}/editar`}
                excluir={<BotaoExcluir acao={excluirServicoAcao.bind(null, s.id)} pergunta={`Excluir ${s.nome}?`} />} /></td>
            </tr>
          ))}
          {!lista.length && <tr><td colSpan={7} className="py-10 text-center text-slate-500">Nenhum serviço encontrado.</td></tr>}
        </tbody>
      </table>
      <Paginacao base="/servicos" params={sp} total={total} pagina={pagina} porPagina={porPagina} />
    </div>
  );

  return (
    <Pagina titulo="Serviços" icone="servicos" trilha={[{ rotulo: "Serviços", href: "/servicos" }, { rotulo: "Listar" }]}>
      <BarraCadastro base="/servicos" params={sp} adicionar={{ href: "/servicos/adicionar" }} placeholder="Buscar por nome ou código"
        colunas={<GerenciarColunas lista="/servicos" colunas={COLUNAS} visiveis={vis} />}
        maisAcoes={<>
          <LinkSuspenso href="/servicos/importar" icone="importar">Importar</LinkSuspenso>
          <a href={urlCom("/api/itens/exportar", { ...filtros, tipo: "servicos" }, {})} className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="exportar" size={15} /> Exportar cadastros</a>
          <LinkSuspenso href={urlCom("/servicos", sp, { acao: "excluir" })} icone="excluir">Excluir serviços</LinkSuspenso>
        </>} />

      {sp.busca === "1" && (
        <form action="/servicos" className="cartao no-print mb-3 p-4">
          <input type="hidden" name="busca" value="1" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label><span className="rotulo">Loja</span>
              <select name="loja" defaultValue={sp.loja ?? ""} className="campo"><option value="">Todas</option>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nomeFantasia || e.razaoSocial}</option>)}</select></label>
            <label><span className="rotulo">Nome</span><input name="nome" defaultValue={sp.nome} className="campo" /></label>
            <label><span className="rotulo">Código</span><input name="codigo" defaultValue={sp.codigo} className="campo" /></label>
            <label><span className="rotulo">Ativo</span>
              <select name="ativo" defaultValue={sp.ativo ?? ""} className="campo"><option value="">Todos</option><option value="sim">Sim</option><option value="nao">Não</option></select></label>
            <div><span className="rotulo">Fornecedor</span><BuscaFornecedor nome="forn" inicial={fornecedor} /></div>
          </div>
          <div className="mt-3 flex gap-2"><button className="btn"><Icone nome="buscar" size={14} /> Buscar</button><Link href="/servicos?busca=1" className="btn-sec"><Icone nome="fechar" size={14} /> Limpar</Link></div>
        </form>
      )}

      {excluir ? (
        <FormSelecao acao={excluirServicosAcao} perigo titulo="Excluir serviços" botao="Excluir marcados" voltar={urlCom("/servicos", sp, { acao: undefined })}
          confirmar="Excluir os serviços marcados? Os que estão em OS ou vendas serão só inativados.">{tabela}</FormSelecao>
      ) : tabela}
    </Pagina>
  );
}
