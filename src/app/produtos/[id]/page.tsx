import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ORIGENS } from "@/lib/itens/tipos";
import { documentoDe, documentosDosMovimentos } from "@/lib/estoque/origens";
import { clonarProdutoAcao, excluirProdutoAcao } from "@/lib/itens/acoes";
import { brl, data, dataSP, horaSP, num2, qtd } from "@/lib/ui/format";
import { Pagina, Pilula } from "@/components/ui/Pagina";
import Suspenso from "@/components/ui/Suspenso";
import { LinkSuspenso } from "@/components/ui/BarraLista";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import Icone from "@/components/Icone";
import AlterarConversao from "@/components/itens/AlterarConversao";
import TabelaReservas from "@/components/estoque/TabelaReservas";
import { reservasDoProduto } from "@/lib/estoque/reservas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visualizar produto" };

const ABAS = [
  { chave: "valores", rotulo: "Valores", icone: "valor" }, { chave: "estoque", rotulo: "Estoque", icone: "estoque" },
  { chave: "movimentacoes", rotulo: "Movimentações", icone: "atualizar" }, { chave: "fiscal", rotulo: "Fiscal", icone: "fiscal" },
  { chave: "detalhes", rotulo: "Detalhes", icone: "detalhes" }, { chave: "lojas", rotulo: "Lojas", icone: "lojas" },
  { chave: "historico", rotulo: "Histórico de valores", icone: "relogio" },
];
const TIPO_MOV: Record<string, string> = { ENTRADA: "Entrada", SAIDA: "Saída", TRANSFERENCIA_ENTRADA: "Transferência (entrada)", TRANSFERENCIA_SAIDA: "Transferência (saída)" };
const ORIGEM: Record<string, string> = { OS: "Ordem de serviço", VENDA: "Venda", COMPRA: "Compra", AJUSTE: "Ajuste", TRANSFERENCIA: "Transferência", DEVOLUCAO: "Devolução", IMPLANTACAO: "Implantação" };

function Selo({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <div className={`flex items-center gap-1.5 text-[12px] ${ok ? "text-emerald-700" : "text-slate-400 line-through"}`}><Icone nome={ok ? "ok" : "fechar"} size={13} /> {children}</div>;
}

export default async function VerProduto({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string; de?: string; ate?: string; acao?: string; ok?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const p = await prisma.produto.findUnique({
    where: { id },
    include: { grupo: { include: { pai: true } }, valores: { include: { tipoValor: true } }, fornecedores: { include: { fornecedor: { select: { id: true, nome: true } } } },
      variacoes: { orderBy: { ordem: "asc" } }, componentes: { include: { componente: { select: { id: true, nome: true, codigo: true } } } }, localPadrao: true },
  });
  if (!p) notFound();
  const aba = ABAS.some((a) => a.chave === sp.aba) ? sp.aba! : "valores";
  const [foto, criador, campos, saldos, reservado, empresas, depositos, reservadoCarros] = await Promise.all([
    prisma.anexo.findFirst({ where: { entidade: "FOTO_PRODUTO", entidadeId: id }, orderBy: [{ ordem: "asc" }, { createdAt: "asc" }], select: { id: true } }),
    p.criadoPorId ? prisma.usuario.findUnique({ where: { id: p.criadoPorId }, select: { nome: true } }) : null,
    prisma.campoExtra.findMany({ where: { entidade: "PRODUTO" }, orderBy: [{ ordem: "asc" }, { nome: "asc" }] }),
    prisma.saldo.findMany({ where: { produtoId: id }, include: { local: { include: { deposito: true } } } }),
    prisma.reserva.aggregate({ where: { produtoId: id, status: "ATIVA", localId: { not: null } }, _sum: { quantidade: true } }),
    prisma.empresa.findMany({ select: { id: true, nomeFantasia: true, razaoSocial: true } }),
    prisma.deposito.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.reserva.aggregate({ where: { produtoId: id, status: "ATIVA", local: { deposito: { equipeId: { not: null } } } }, _sum: { quantidade: true } }),
  ]);
  const reservasDocs = aba === "estoque" ? await reservasDoProduto(id) : [];
  const custoFinal = Number(p.custo) + Number(p.despesasAcessorias) + Number(p.outrasDespesas);
  const base = `/produtos/${id}`;
  const ce = (p.camposExtras ?? {}) as Record<string, string>;
  const fisico = saldos.reduce((s, x) => s + Number(x.quantidade), 0);
  // carros das equipes ficam à parte: o disponível é o da loja
  const fisicoCarros = saldos.filter((x) => x.local.deposito.equipeId).reduce((s, x) => s + Number(x.quantidade), 0);
  const resCarros = Number(reservadoCarros._sum.quantidade ?? 0);
  const resLoja = Number(reservado._sum.quantidade ?? 0) - resCarros;

  return (
    <Pagina voltar="/produtos" titulo="Visualizar produto" trilha={[{ rotulo: "Produtos", href: "/produtos" }, { rotulo: "Visualizar" }]}>
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[18px]"><Icone nome="produtos" size={18} /> Produto #{p.codigo}
            {p.ativo ? <Pilula rotulo="Ativo" cor="border-emerald-300 bg-emerald-50 text-emerald-700" /> : <Pilula rotulo="Inativo" cor="border-red-300 bg-red-50 text-red-700" />}</h2>
          <p className="text-[12px] text-slate-500">Criado em {p.createdAt.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" })}{criador ? ` por ${criador.nome.toUpperCase()}` : ""}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Link href={`${base}/editar`} className="btn-laranja"><Icone nome="editar" size={15} /> Editar produto</Link>
          <Suspenso direita classe="btn-sec px-2" botao={<Icone nome="opcoes" size={15} />}>
            <LinkSuspenso href={`/etiquetas/gerar?ids=${id}`} icone="etiqueta">Gerar etiqueta</LinkSuspenso>
            <form action={clonarProdutoAcao.bind(null, id)}><button className="flex w-full items-center gap-2 px-3 py-[7px] text-left hover:bg-slate-100"><Icone nome="copiar" size={15} /> Clonar produto</button></form>
            <BotaoExcluir acao={excluirProdutoAcao.bind(null, id)} pergunta={`Excluir ${p.nome}?`} depois="/produtos" rotulo="Excluir" />
          </Suspenso>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="cartao h-fit p-4 text-[13px]">
          <div className="mb-3 flex flex-col items-center text-center">
            {foto
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={`/api/cadastros/anexo/${foto.id}`} alt="" className="mb-2 h-40 w-40 rounded object-contain" />
              : <span className="mb-2 flex h-40 w-40 flex-col items-center justify-center rounded bg-slate-100 text-slate-400"><Icone nome="foto" size={40} /><span className="text-[12px]">Sem fotos</span></span>}
            <div className="font-semibold uppercase">{p.nome}</div>
            <div className="text-[12px] text-slate-500">{p.grupo ? (p.grupo.pai ? `${p.grupo.pai.nome} › ${p.grupo.nome}` : p.grupo.nome) : "Sem grupo"}</div>
          </div>
          <dl className="space-y-1 border-t pt-3">
            <div><b>Código:</b> {p.codigo}</div>
            <div><b>Código de barras:</b> {p.gtin ?? ""}</div>
            <div><b>Unidade:</b> {p.unidade}</div>
            <div><b>Tipo:</b> {p.possuiComposicao ? "Kit (composição)" : "Produto"}</div>
          </dl>
          <div className="mt-3 space-y-1 border-t pt-3">
            <Selo ok={p.controlaEstoque}>Movimenta estoque</Selo>
            <Selo ok={p.vendidoSeparadamente}>Vendido separadamente</Selo>
            <Selo ok={p.vendePdv}>Vende no PDV</Selo>
            <Selo ok={p.emiteNota}>Emite nota fiscal</Selo>
          </div>
          <div className="mt-3 border-t pt-2 text-[11px] text-slate-500">Atualizado em {dataSP(p.updatedAt)} {horaSP(p.updatedAt)}</div>
          <Link href={`${base}/editar`} className="btn mt-2 w-full">Editar produto</Link>
        </aside>

        <section>
          <nav className="mb-3 flex flex-wrap gap-1">
            {ABAS.map((a) => <Link key={a.chave} href={a.chave === "valores" ? base : `${base}?aba=${a.chave}`} className={`aba ${aba === a.chave ? "aba-ativa" : ""}`}><Icone nome={a.icone} size={14} /> {a.rotulo}</Link>)}
          </nav>

          {aba === "valores" && (
            <div className="space-y-3">
              <div className="cartao p-4">
                <h3 className="mb-3 font-semibold">Custo do produto</h3>
                <div className="grid gap-3 text-[13px] sm:grid-cols-4">
                  {[["Custo médio", p.custo], ["Despesas acessórias", p.despesasAcessorias], ["Outras despesas", p.outrasDespesas], ["Valor de custo", custoFinal]].map(([k, v]) => (
                    <div key={k as string}><div className="text-slate-500">{k as string}</div><div className="text-[16px] font-semibold">{brl(v as number)}</div></div>
                  ))}
                </div>
              </div>
              <div className="cartao p-4">
                <h3 className="mb-3 font-semibold">Valores de venda</h3>
                {p.valores.map((v) => (
                  <div key={v.id} className="mb-2 grid items-center gap-3 rounded border border-slate-200 p-3 text-[13px] sm:grid-cols-5">
                    <div><b>{v.tipoValor.nome}</b>{v.tipoValor.padrao && <span className="ml-1 rounded bg-slate-100 px-1 text-[10px]">Padrão</span>}{!v.ativo && <span className="ml-1 text-red-600">(inativo)</span>}</div>
                    <div><div className="text-slate-500">Lucro sugerido</div>{num2(v.tipoValor.lucro)}%</div>
                    <div><div className="text-slate-500">Lucro utilizado</div>{num2(v.lucroUtilizado)}%</div>
                    <div><div className="text-slate-500">Valor sugerido</div>{brl(custoFinal * (1 + Number(v.tipoValor.lucro) / 100))}</div>
                    <div><div className="text-slate-500">Valor de venda</div><span className="text-[18px] font-semibold text-marca">{brl(v.valor)}</span></div>
                  </div>
                ))}
                {!p.valores.length && <p className="text-[13px] text-slate-500">Valor de venda: {brl(p.precoVenda)}</p>}
              </div>
            </div>
          )}

          {aba === "estoque" && (
            <div className="space-y-3">
              <div className="cartao overflow-x-auto">
                <table className="tabela">
                  <thead><tr><th>Loja / depósito</th><th className="text-right">Estoque mínimo</th><th className="text-right">Estoque máximo</th><th className="text-right">Estoque atual</th></tr></thead>
                  <tbody>{depositos.map((dp) => {
                    const q = saldos.filter((s) => s.local.depositoId === dp.id).reduce((a, s) => a + Number(s.quantidade), 0);
                    return <tr key={dp.id}><td>{dp.nome}</td><td className="text-right">{qtd(p.estoqueMinimo)} {p.unidade}</td><td className="text-right">{p.estoqueMaximo != null ? `${qtd(p.estoqueMaximo)} ${p.unidade}` : "—"}</td><td className={`text-right font-semibold ${q <= Number(p.estoqueMinimo) ? "text-red-600" : ""}`}>{qtd(q)} {p.unidade}</td></tr>;
                  })}</tbody>
                </table>
              </div>
              <div className="cartao p-4 text-[13px]">
                <h3 className="mb-2 font-semibold">Onde está (prateleiras)</h3>
                {saldos.filter((s) => Number(s.quantidade) !== 0).map((s) => <div key={s.localId}>{s.local.deposito.nome} · {s.local.codigo}: <b>{qtd(s.quantidade)}</b></div>)}
                <div className="mt-2 text-slate-600">
                  {fisicoCarros !== 0 && <>Físico total {qtd(fisico)} · </>}Físico{fisicoCarros !== 0 ? " - Loja" : ""} {qtd(fisico - fisicoCarros)} · {resLoja ? <a href="#reservas" className="text-amber-700 hover:underline">Reservado {qtd(resLoja)}</a> : <>Reservado 0</>} · Disponível{fisicoCarros !== 0 ? " na loja" : ""} {qtd(fisico - fisicoCarros - resLoja)}
                  {fisicoCarros !== 0 && <> · Nos carros {qtd(fisicoCarros)} ({qtd(fisicoCarros - resCarros)} livre)</>}
                </div>
                <Link href={`/estoque/produto/${id}`} className="mt-2 inline-block text-marca hover:underline">Ajustar ou transferir estoque</Link>
              </div>
              <div id="reservas" className="cartao overflow-x-auto">
                <h3 className="px-4 pb-1 pt-3 text-[13px] font-semibold">Reservado para ({reservasDocs.length} {reservasDocs.length === 1 ? "documento" : "documentos"})</h3>
                <TabelaReservas docs={reservasDocs} unidade={p.unidade} />
              </div>
              {sp.ok && <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">Conversão gravada. {sp.ok}</div>}
              {sp.acao === "conversao" ? (
                <AlterarConversao produto={{ id, nome: p.nome, unidade: p.unidade, unidadeCompra: p.unidadeCompra, fator: Number(p.fatorConversao) }} />
              ) : (
                <div className="cartao p-4 text-[13px]">
                  <h3 className="mb-2 font-semibold">Conversão de unidade</h3>
                  <div>Unidade de compra: <b>1 {p.unidadeCompra ?? p.unidade}</b></div>
                  <div>Unidade de venda: <b>{qtd(p.unidadeCompra ? p.fatorConversao : 1)} {p.unidade}</b></div>
                  <div className="mt-1 text-slate-600">Custo: <b>{brl(p.custo)}</b> por {p.unidade}{p.unidadeCompra && <> · {brl(Number(p.custo) * Number(p.fatorConversao))} por {p.unidadeCompra}</>}</div>
                  <div className="mt-2 flex gap-3"><Link href={`${base}?aba=estoque&acao=conversao`} className="text-marca hover:underline">Alterar conversão e recalcular custos</Link>
                    <Link href={`/estoque/custos?q=${encodeURIComponent(p.codigo)}&visao=compras`} className="text-marca hover:underline">Ver custos das compras</Link></div>
                </div>
              )}
            </div>
          )}

          {aba === "movimentacoes" && <Movimentacoes id={id} sp={sp} base={base} unidade={p.unidade} />}

          {aba === "fiscal" && (
            <div className="cartao p-4 text-[13px]">
              <dl className="grid gap-2 sm:grid-cols-2">
                {[["NCM", p.ncm], ["CEST", p.cest], ["Origem", ORIGENS[p.origem]], ["Cód. benefício", p.codigoBeneficio], ["Peso líquido", p.pesoLiquido && `${qtd(p.pesoLiquido)} kg`], ["Peso bruto", p.pesoBruto && `${qtd(p.pesoBruto)} kg`],
                  ["Número FCI", p.numeroFci], ["Produto específico", p.produtoEspecifico ?? "Não usar"], ["CFOP dentro do estado", p.cfopInterno], ["CFOP fora do estado", p.cfopExterno], ["CSOSN", p.csosn], ["CST ICMS", p.cstIcms],
                  ["CST PIS", p.cstPis], ["CST COFINS", p.cstCofins], ["cClassTrib", p.cClassTrib]].map(([k, v]) => <div key={k as string}><b>{k as string}:</b> {(v as string) || "—"}</div>)}
              </dl>
            </div>
          )}

          {aba === "detalhes" && (
            <div className="space-y-3 text-[13px]">
              <div className="cartao p-4"><h3 className="mb-2 font-semibold">Regras de venda</h3>Comissão do vendedor: {p.comissao != null ? `${num2(p.comissao)}%` : "—"}</div>
              <div className="cartao p-4"><h3 className="mb-2 font-semibold">Campos extras</h3>{campos.map((c) => <div key={c.id}><b>{c.nome}:</b> {ce[c.id] || "—"}</div>)}</div>
              <div className="cartao p-4"><h3 className="mb-2 font-semibold">Pesos e dimensões</h3>Peso {qtd(p.peso ?? 0)} kg · Largura {qtd(p.largura ?? 0)} m · Altura {qtd(p.altura ?? 0)} m · Comprimento {qtd(p.comprimento ?? 0)} m</div>
              {p.possuiComposicao && <div className="cartao p-4"><h3 className="mb-2 font-semibold">Composição</h3>{p.componentes.map((c) => <div key={c.id}><Link href={`/produtos/${c.componente.id}`} className="text-marca hover:underline">{c.componente.codigo} {c.componente.nome}</Link> × {qtd(c.quantidade)}</div>)}</div>}
              {p.possuiVariacoes && <div className="cartao p-4"><h3 className="mb-2 font-semibold">Variações</h3>{p.variacoes.map((v) => <div key={v.id}>{v.nome} {v.codigo && `· ${v.codigo}`} {v.gtin && `· ${v.gtin}`}</div>)}</div>}
              <div className="cartao p-4"><h3 className="mb-2 font-semibold">Fornecedores</h3>{p.fornecedores.length ? p.fornecedores.map((f) => <div key={f.id}><Link href={`/fornecedores/${f.fornecedor.id}`} className="text-marca hover:underline">{f.fornecedor.nome}</Link>{f.codigo && ` · código ${f.codigo}`}</div>) : "Nenhum fornecedor vinculado."}</div>
              <div className="cartao p-4"><h3 className="mb-2 font-semibold">Descrição</h3><p className="whitespace-pre-wrap">{p.descricao || "—"}</p></div>
            </div>
          )}

          {aba === "lojas" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {/* sem loja marcada = o produto vale para todas as lojas */}
              {empresas.map((e) => {
                const ativa = !p.lojas.length || p.lojas.includes(e.id);
                const est = saldos.filter((s) => s.local.deposito.empresaId === e.id || (!s.local.deposito.empresaId && empresas.length === 1)).reduce((a, s) => a + Number(s.quantidade), 0);
                return (
                  <div key={e.id} className={`cartao p-3 text-[13px] ${ativa ? "" : "opacity-50"}`}>
                    <b className="uppercase">{e.nomeFantasia || e.razaoSocial}</b>
                    <div className="text-[11px]">{ativa ? <>Disponível nesta loja{p.controlaEstoque ? <> · estoque {qtd(est)} {p.unidade}</> : null}</> : "Indisponível nesta loja"}</div>
                  </div>
                );
              })}
            </div>
          )}

          {aba === "historico" && <Historico id={id} />}
        </section>
      </div>
    </Pagina>
  );
}

async function Movimentacoes({ id, sp, base, unidade }: { id: string; sp: { de?: string; ate?: string }; base: string; unidade: string }) {
  const hoje = new Date();
  const de = sp.de ?? new Date(hoje.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const ate = sp.ate ?? hoje.toISOString().slice(0, 10);
  const lista = await prisma.movimentoEstoque.findMany({
    where: { produtoId: id, createdAt: { gte: new Date(de + "T00:00:00-03:00"), lte: new Date(ate + "T23:59:59-03:00") } },
    include: { local: { select: { codigo: true } }, usuario: { select: { nome: true } } }, orderBy: { createdAt: "desc" }, take: 500,
  });
  const docs = await documentosDosMovimentos(lista);
  return (
    <div>
      <form action={base} className="mb-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="aba" value="movimentacoes" />
        <label><span className="rotulo">De</span><input type="date" name="de" defaultValue={de} className="campo" /></label>
        <label><span className="rotulo">Até</span><input type="date" name="ate" defaultValue={ate} className="campo" /></label>
        <button className="btn"><Icone nome="buscar" size={14} /> Buscar</button>
      </form>
      {lista.length ? (
        <div className="cartao overflow-x-auto">
          <table className="tabela">
            <thead><tr><th>Data</th><th>Tipo</th><th>Origem / destino</th><th>Local</th><th className="text-right">Quantidade</th><th>Usuário</th><th>Observação</th></tr></thead>
            <tbody>{lista.map((m) => (
              <tr key={m.id}>
                <td>{dataSP(m.createdAt)} {horaSP(m.createdAt)}</td><td>{TIPO_MOV[m.tipo] ?? m.tipo}</td><td><OrigemMov mov={m} doc={documentoDe(docs, m)} /></td>
                <td>{m.local.codigo}</td><td className={`text-right ${m.tipo.includes("SAIDA") ? "text-red-600" : "text-emerald-700"}`}>{m.tipo.includes("SAIDA") ? "−" : "+"}{qtd(m.quantidade)} {unidade}</td>
                <td>{m.usuario?.nome ?? ""}</td><td className="text-[12px] text-slate-500">{m.observacao}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div className="cartao flex flex-col items-center py-12 text-slate-500"><Icone nome="atualizar" size={28} /><b className="mt-2 text-slate-700">Nenhuma movimentação no período</b><span className="text-[13px]">Troque as datas para ver outras movimentações.</span></div>
      )}
    </div>
  );
}

/** "Venda #8698" com link e o cliente embaixo; sem documento, só o tipo (Implantação, Transferência). */
function OrigemMov({ mov, doc }: { mov: { origemTipo: string }; doc?: { rotulo: string; href: string; pessoa?: string } }) {
  if (!doc) return <>{ORIGEM[mov.origemTipo] ?? mov.origemTipo}</>;
  return (
    <div>
      <Link href={doc.href} className="font-medium text-marca hover:underline">{doc.rotulo}</Link>
      {mov.origemTipo === "IMPLANTACAO" && <span className="ml-1 text-[11px] text-slate-500">(implantação)</span>}
      {doc.pessoa && <div className="max-w-[16rem] truncate text-[12px] text-slate-500" title={doc.pessoa}>{doc.pessoa}</div>}
    </div>
  );
}

async function Historico({ id }: { id: string }) {
  const lista = await prisma.historicoValor.findMany({ where: { produtoId: id }, orderBy: { createdAt: "desc" }, take: 200 });
  const usuarios = await prisma.usuario.findMany({ where: { id: { in: lista.map((h) => h.usuarioId).filter((x): x is string => !!x) } }, select: { id: true, nome: true } });
  return (
    <div className="cartao overflow-x-auto">
      <table className="tabela">
        <thead><tr><th>Data</th><th>Valor</th><th className="text-right">Anterior</th><th className="text-right">Novo</th><th>Usuário</th></tr></thead>
        <tbody>
          {lista.map((h) => <tr key={h.id}><td>{data(h.createdAt)} {horaSP(h.createdAt)}</td><td>{h.campo}</td><td className="text-right">{brl(h.anterior)}</td><td className="text-right font-semibold">{brl(h.novo)}</td><td>{usuarios.find((u) => u.id === h.usuarioId)?.nome ?? ""}</td></tr>)}
          {!lista.length && <tr><td colSpan={5} className="py-8 text-center text-slate-500">Nenhuma alteração de valor registrada.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
