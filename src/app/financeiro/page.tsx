import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { garantirPadroes } from "@/lib/financeiro/padroes";
import { planoDeContas } from "@/lib/financeiro/plano";
import { avisosPendentes } from "@/lib/financeiro/avisosBoleto";
import { ROTULO_BOLETO } from "@/lib/financeiro/boletos";
import { diaSP, periodoDia } from "@/lib/datas";
import { brl, num2 } from "@/lib/ui/format";
import { boletoAbrivel, contaAvulsa, iconeForma, ordemContas, origemConta, situacaoConta, whereContas, whereSituacao, type ParamsContas } from "@/lib/financeiro/lista";
import { baixarVariasAcao, estornarContaAcao, excluirContaAcao, excluirVariasAcao } from "./actions";
import { Pagina } from "@/components/ui/Pagina";
import { LinkSuspenso, urlCom } from "@/components/ui/BarraLista";
import Paginacao, { Ordenar, lerPagina } from "@/components/ui/Paginacao";
import Resumo from "@/components/ui/Resumo";
import Suspenso from "@/components/ui/Suspenso";
import SeletorPeriodo from "@/components/ui/SeletorPeriodo";
import FormSelecao from "@/components/ui/FormSelecao";
import BotaoAcao from "@/components/ui/BotaoAcao";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import BuscaPessoa from "@/components/orcamentos/BuscaPessoa";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Financeiro" };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const diaBr = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });

/** Contas a receber e contas a pagar no padrão do Gestão Click: cartões de resumo, mês, tabela e ações. */
export default async function Contas({ searchParams }: { searchParams: Promise<ParamsContas> }) {
  const sp = await searchParams;
  // endereços antigos (?de=&ate=, ?f=vencidos, ?q=): converte para o seletor de período
  if (sp.de || sp.ate) {
    redirect(urlCom("/financeiro", sp, { de: undefined, ate: undefined, periodo: "periodo", pde: sp.de ?? sp.ate, pate: sp.ate ?? sp.de }));
  }
  const tipo = sp.tipo === "PAGAR" ? "PAGAR" : "RECEBER";
  const pagar = tipo === "PAGAR";
  const base = "/financeiro";
  const params: ParamsContas = { ...sp, tipo };
  const hoje = diaSP();
  await prisma.$transaction((tx) => garantirPadroes(tx));

  const filtro = whereContas(tipo, params);
  const where = { AND: [filtro, whereSituacao(sp.f, hoje)] };
  const { pagina, porPagina, skip, take } = lerPagina(sp);
  const soma = (w: object) => prisma.lancamento.aggregate({ where: { AND: [filtro, w] }, _sum: { valor: true }, _count: true });
  const periodo = periodoDia(sp.periodo, sp.pde, sp.pate);

  const [lista, total, somaFiltro, totPeriodo, totVenc, totHoje, totAVencer, totPagos, vencAntes, contas, categorias, formas, centros, avisos, pessoa] = await Promise.all([
    prisma.lancamento.findMany({
      where, orderBy: ordemContas(sp.o), skip, take,
      include: {
        pessoa: { select: { id: true, nome: true, fantasia: true, cliente: true, fornecedor: true } }, formaPagamento: true, contaBancaria: { select: { nome: true } },
        categoria: { select: { nome: true, codigo: true } }, boletos: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, situacao: true } },
      },
    }),
    prisma.lancamento.count({ where }),
    prisma.lancamento.aggregate({ where, _sum: { valor: true } }),
    soma({}), soma(whereSituacao("vencidos", hoje)), soma(whereSituacao("hoje", hoje)), soma(whereSituacao("avencer", hoje)), soma(whereSituacao("pagos", hoje)),
    // vencidos de antes do período escolhido (melhoria: o Gestão Click só mostra os do mês)
    periodo ? prisma.lancamento.aggregate({ where: { tipo, pagoEm: null, vencimento: { lt: periodo.de < hoje ? periodo.de : hoje } }, _sum: { valor: true }, _count: true }) : null,
    prisma.contaBancaria.findMany({ where: { ativa: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.$transaction((tx) => planoDeContas(tx, { tipo, ativas: true })),
    prisma.formaPagamento.findMany({ where: { ativa: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.centroCusto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    pagar ? 0 : avisosPendentes(),
    sp.cli ? prisma.pessoa.findUnique({ where: { id: sp.cli }, select: { id: true, nome: true } }) : null,
  ]);

  // NF-e e NFS-e do documento que gerou a conta
  const origens = lista.filter((l) => l.origemId && (l.origemTipo === "VENDA" || l.origemTipo === "OS")).map((l) => l.origemId!);
  const compras = lista.filter((l) => l.origemId && l.origemTipo === "COMPRA").map((l) => l.origemId!);
  const [notas, nfCompras] = await Promise.all([
    origens.length ? prisma.notaFiscal.findMany({ where: { origemId: { in: origens }, status: { in: ["AUTORIZADA", "ASSINADA", "ENVIADA"] } }, select: { id: true, origemId: true, numero: true, modelo: true } }) : [],
    compras.length ? prisma.compra.findMany({ where: { id: { in: compras } }, select: { id: true, numeroNfe: true } }) : [],
  ]);
  const nfe = (id: string | null) => notas.find((n) => n.origemId === id && n.modelo !== "NFSE");
  const nfse = (id: string | null) => notas.find((n) => n.origemId === id && n.modelo === "NFSE");
  const nfCompra = new Map(nfCompras.map((c) => [c.id, c.numeroNfe]));

  const v = (a: { _sum: { valor: unknown } }) => Number(a._sum.valor ?? 0);
  const totalV = v(totPeriodo);
  const pct = (x: number) => (totalV > 0 ? (x / totalV) * 100 : 0);
  const cartao = (f: string) => ({ href: urlCom(base, params, { f: sp.f === f ? undefined : f, p: undefined }), ativo: sp.f === f });
  const plural = (n: number) => `${n} conta${n === 1 ? "" : "s"}`;
  const titulo = pagar ? "Contas a pagar" : "Contas a receber";
  const modo = sp.acao;
  const selecao = modo === "baixar" || modo === "excluir";
  const sem = urlCom(base, params, { acao: undefined });
  const rotuloCat = (c: { codigo: string | null; nome: string }) => (c.codigo ? `${c.codigo} ${c.nome}` : c.nome);
  const linkPessoa = (p: { id: string; cliente: boolean; fornecedor: boolean }) => (pagar ? (p.fornecedor ? `/fornecedores/${p.id}` : `/clientes/${p.id}`) : (p.cliente || !p.fornecedor ? `/clientes/${p.id}` : `/fornecedores/${p.id}`));

  const tabela = (
    <div className="cartao overflow-x-auto">
      <table className="tabela">
        <thead><tr>
          {selecao && <th className="w-8"></th>}
          <Ordenar base={base} params={params} campo="descricao">Descrição</Ordenar>
          <Ordenar base={base} params={params} campo="entidade">Entidade</Ordenar>
          <th className="w-44">Pagamento</th>
          <Ordenar base={base} params={params} campo="vencimento" className="w-28">Vencimento</Ordenar>
          <th className="w-16">NF-e</th>
          {!pagar && <th className="w-16">NFS-e</th>}
          <th className="w-28 text-center">Situação</th>
          <Ordenar base={base} params={params} campo="valor" className="w-28 text-right">Valor</Ordenar>
          <th className="w-28 text-right">Ações</th>
        </tr></thead>
        <tbody>
          {lista.map((l) => {
            const s = situacaoConta(l, hoje);
            const ic = iconeForma(l.formaPagamento);
            const orig = origemConta(l);
            const nf = nfe(l.origemId), ns = nfse(l.origemId);
            const nfc = l.origemId ? nfCompra.get(l.origemId) : null;
            const bol = l.boletos[0];
            const pdf = boletoAbrivel(bol);
            return (
              <tr key={l.id}>
                {selecao && <td><input type="checkbox" name="ids" value={l.id} disabled={modo === "baixar" ? !!l.pagoEm : !!l.pagoEm || !contaAvulsa(l)} /></td>}
                <td>
                  {/* conta de venda/OS/compra: a descrição abre o documento que gerou o título (a lupa abre a conta) */}
                  <Link href={orig?.href ?? `/financeiro/lancamentos/${l.id}`} title={orig?.rotulo} className="hover:underline">{l.descricao}</Link>
                  {orig && <Link href={orig.href} title={orig.rotulo} className="ml-1.5 inline-block align-[-2px] text-slate-500 hover:text-slate-900"><Icone nome={orig.icone} size={13} /></Link>}
                  <div className="text-[11px] text-slate-500">{rotuloCat(l.categoria)}</div>
                </td>
                <td>
                  {l.pessoa
                    ? <><Link href={linkPessoa(l.pessoa)} className="sublinhado">{l.pessoa.nome}</Link>{l.pessoa.fantasia && l.pessoa.fantasia !== l.pessoa.nome && <i className="block text-[11px] text-slate-500">({l.pessoa.fantasia})</i>}</>
                    : <span className="text-slate-400">—</span>}
                </td>
                <td>
                  {l.formaPagamento ? <span className="inline-flex items-center gap-1.5">{l.formaPagamento.nome}{ic && <Icone nome={ic.nome} size={14} className={ic.cor} />}</span> : <span className="text-slate-400">—</span>}
                  {bol && (pdf
                    ? <a href={pdf} target="_blank" rel="noreferrer" className="block text-[11px] text-slate-500 hover:text-slate-900 hover:underline" title="Abrir o boleto">boleto: {(ROTULO_BOLETO[bol.situacao] ?? bol.situacao).toLowerCase()}</a>
                    : <div className="text-[11px] text-slate-500">boleto: {(ROTULO_BOLETO[bol.situacao] ?? bol.situacao).toLowerCase()}</div>)}
                </td>
                <td>
                  {diaBr(l.vencimento)}
                  {l.pagoEm && <div className="text-[11px] text-emerald-700">{pagar ? "pago" : "recebido"} {diaBr(l.pagoEm)}</div>}
                </td>
                <td>{nf ? <Link href={`/fiscal/${nf.id}`} className="sublinhado">{nf.numero}</Link> : nfc ? nfc : <span className="text-slate-400">—</span>}</td>
                {!pagar && <td>{ns ? <Link href={`/fiscal/${ns.id}`} className="sublinhado">{ns.numero}</Link> : <span className="text-slate-400">—</span>}</td>}
                <td className="text-center"><span className={`pilula ${s.pilula}`}>{s.rotulo}</span></td>
                <td className="text-right">
                  {num2(l.valor)}
                  {l.pagoEm && l.valorPago != null && Number(l.valorPago) !== Number(l.valor) && <div className="text-[11px] text-slate-500">pago {num2(l.valorPago)}</div>}
                </td>
                <td>
                  <div className="flex justify-end gap-1">
                    <Link href={`/financeiro/lancamentos/${l.id}`} className="btn-icone" title="Visualizar"><Icone nome="ver" size={13} /></Link>
                    {l.pagoEm
                      ? <span className="btn-icone cursor-not-allowed opacity-40" title="Conta baixada: estorne para editar"><Icone nome="editar" size={13} /></span>
                      : <Link href={`/financeiro/lancamentos/${l.id}/editar`} className="btn-icone" title="Editar"><Icone nome="editar" size={13} /></Link>}
                    <Suspenso direita classe="btn-icone" botao={<Icone nome="opcoes" size={13} />}>
                      {!l.pagoEm && <LinkSuspenso href={`/financeiro/lancamentos/${l.id}#baixa`} icone="confirmado">{pagar ? "Confirmar pagamento" : "Confirmar recebimento"}</LinkSuspenso>}
                      {l.pagoEm && !l.transferenciaId && <BotaoAcao acao={estornarContaAcao.bind(null, l.id)} icone="atualizar" confirmar={`Estornar a baixa de "${l.descricao}"? A conta volta a ficar em aberto.`}>Estornar baixa</BotaoAcao>}
                      {!pagar && pdf && <a href={pdf} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="boleto" size={15} /> Abrir boleto</a>}
                      {!pagar && !l.pagoEm && <LinkSuspenso href={`/financeiro/lancamentos/${l.id}#boleto`} icone="envios">{pdf ? "Enviar ou cancelar boleto" : "Emitir boleto"}</LinkSuspenso>}
                      {orig && <LinkSuspenso href={orig.href} icone={orig.icone}>{orig.rotulo}</LinkSuspenso>}
                      <LinkSuspenso href={`/financeiro/adicionar?tipo=${tipo}&copia=${l.id}`} icone="copiar">Duplicar</LinkSuspenso>
                      {!l.pagoEm && contaAvulsa(l) && <BotaoExcluir acao={excluirContaAcao.bind(null, l.id)} pergunta={`Excluir "${l.descricao}" (${brl(l.valor)})?`} rotulo="Excluir" />}
                    </Suspenso>
                  </div>
                </td>
              </tr>
            );
          })}
          {!lista.length && <tr><td colSpan={10} className="py-10 text-center text-slate-500">Nenhuma conta {pagar ? "a pagar" : "a receber"} {periodo ? "no período" : "encontrada"}.</td></tr>}
        </tbody>
        {lista.length > 0 && (
          <tfoot><tr><td colSpan={10} className="text-right text-[12px] text-slate-600">
            Total das {total} conta(s) filtrada(s): <b>{brl(somaFiltro._sum.valor)}</b>
          </td></tr></tfoot>
        )}
      </table>
      <Paginacao base={base} params={params} total={total} pagina={pagina} porPagina={porPagina} />
    </div>
  );

  return (
    <Pagina titulo={titulo} icone={pagar ? "pagar" : "receber"} trilha={[{ rotulo: titulo, href: `${base}?tipo=${tipo}` }, { rotulo: "Listar" }]}>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <Link href={`/financeiro/adicionar?tipo=${tipo}`} className="btn"><Icone nome="mais" size={15} /> Adicionar</Link>
        <Suspenso classe="btn-sec" botao={<><Icone nome="ajustes" size={15} /> Mais ações <Icone nome="abaixo" size={13} /></>}>
          <LinkSuspenso href={urlCom(base, params, { acao: "baixar" })} icone="confirmado">{pagar ? "Pagar várias" : "Receber várias"}</LinkSuspenso>
          <LinkSuspenso href={urlCom(base, params, { acao: "excluir" })} icone="excluir">Excluir várias</LinkSuspenso>
          <div className="my-1 border-t" />
          <LinkSuspenso href={`/financeiro?tipo=${pagar ? "RECEBER" : "PAGAR"}`} icone={pagar ? "receber" : "pagar"}>{pagar ? "Contas a receber" : "Contas a pagar"}</LinkSuspenso>
          <LinkSuspenso href="/financeiro/fluxo" icone="grafico">Fluxo de caixa</LinkSuspenso>
          <LinkSuspenso href="/financeiro/transferencias" icone="transferir">Transferir entre contas</LinkSuspenso>
          <LinkSuspenso href="/financeiro/conciliacao" icone="conciliacao">Conciliação bancária</LinkSuspenso>
          <LinkSuspenso href="/financeiro/dre" icone="dre">DRE gerencial</LinkSuspenso>
          <LinkSuspenso href="/financeiro/contas" icone="financeiro">Contas bancárias e saldos</LinkSuspenso>
          <LinkSuspenso href="/financeiro/plano-contas" icone="lista">Plano de contas</LinkSuspenso>
        </Suspenso>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SeletorPeriodo base={base} params={params} />
          <form action={base} className="flex">
            {Object.entries(params).filter(([k, x]) => x && !["q", "p"].includes(k)).map(([k, x]) => <input key={k} type="hidden" name={k} value={x} />)}
            <input name="q" defaultValue={sp.q} placeholder="Descrição, entidade ou valor" className="campo w-60 rounded-r-none" />
            <button className="btn rounded-l-none px-2.5" title="Buscar"><Icone nome="buscar" size={15} /></button>
          </form>
          <Link href={urlCom(base, params, { busca: sp.busca === "1" ? undefined : "1" })} className={sp.busca === "1" ? "btn-sec" : "btn"} title="Busca avançada"><Icone nome="filtro" size={15} /></Link>
        </div>
      </div>

      {avisos > 0 && (
        <Link href="/financeiro/avisos-boletos" className="no-print mb-3 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800 hover:bg-amber-100">
          <Icone nome="alerta" size={16} /><span><b>{avisos} boleto(s) pago(s) no Inter sem conta no sistema.</b> O dinheiro entrou, mas nenhuma conta foi baixada: clique para resolver.</span>
        </Link>
      )}

      {sp.busca === "1" && (
        <form action={base} className="cartao no-print mb-3 p-4">
          <input type="hidden" name="tipo" value={tipo} /><input type="hidden" name="busca" value="1" />
          {sp.periodo && <input type="hidden" name="periodo" value={sp.periodo} />}
          {sp.pde && <input type="hidden" name="pde" value={sp.pde} />}{sp.pate && <input type="hidden" name="pate" value={sp.pate} />}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div><span className="rotulo">{pagar ? "Fornecedor" : "Cliente"}</span><BuscaPessoa nome="cli" papel={pagar ? "fornecedor" : "cliente"} inicial={pessoa} /></div>
            <label><span className="rotulo">Situação</span>
              <select name="f" defaultValue={sp.f ?? ""} className="campo">
                <option value="">Todas</option><option value="abertos">Em aberto (todas)</option><option value="vencidos">Atrasadas</option>
                <option value="hoje">Vencem hoje</option><option value="avencer">A vencer</option><option value="pagos">{pagar ? "Pagas" : "Recebidas"}</option>
              </select>
            </label>
            <label><span className="rotulo">Plano de contas</span>
              <select name="cat" defaultValue={sp.cat ?? ""} className="campo"><option value="">Todos</option>{categorias.map((c) => <option key={c.id} value={c.id}>{"  ".repeat(c.nivel)}{rotuloCat(c)}</option>)}</select>
            </label>
            <label><span className="rotulo">Forma de pagamento</span>
              <select name="forma" defaultValue={sp.forma ?? ""} className="campo"><option value="">Todas</option>{formas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
            </label>
            <label><span className="rotulo">Conta bancária</span>
              <select name="conta" defaultValue={sp.conta ?? ""} className="campo"><option value="">Todas</option>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
            </label>
            {centros.length > 0 && (
              <label><span className="rotulo">Centro de custo</span>
                <select name="centro" defaultValue={sp.centro ?? ""} className="campo"><option value="">Todos</option>{centros.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
              </label>
            )}
            <label><span className="rotulo">Descrição, entidade ou valor</span><input name="q" defaultValue={sp.q} className="campo" /></label>
          </div>
          <div className="mt-3 flex gap-2"><button className="btn"><Icone nome="buscar" size={14} /> Buscar</button><Link href={`${base}?tipo=${tipo}&busca=1`} className="btn-sec"><Icone nome="fechar" size={14} /> Limpar</Link></div>
        </form>
      )}

      {sp.doc && (
        <div className="no-print mb-3 flex items-center gap-2 rounded-lg border border-[#dee2e6] bg-white px-4 py-2.5 text-[13px] text-[#495057]">
          <Icone nome="filtro" size={15} /> Mostrando só as contas do documento escolhido (venda, OS ou compra).
          <Link href={urlCom(base, params, { doc: undefined, p: undefined })} className="ml-auto font-semibold text-[#0c1b25] underline">Ver todas</Link>
        </div>
      )}

      <Resumo cartoes={[
        { rotulo: "Total do período", valor: brl(totalV), legenda: `${plural(totPeriodo._count)} ${periodo ? "no período" : "no total"}`, icone: "dinheiro", cor: "tinta", pct: totalV > 0 ? 100 : 0, href: urlCom(base, params, { f: undefined, p: undefined }), ativo: false },
        {
          rotulo: "Vencidos", valor: brl(v(totVenc)), icone: "atrasado", cor: "vermelho", pct: pct(v(totVenc)), ...cartao("vencidos"),
          legenda: "passaram do vencimento",
        },
        { rotulo: "Vencem hoje", valor: brl(v(totHoje)), legenda: "até o fim do dia", icone: "hoje", cor: "amarelo", pct: pct(v(totHoje)), ...cartao("hoje") },
        { rotulo: "A vencer", valor: brl(v(totAVencer)), legenda: "ainda no prazo", icone: "calendario", cor: "azul", pct: pct(v(totAVencer)), ...cartao("avencer") },
        { rotulo: pagar ? "Pagos" : "Recebidos", valor: brl(v(totPagos)), legenda: "confirmados no período", icone: "confirmado", cor: "verde", pct: pct(v(totPagos)), ...cartao("pagos") },
      ]} />

      {vencAntes && vencAntes._count > 0 && (
        <Link href={urlCom(base, params, { periodo: "todos", pde: undefined, pate: undefined, f: "vencidos", p: undefined })}
          className="no-print mb-3 flex items-center gap-2 rounded-lg border border-[#dee2e6] bg-white px-4 py-2.5 text-[13px] text-[#495057] hover:bg-slate-50">
          <Icone nome="atrasado" size={15} className="text-[#a8323e]" />
          Fora deste período ainda há <b className="text-[#a8323e]">{brl(vencAntes._sum.valor)}</b> vencidos em {vencAntes._count} conta(s) de antes.
          <span className="ml-auto font-semibold text-[#0c1b25] underline">Ver todos os vencidos</span>
        </Link>
      )}

      {modo === "baixar" ? (
        <FormSelecao acao={baixarVariasAcao} titulo={pagar ? "Pagar várias contas" : "Receber várias contas"} botao="Baixar marcadas" voltar={sem}
          confirmar="Baixar as contas marcadas pelo valor de cada uma, na data e conta escolhidas?"
          campos={<>
            <label className="text-[12px]">Data<input type="date" name="data" defaultValue={iso(hoje)} className="campo" required /></label>
            <label className="text-[12px]">Conta bancária<select name="contaBancariaId" className="campo" required><option value="">Escolha</option>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
          </>}>{tabela}</FormSelecao>
      ) : modo === "excluir" ? (
        <FormSelecao acao={excluirVariasAcao} perigo titulo="Excluir contas" botao="Excluir marcadas" voltar={sem} confirmar="Excluir as contas marcadas? Só saem as em aberto lançadas no financeiro.">{tabela}</FormSelecao>
      ) : tabela}
    </Pagina>
  );
}
