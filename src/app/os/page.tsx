import Link from "next/link";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { cor } from "@/lib/orcamentos/tipos";
import { ordemOrdens, whereOrdens, type ParamsOs } from "@/lib/os/ordens";
import { avisoSituacaoOs, PRIORIDADES } from "@/lib/os/tipos";
import { alterarSituacaoOsAcao, clonarOsAcao, emitirNotaOsAcao, excluirOsAcao, excluirVariasOsAcao, nfseEmMassaAcao, situacaoOsEmMassaAcao } from "@/lib/os/acoes";
import { colunasVisiveis } from "@/lib/ui/colunas";
import { dataSP, horaSP, num2 } from "@/lib/ui/format";
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
import TrocarVisualizacao from "@/components/os/TrocarVisualizacao";
import Resumo from "@/components/ui/Resumo";
import { brl } from "@/lib/ui/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ordens de serviços" };

const COLUNAS = [
  { chave: "numero", rotulo: "Nº" }, { chave: "nfse", rotulo: "NFS-e" }, { chave: "cliente", rotulo: "Cliente" }, { chave: "entrada", rotulo: "Entrada" }, { chave: "saida", rotulo: "Saída" },
  { chave: "equipamentos", rotulo: "Equipamentos" }, { chave: "situacao", rotulo: "Situação" }, { chave: "valor", rotulo: "Valor" }, { chave: "loja", rotulo: "Loja" },
];
const ORDENS_KANBAN: [string, string][] = [["-numero", "Nº"], ["cliente", "Cliente"], ["-entrada", "Data de abertura"], ["-valor", "Valor total"], ["tecnico", "Responsável"]];

/** Gerenciar O.S. (padrão Gestão Click): lista ou kanban por situação. */
export default async function ListaOs({ searchParams }: { searchParams: Promise<ParamsOs> }) {
  const sp = await searchParams;
  const base = "/os";
  const u = await usuarioAtual();
  const pref = u ? await prisma.configuracao.findUnique({ where: { chave: `os-visualizacao:${u.id}` } }) : null;
  const kanban = (sp.v ?? pref?.valor) === "kanban";
  let where = whereOrdens(sp);
  if (sp.falta) {
    const ids = await prisma.reserva.findMany({ where: { origemTipo: "OS", status: "ATIVA", localId: null }, select: { origemId: true }, distinct: ["origemId"] });
    where = { AND: [where, { id: { in: ids.map((r) => r.origemId) } }] };
  }
  const { pagina, porPagina, skip, take } = lerPagina(sp);
  const [lista, total, soma, situacoes, empresas, usuarios, cliente, produto, servico] = await Promise.all([
    prisma.ordemServico.findMany({
      where, orderBy: ordemOrdens(sp.o), skip: kanban ? 0 : skip, take: kanban ? 1000 : take,
      include: { cliente: { select: { id: true, nome: true, fantasia: true } }, situacaoCfg: true, tecnico: { select: { nome: true } }, equipamentos: { select: { equipamento: true }, orderBy: { ordem: "asc" } } },
    }),
    prisma.ordemServico.count({ where }),
    prisma.ordemServico.aggregate({ where, _sum: { total: true } }),
    prisma.situacaoOsConfig.findMany({ orderBy: { ordem: "asc" } }),
    prisma.empresa.findMany({ select: { id: true, nomeFantasia: true, razaoSocial: true } }),
    prisma.usuario.findMany({ where: { ativo: true }, select: { id: true, nome: true, papel: true, tecnico: true }, orderBy: { nome: "asc" } }),
    sp.cli ? prisma.pessoa.findUnique({ where: { id: sp.cli }, select: { id: true, nome: true } }) : null,
    sp.prod ? prisma.produto.findUnique({ where: { id: sp.prod }, select: { id: true, nome: true } }) : null,
    sp.serv ? prisma.servico.findUnique({ where: { id: sp.serv }, select: { id: true, nome: true } }) : null,
  ]);
  // melhoria sobre o Gestão Click: mostra as OS com peça em falta
  const comFalta = new Set((await prisma.reserva.findMany({ where: { origemTipo: "OS", status: "ATIVA", localId: null, origemId: { in: lista.map((o) => o.id) } }, select: { origemId: true } })).map((r) => r.origemId));
  const centros = (await prisma.ordemServico.findMany({ where: { centroCusto: { not: null } }, distinct: ["centroCusto"], select: { centroCusto: true } })).map((x) => x.centroCusto!);
  const vis = colunasVisiveis(u?.preferencias, base, COLUNAS, ["numero", "nfse", "cliente", "entrada", "saida", "situacao", "valor"]);
  // NFS-e de cada OS e cartões de resumo do período (por situação, sem o filtro de situação)
  const [nfses, porSituacao, faltaTotal] = await Promise.all([
    prisma.notaFiscal.findMany({ where: { origemTipo: "OS", origemId: { in: lista.map((o) => o.id) }, modelo: "NFSE", status: { in: ["AUTORIZADA", "ASSINADA", "ENVIADA"] } }, select: { id: true, origemId: true, numero: true } }),
    prisma.ordemServico.groupBy({ by: ["situacao"], where: whereOrdens({ ...sp, s: undefined }), _sum: { total: true }, _count: true }),
    // OS da empresa atual com peça em falta (a reserva não tem empresa: filtra pela OS)
    prisma.reserva.findMany({ where: { origemTipo: "OS", status: "ATIVA", localId: null }, select: { origemId: true }, distinct: ["origemId"] })
      .then((rs) => prisma.ordemServico.findMany({ where: { id: { in: rs.map((r) => r.origemId) } }, select: { id: true } })),
  ]);
  const nfseDe = new Map(nfses.map((n) => [n.origemId, n]));
  const grupo = (sits: string[]) => porSituacao.filter((g) => sits.includes(g.situacao)).reduce((a, g) => ({ n: a.n + g._count, v: a.v + Number(g._sum.total ?? 0) }), { n: 0, v: 0 });
  const tudo = grupo(porSituacao.map((g) => g.situacao));
  const abertas = grupo(["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_PECA", "AGUARDANDO_APROVACAO"]);
  const feitas = grupo(["CONCLUIDA", "FATURADA"]);
  const canceladas = grupo(["CANCELADA", "DEVOLVIDA_SEM_REPARO"]);
  const pctOs = (x: number) => (tudo.v > 0 ? (x / tudo.v) * 100 : 0);
  const qtdOs = (n: number) => `${n} OS`;
  const tem = (c: string) => vis.includes(c);
  const loja = () => { const e = empresas[0]; return e ? e.nomeFantasia || e.razaoSocial : ""; };
  const modo = sp.acao;
  const selecao = !kanban && (modo === "situacoes" || modo === "excluir" || modo === "imprimir" || modo === "nfse");
  const filtros = Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && !["p", "pp", "acao", "busca", "o", "situacao"].includes(k)));
  const sem = urlCom(base, sp, { acao: undefined, situacao: undefined });
  const emSituacao = sp.situacao ? await prisma.ordemServico.findUnique({ where: { id: sp.situacao }, select: { id: true, numero: true, situacaoId: true } }) : null;
  const opcoesSit = situacoes.map((s) => ({ id: s.id, nome: s.nome, aviso: avisoSituacaoOs(s) }));
  const tecnicos = usuarios.filter((x) => x.tecnico || x.papel === "TECNICO");

  const menuLinha = (o: (typeof lista)[number]) => (
    <Suspenso direita classe="btn-icone" botao={<Icone nome="opcoes" size={13} />}>
      {kanban && <LinkSuspenso href={`/os/${o.id}`} icone="ver">Visualizar</LinkSuspenso>}
      {kanban && <LinkSuspenso href={`/os/${o.id}/editar`} icone="editar">Editar</LinkSuspenso>}
      <a href={`/cobranca/os/${o.token}`} target="_blank" className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="dinheiro" size={15} /> Link de cobrança</a>
      <LinkSuspenso href={urlCom(base, sp, { situacao: o.id })} icone="atualizar">Alterar situação</LinkSuspenso>
      <a href={`/os/${o.id}/imprimir`} target="_blank" className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="imprimir" size={15} /> Imprimir</a>
      <LinkSuspenso href={`/os/${o.id}?compartilhar=1`} icone="compartilhar">Compartilhar</LinkSuspenso>
      <LinkSuspenso href={`/os/${o.id}/separacao`} icone="locais">Lista de separação</LinkSuspenso>
      {["CONCLUIDA", "FATURADA"].includes(o.situacao) && Number(o.totalServicos) > 0 && <BotaoAcao acao={emitirNotaOsAcao.bind(null, o.id, "NFSE")} icone="notas" confirmar={`Emitir a NFS-e da OS nº ${o.numero}?`}>Emitir NFS-e</BotaoAcao>}
      {["CONCLUIDA", "FATURADA"].includes(o.situacao) && Number(o.totalProdutos) > 0 && <BotaoAcao acao={emitirNotaOsAcao.bind(null, o.id, "NFE")} icone="notas" confirmar={`Emitir a NF-e das peças da OS nº ${o.numero}?`}>Emitir NF-e</BotaoAcao>}
      <BotaoAcao acao={clonarOsAcao.bind(null, o.id)} icone="copiar">Gerar cópia</BotaoAcao>
      <BotaoExcluir acao={excluirOsAcao.bind(null, o.id)} pergunta={`Excluir a OS nº ${o.numero}? As peças voltam ao estoque e as contas a receber em aberto são apagadas.`} rotulo="Excluir" />
    </Suspenso>
  );
  const pilula = (o: (typeof lista)[number]) => {
    const c = cor(o.situacaoCfg?.cor ?? "cinza");
    return <span className={`pilula ${c.pilula}`}>{o.situacaoCfg?.nome ?? o.situacao}</span>;
  };

  const tabela = (
    <div className="cartao overflow-x-auto">
      <table className="tabela">
        <thead><tr>
          {selecao && <th className="w-8"></th>}
          {tem("numero") && <Ordenar base={base} params={sp} campo="numero" className="w-20">Nº</Ordenar>}
          {tem("nfse") && <th className="w-20">NFS-e</th>}
          {tem("cliente") && <Ordenar base={base} params={sp} campo="cliente">Cliente</Ordenar>}
          {tem("entrada") && <Ordenar base={base} params={sp} campo="entrada" className="w-28">Entrada</Ordenar>}
          {tem("saida") && <Ordenar base={base} params={sp} campo="saida" className="w-28">Saída</Ordenar>}
          {tem("equipamentos") && <th>Equipamentos</th>}
          {tem("situacao") && <Ordenar base={base} params={sp} campo="situacao" className="w-48">Situação</Ordenar>}
          {tem("valor") && <Ordenar base={base} params={sp} campo="valor" className="w-32 text-right">Valor</Ordenar>}
          {tem("loja") && <th className="w-32">Loja</th>}
          <th className="w-28 text-right">Ações</th>
        </tr></thead>
        <tbody>
          {lista.map((o) => (
            <tr key={o.id}>
              {selecao && <td><input type="checkbox" name="ids" value={o.id} /></td>}
              {tem("numero") && <td>{o.numero}</td>}
              {tem("nfse") && <td>{nfseDe.get(o.id) ? <Link href={`/fiscal/${nfseDe.get(o.id)!.id}`} className="sublinhado">#{nfseDe.get(o.id)!.numero}</Link> : <span className="text-slate-400">—</span>}</td>}
              {tem("cliente") && <td><Link href={`/os/${o.id}`} className="uppercase sublinhado">{o.cliente.nome}</Link>{o.cliente.fantasia && o.cliente.fantasia !== o.cliente.nome && <i className="block text-[11px] uppercase text-slate-500">({o.cliente.fantasia})</i>}</td>}
              {tem("entrada") && <td>{dataSP(o.entrada)}<div className="text-[11px] text-slate-400">{horaSP(o.entrada)}</div></td>}
              {tem("saida") && <td>{o.saida ? <>{dataSP(o.saida)}<div className="text-[11px] text-slate-400">{horaSP(o.saida)}</div></> : <span className="text-slate-400">—</span>}</td>}
              {tem("equipamentos") && <td className="text-[12px]">{o.equipamentos.map((e) => e.equipamento).join(", ")}</td>}
              {tem("situacao") && <td><div className="flex flex-wrap gap-1">{pilula(o)}{comFalta.has(o.id) && <span className="pilula border-red-300 bg-red-50 text-red-700">Peça em falta</span>}</div></td>}
              {tem("valor") && <td className="text-right">{num2(o.total)}</td>}
              {tem("loja") && <td className="text-[12px] uppercase">{loja()}</td>}
              <td><div className="flex justify-end gap-1">
                <Link href={`/os/${o.id}`} className="btn-icone" title="Visualizar"><Icone nome="ver" size={13} /></Link>
                <Link href={`/os/${o.id}/editar`} className="btn-icone" title="Editar"><Icone nome="editar" size={13} /></Link>
                {menuLinha(o)}
              </div></td>
            </tr>
          ))}
          {!lista.length && <tr><td colSpan={10} className="py-10 text-center text-slate-500">Nenhuma ordem de serviço no período.</td></tr>}
        </tbody>
        {lista.length > 0 && <tfoot><tr><td colSpan={10} className="text-right text-[12px] text-slate-600">Total das {total} OS: <b>R$ {num2(soma._sum.total)}</b></td></tr></tfoot>}
      </table>
      <Paginacao base={base} params={sp} total={total} pagina={pagina} porPagina={porPagina} />
    </div>
  );

  const colunasKanban = situacoes.filter((s) => s.exibir || sp.s === s.id);
  const quadro = (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {colunasKanban.map((s) => {
        const c = cor(s.cor);
        const ordens = lista.filter((o) => o.situacaoId === s.id);
        return (
          <div key={s.id} className="w-72 shrink-0 rounded-md border border-slate-200 bg-slate-50">
            <div className="flex items-center gap-2 border-b bg-white px-3 py-2 text-[12px]">
              <span className={`pilula ${c.pilula}`}>{s.nome}</span>
              <span className="text-slate-500">· {ordens.length}</span>
              <span className="ml-auto font-semibold">R$ {num2(ordens.reduce((a, o) => a + Number(o.total), 0))}</span>
            </div>
            <div className="max-h-[70vh] space-y-2 overflow-y-auto p-2">
              {ordens.map((o) => (
                <div key={o.id} className="rounded border border-slate-200 bg-white p-2.5 text-[12px] shadow-sm">
                  <div className="flex items-start gap-1">
                    <Link href={`/os/${o.id}`} className="font-semibold uppercase text-slate-800 hover:text-marca">{o.cliente.nome}</Link>
                    <span className="ml-auto">{menuLinha(o)}</span>
                  </div>
                  <div className="text-slate-500">OS #{o.numero} · {dataSP(o.entrada)}</div>
                  <div className="mt-1 flex items-center gap-1 text-slate-600"><Icone nome="pessoa" size={12} /> {o.tecnico?.nome ?? "Sem técnico"}</div>
                  <div className="mt-1 flex items-center gap-1"><b>R$ {num2(o.total)}</b>{comFalta.has(o.id) && <span className="pilula ml-auto border-red-300 bg-red-50 text-red-700">Peça em falta</span>}</div>
                </div>
              ))}
              {!ordens.length && <p className="py-6 text-center text-slate-400">Nenhuma OS nesta situação</p>}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <Pagina titulo="Ordens de serviços" icone="os" trilha={[{ rotulo: "Ordens de serviços", href: base }, { rotulo: "Listar" }]}>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <Link href="/os/adicionar" className="btn"><Icone nome="mais" size={15} /> Adicionar</Link>
        <Suspenso classe="btn-sec" botao={<><Icone nome="ajustes" size={15} /> Mais ações <Icone nome="abaixo" size={13} /></>}>
          <LinkSuspenso href={urlCom(base, sp, { acao: "nfse", v: "lista" })} icone="notas">Gerar NFS-e</LinkSuspenso>
          <LinkSuspenso href={urlCom(base, sp, { acao: "imprimir", v: "lista" })} icone="imprimir">Imprimir</LinkSuspenso>
          <a href={urlCom("/api/os/exportar", filtros, {})} className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="exportar" size={15} /> Exportar</a>
          <LinkSuspenso href={urlCom(base, sp, { acao: "situacoes", v: "lista" })} icone="atualizar">Alterar situação</LinkSuspenso>
          <LinkSuspenso href={urlCom(base, sp, { acao: "excluir", v: "lista" })} icone="excluir">Excluir</LinkSuspenso>
          <LinkSuspenso href="/os/painel" icone="painel">Painel de OS</LinkSuspenso>
          <LinkSuspenso href={urlCom(base, {}, { periodo: "todos", falta: "1" })} icone="alerta">OS com peça em falta</LinkSuspenso>
        </Suspenso>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {kanban ? (
            <Suspenso classe="btn-sec" botao={<><Icone nome="lista" size={14} /> Ordenar por <Icone nome="abaixo" size={13} /></>}>
              {ORDENS_KANBAN.map(([o, r]) => <LinkSuspenso key={o} href={urlCom(base, sp, { o })}>{r}</LinkSuspenso>)}
            </Suspenso>
          ) : <GerenciarColunas lista={base} colunas={COLUNAS} visiveis={vis} />}
          <SeletorPeriodo base={base} params={sp} />
          <form action={base} className="flex">
            {Object.entries(sp).filter(([k, v]) => v && !["q", "p"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <input name="q" defaultValue={sp.q} placeholder="Buscar por nº, cliente ou equipamento" className="campo w-64 rounded-r-none" />
            <button className="btn rounded-l-none px-2.5" title="Buscar"><Icone nome="buscar" size={15} /></button>
          </form>
          <Link href={urlCom(base, sp, { busca: sp.busca === "1" ? undefined : "1" })} className={sp.busca === "1" ? "btn-sec" : "btn"} title="Busca avançada"><Icone nome="filtro" size={15} /></Link>
          <TrocarVisualizacao kanban={kanban} lista={urlCom(base, sp, { v: undefined })} />
        </div>
      </div>

      {sp.busca === "1" && (
        <form action={base} className="cartao no-print mb-3 p-4">
          <input type="hidden" name="busca" value="1" /><input type="hidden" name="periodo" value="todos" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label><span className="rotulo">Loja</span><select name="loja" defaultValue={sp.loja ?? ""} className="campo"><option value="">Todas</option>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nomeFantasia || e.razaoSocial}</option>)}</select></label>
            <label><span className="rotulo">Código</span><input name="codigo" defaultValue={sp.codigo} className="campo" /></label>
            <div><span className="rotulo">Data de entrada</span><div className="flex items-center gap-1"><input type="date" name="de" defaultValue={sp.de} className="campo" /> a <input type="date" name="ate" defaultValue={sp.ate} className="campo" /></div></div>
            <div><span className="rotulo">Data de saída</span><div className="flex items-center gap-1"><input type="date" name="sde" defaultValue={sp.sde} className="campo" /> a <input type="date" name="sate" defaultValue={sp.sate} className="campo" /></div></div>
            <div><span className="rotulo">Cliente</span><BuscaPessoa nome="cli" papel="cliente" inicial={cliente} /></div>
            <label><span className="rotulo">Situação</span><select name="s" defaultValue={sp.s ?? ""} className="campo"><option value="">Todos</option>{situacoes.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>
            <label><span className="rotulo">Prioridade</span><select name="pri" defaultValue={sp.pri ?? ""} className="campo"><option value="">Todos</option>{PRIORIDADES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></label>
            <label><span className="rotulo">Equipamento</span><input name="eq" defaultValue={sp.eq} className="campo" /></label>
            <label><span className="rotulo">Marca</span><input name="marca" defaultValue={sp.marca} className="campo" /></label>
            <label><span className="rotulo">Modelo</span><input name="modelo" defaultValue={sp.modelo} className="campo" /></label>
            <label><span className="rotulo">Série</span><input name="serie" defaultValue={sp.serie} className="campo" /></label>
            <div><span className="rotulo">Produto</span><BuscaPessoa nome="prod" papel="produto" inicial={produto} /></div>
            <div><span className="rotulo">Serviço</span><BuscaPessoa nome="serv" papel="servico" inicial={servico} /></div>
            <label><span className="rotulo">Vendedor</span><select name="vend" defaultValue={sp.vend ?? ""} className="campo"><option value="">Todos</option>{usuarios.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
            <label><span className="rotulo">Técnico</span><select name="tec" defaultValue={sp.tec ?? ""} className="campo"><option value="">Todos</option>{(tecnicos.length ? tecnicos : usuarios).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
            <label><span className="rotulo">Centro de custo</span><select name="cc" defaultValue={sp.cc ?? ""} className="campo"><option value="">Todos</option>{centros.map((c) => <option key={c}>{c}</option>)}</select></label>
          </div>
          <div className="mt-3 flex gap-2"><button className="btn"><Icone nome="buscar" size={14} /> Buscar</button><Link href={`${base}?busca=1`} className="btn-sec"><Icone nome="fechar" size={14} /> Limpar</Link></div>
        </form>
      )}

      <Resumo cartoes={[
        { rotulo: "Total do período", valor: brl(tudo.v), legenda: `${qtdOs(tudo.n)} no período`, icone: "os", cor: "tinta", pct: tudo.v > 0 ? 100 : 0, href: urlCom(base, sp, { s: undefined, falta: undefined, p: undefined }) },
        { rotulo: "Em aberto", valor: brl(abertas.v), legenda: `${qtdOs(abertas.n)} em andamento`, icone: "hoje", cor: "azul", pct: pctOs(abertas.v), href: urlCom(base, sp, { s: sp.s === "abertas" ? undefined : "abertas", p: undefined }), ativo: sp.s === "abertas" },
        { rotulo: "Concretizadas", valor: brl(feitas.v), legenda: `${qtdOs(feitas.n)} concluídas ou faturadas`, icone: "confirmado", cor: "verde", pct: pctOs(feitas.v) },
        { rotulo: "Canceladas", valor: brl(canceladas.v), legenda: `${qtdOs(canceladas.n)} canceladas ou devolvidas`, icone: "fechar", cor: "vermelho", pct: pctOs(canceladas.v) },
        { rotulo: "Peça em falta", valor: String(faltaTotal.length), legenda: "OS esperando peça (todas as datas)", icone: "alerta", cor: "amarelo", href: urlCom(base, {}, { periodo: "todos", falta: sp.falta ? undefined : "1" }), ativo: !!sp.falta },
      ]} />

      {emSituacao && <FormSituacao id={emSituacao.id} numero={emSituacao.numero} atual={emSituacao.situacaoId ?? ""} situacoes={opcoesSit} voltar={sem} acao={alterarSituacaoOsAcao} rotulo="da OS" />}

      {kanban ? quadro : modo === "situacoes" ? (
        <FormSelecao acao={situacaoOsEmMassaAcao} titulo="Alterar situação" botao="Aplicar nos marcados" voltar={sem}
          campos={<select name="situacaoId" className="campo"><option value="">Escolha a situação</option>{opcoesSit.map((s) => <option key={s.id} value={s.id}>{s.nome} ({s.aviso})</option>)}</select>}>{tabela}</FormSelecao>
      ) : modo === "excluir" ? (
        <FormSelecao acao={excluirVariasOsAcao} perigo titulo="Excluir OS" botao="Excluir marcadas" voltar={sem} confirmar="Excluir as OS marcadas? As peças voltam ao estoque e as contas a receber em aberto são apagadas.">{tabela}</FormSelecao>
      ) : modo === "nfse" ? (
        <FormSelecao acao={nfseEmMassaAcao} titulo="Gerar NFS-e" botao="Emitir NFS-e das marcadas" voltar={sem} confirmar="Emitir a NFS-e das OS marcadas?">{tabela}</FormSelecao>
      ) : modo === "imprimir" ? (
        <form action="/os/imprimir" target="_blank">
          <div className="mb-2 flex flex-wrap items-center gap-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-[13px]">
            <b>Imprimir</b> Marque as OS e clique em imprimir.
            <span className="ml-auto flex gap-2"><Link href={sem} className="btn-sec py-1">Cancelar</Link><button className="btn py-1">Imprimir</button></span>
          </div>
          {tabela}
        </form>
      ) : tabela}
    </Pagina>
  );
}
