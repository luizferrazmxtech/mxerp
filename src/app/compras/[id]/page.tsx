import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { empresaDoDocumento } from "@/lib/empresa/atual";
import { cor, aplicarTags } from "@/lib/orcamentos/tipos";
import { excluirAnotacaoAcao } from "@/lib/orcamentos/acoes";
import { alterarSituacaoCompraAcao, anotarCompraAcao, clonarCompraAcao, excluirCompraEVoltarAcao } from "@/lib/compras/acoes";
import { rotuloLancamento } from "@/lib/compras/tipos";
import { excluirAnexoAcao } from "@/lib/cadastros/acoes";
import { brl, dataSP, horaSP, num2, qtd } from "@/lib/ui/format";
import { Pagina } from "@/components/ui/Pagina";
import Suspenso from "@/components/ui/Suspenso";
import { LinkSuspenso } from "@/components/ui/BarraLista";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import BotaoAcao from "@/components/ui/BotaoAcao";
import Icone from "@/components/Icone";
import VoltarConta from "@/components/financeiro/VoltarConta";
import { FormAnexo } from "@/components/cadastros/FormsVer";
import FormSituacao from "@/components/orcamentos/FormSituacao";
import CopiarLink from "@/components/orcamentos/CopiarLink";
import FormAnotacaoOrc from "@/components/orcamentos/FormAnotacaoOrc";
import { baseCompras, tituloCompras } from "@/components/compras/PaginaFormCompra";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visualizar compra" };

const dia = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

function Vazio({ icone, titulo, texto }: { icone: string; titulo: string; texto?: string }) {
  return <div className="cartao flex flex-col items-center px-4 py-10 text-center text-slate-500"><Icone nome={icone} size={28} /><b className="mt-2 text-slate-700">{titulo}</b>{texto && <span className="text-[13px]">{texto}</span>}</div>;
}

export default async function VerCompra({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string; situacao?: string; conta?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const c = await prisma.compra.findUnique({
    where: { id },
    include: {
      fornecedor: true, situacaoCfg: true, transportadora: { select: { nome: true } }, formaPagamento: true,
      parcelas: { orderBy: { numero: "asc" }, include: { formaPagamento: { select: { nome: true } } } },
      itens: { orderBy: { ordem: "asc" }, include: { produto: { select: { id: true, codigo: true, nome: true, unidade: true } } } },
      servicos: { orderBy: { ordem: "asc" }, include: { servico: { select: { id: true, codigo: true, nome: true } } } },
      historico: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!c) notFound();
  const [situacoes, criador, empresa, anexos, anotacoes, campos, modelo, lancamentos, cotacao, locais] = await Promise.all([
    prisma.situacaoCompraConfig.findMany({ orderBy: { ordem: "asc" } }),
    c.criadoPorId ? prisma.usuario.findUnique({ where: { id: c.criadoPorId }, select: { nome: true } }) : null,
    empresaDoDocumento(c.empresaId),
    prisma.anexo.findMany({ where: { entidade: "COMPRA", entidadeId: id }, select: { id: true, nome: true, tamanho: true, createdAt: true } }),
    prisma.anotacao.findMany({ where: { entidade: "COMPRA", entidadeId: id }, orderBy: { createdAt: "desc" } }),
    prisma.campoExtra.findMany({ where: { entidade: "COMPRA" }, orderBy: [{ ordem: "asc" }, { nome: "asc" }] }),
    prisma.modeloMensagem.findFirst({ where: { tipo: "COMPRA" }, orderBy: { padrao: "desc" } }),
    prisma.lancamento.findMany({ where: { origemTipo: "COMPRA", origemId: id }, include: { formaPagamento: true, categoria: true }, orderBy: [{ vencimento: "asc" }, { parcela: "asc" }] }),
    c.cotacaoId ? prisma.cotacao.findUnique({ where: { id: c.cotacaoId }, select: { id: true, numero: true } }) : null,
    prisma.local.findMany({ where: { id: { in: c.itens.map((i) => i.localId).filter((x): x is string => !!x) } }, select: { id: true, codigo: true } }),
  ]);
  const h = await headers();
  const link = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}/compra/${c.token}`;
  const nomeEmpresa = empresa?.nomeFantasia || empresa?.razaoSocial || "MXTECH";
  const tags = { nome_fornecedor: c.fornecedor.nome, nome_cliente: c.fornecedor.nome, numero: String(c.numero), valor_total: brl(c.total), data: dia(c.data), link, nome_empresa: nomeEmpresa };
  const assunto = aplicarTags(modelo?.assunto ?? "Pedido de compra [numero]", tags);
  const corpo = aplicarTags(modelo?.email ?? "Segue o pedido de compra: [link]", tags);
  const fone = (c.fornecedor.celular ?? c.fornecedor.telefone ?? "").replace(/\D/g, "");
  const usuarios = new Map((await prisma.usuario.findMany({ where: { id: { in: anotacoes.map((a) => a.usuarioId).filter((x): x is string => !!x) } }, select: { id: true, nome: true } })).map((u) => [u.id, u.nome]));
  const ce = (c.camposExtras ?? {}) as Record<string, string>;
  const k = cor(c.situacaoCfg?.cor ?? "cinza");
  const base = `/compras/${id}`;
  const localDe = new Map(locais.map((l) => [l.id, l.codigo]));
  const ABAS = [
    { chave: "produtos", rotulo: "Produtos", icone: "produtos", tem: c.itens.length > 0 }, { chave: "servicos", rotulo: "Serviços", icone: "servicos", tem: c.servicos.length > 0 },
    { chave: "pagamento", rotulo: "Pagamento", icone: "dinheiro", tem: true }, { chave: "detalhes", rotulo: "Detalhes", icone: "detalhes", tem: true },
    { chave: "historico", rotulo: "Histórico", icone: "relogio", tem: true }, { chave: "campos", rotulo: "Campos extras", icone: "ajustes", tem: campos.length > 0 },
    { chave: "anexos", rotulo: "Anexos", icone: "anexos", tem: true }, { chave: "envios", rotulo: "Envios", icone: "envios", tem: true },
    { chave: "anotacoes", rotulo: "Interações", icone: "anotacoes", tem: true },
  ].filter((a) => a.tem);
  const aba = ABAS.some((a) => a.chave === sp.aba) ? sp.aba! : ABAS[0].chave;
  const podeEditar = c.situacaoCfg?.permiteEdicao ?? true;

  return (
    <Pagina titulo="Visualizar compra" trilha={[{ rotulo: tituloCompras(c.tipo), href: baseCompras(c.tipo) }, { rotulo: "Visualizar" }]}>
      <VoltarConta contaId={sp.conta} />
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[18px]"><Icone nome="carrinho" size={18} /> Compra #{c.numero}
            <span className={`pilula ${k.pilula}`}>{c.situacaoCfg?.nome ?? "—"}</span></h2>
          <p className="text-[12px] text-slate-500">Criado em {c.createdAt.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" })}{criador ? ` por ${criador.nome.toUpperCase()}` : ""}</p>
        </div>
        <div className="no-print ml-auto flex gap-2">
          <Suspenso direita classe="btn-laranja" botao={<><Icone nome="editar" size={15} /> Editar <Icone nome="abaixo" size={13} /></>}>
            {podeEditar && <LinkSuspenso href={`${base}/editar`} icone="editar">Editar compra</LinkSuspenso>}
            <LinkSuspenso href={`${base}?situacao=1`} icone="atualizar">Alterar situação</LinkSuspenso>
            <LinkSuspenso href={`/financeiro?tipo=PAGAR&periodo=todos&q=${encodeURIComponent(`Compra de nº ${c.numero}`)}`} icone="financeiro">Ver no financeiro</LinkSuspenso>
            <LinkSuspenso href={`${base}?aba=anexos`} icone="anexos">Documentos</LinkSuspenso>
            <BotaoAcao acao={clonarCompraAcao.bind(null, id)} icone="copiar">Cópia</BotaoAcao>
            <BotaoExcluir acao={excluirCompraEVoltarAcao.bind(null, id, baseCompras(c.tipo))} pergunta={`Excluir a compra nº ${c.numero}? O estoque lançado sai e as contas a pagar em aberto são apagadas.`} rotulo="Excluir compra" />
          </Suspenso>
          <Suspenso direita classe="btn bg-emerald-600 hover:bg-emerald-700" botao={<><Icone nome="compartilhar" size={15} /> Compartilhar <Icone nome="abaixo" size={13} /></>}>
            <a href={`mailto:${c.fornecedor.email ?? ""}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`} className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="email" size={15} /> Por e-mail</a>
            <a href={`https://wa.me/${fone.length >= 10 ? "55" + fone.replace(/^55/, "") : ""}?text=${encodeURIComponent(corpo)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="whatsapp" size={15} /> Por WhatsApp</a>
            <CopiarLink url={link} menu />
            <a href={`${base}/imprimir`} target="_blank" className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="imprimir" size={15} /> Imprimir</a>
          </Suspenso>
        </div>
      </div>

      {sp.situacao && <FormSituacao id={id} numero={c.numero} atual={c.situacaoId ?? ""} situacoes={situacoes.map((s) => ({ id: s.id, nome: s.nome, aviso: rotuloLancamento(s.lancamento).toLowerCase() }))} voltar={base} acao={alterarSituacaoCompraAcao} rotulo="da compra" />}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-3">
          <div className="cartao p-4 text-[13px]">
            <div className="flex justify-between text-slate-500"><span>Compra<br /><b className="text-slate-700">Nº {c.numero}</b></span><span className="text-right">Emissão<br /><b className="text-slate-700">{dia(c.data)}</b></span></div>
            <div className="my-2 text-right text-[26px] font-semibold text-marca">{brl(c.total)}</div>
            <dl className="space-y-1.5 border-t pt-2">
              <div className="flex"><span className="text-slate-500">Situação</span><span className={`pilula ml-auto ${k.pilula}`}>{c.situacaoCfg?.nome ?? "—"}</span></div>
              <div className="flex gap-2"><span className="text-slate-500">Fornecedor</span><Link href={`/fornecedores/${c.fornecedorId}`} className="ml-auto text-right font-semibold uppercase hover:underline">{c.fornecedor.nome}</Link></div>
              <div className="flex"><span className="text-slate-500">Pagamento</span><b className="ml-auto">{c.condicao === "PARCELADO" ? `Parcelado em ${c.parcelas.length}x` : "À vista"}</b></div>
              <div className="flex"><span className="text-slate-500">Loja</span><b className="ml-auto uppercase">{nomeEmpresa}</b></div>
              {cotacao && <div className="flex"><span className="text-slate-500">Cotação</span><Link href={`/compras/cotacoes/${cotacao.id}`} className="ml-auto text-marca hover:underline">nº {cotacao.numero}</Link></div>}
            </dl>
            <div className="mt-2 border-t pt-2 text-[11px] text-slate-500">Atualizado em {dataSP(c.updatedAt)} {horaSP(c.updatedAt)}</div>
          </div>
          <div className="cartao p-4 text-[13px]">
            <div className="mb-2 font-semibold">Link da compra</div>
            <CopiarLink url={link} />
          </div>
        </aside>

        <section>
          <nav className="mb-3 flex flex-wrap gap-1">
            {ABAS.map((a) => <Link key={a.chave} href={a.chave === ABAS[0].chave ? (sp.conta ? `${base}?conta=${sp.conta}` : base) : `${base}?aba=${a.chave}${sp.conta ? `&conta=${sp.conta}` : ""}`} className={`aba ${aba === a.chave ? "aba-ativa" : ""}`}><Icone nome={a.icone} size={14} /> {a.rotulo}</Link>)}
          </nav>

          {aba === "produtos" && (
            <div className="cartao overflow-x-auto">
              <div className="px-4 pt-3"><b>Produtos</b><p className="text-[12px] text-slate-500">{c.itens.length} produto(s) nesta compra{c.recebida ? ", com entrada no estoque" : ", ainda sem entrada no estoque"}.</p></div>
              <table className="tabela">
                <thead><tr><th>Produto</th><th>Local</th><th className="text-right">Quantidade</th><th className="text-right">Custo unit.</th><th className="text-right">Desconto</th><th className="text-right">Total</th></tr></thead>
                <tbody>{c.itens.map((l) => <tr key={l.id}><td><Link href={`/produtos/${l.produto.id}`} className="font-semibold uppercase sublinhado">{l.produto.nome}</Link><div className="font-mono text-[11px] text-slate-500">{l.produto.codigo}</div>{l.detalhes && <div className="text-[11px] text-slate-500">{l.detalhes}</div>}</td>
                  <td className="text-[12px] text-slate-600">{l.localId ? localDe.get(l.localId) : "—"}</td>
                  <td className="text-right">{qtd(l.quantidade)} {l.unidadeCompra ?? l.produto.unidade}{l.unidadeCompra && <div className="text-[11px] text-slate-500">= {qtd(Number(l.quantidade) * Number(l.fator))} {l.produto.unidade} (1 {l.unidadeCompra} = {qtd(l.fator)} {l.produto.unidade})</div>}</td>
                  <td className="text-right">{num2(l.custoUnit)}{l.unidadeCompra && Number(l.fator) > 0 && <div className="text-[11px] text-slate-500">{num2(Number(l.subtotal) / (Number(l.quantidade) * Number(l.fator)))}/{l.produto.unidade}</div>}</td><td className="text-right">{Number(l.desconto) ? num2(l.desconto) : ""}</td><td className="text-right font-semibold">{num2(l.subtotal)}</td></tr>)}</tbody>
              </table>
            </div>
          )}

          {aba === "servicos" && (
            <div className="cartao overflow-x-auto">
              <table className="tabela">
                <thead><tr><th>Serviço</th><th className="text-right">Quantidade</th><th className="text-right">Valor</th><th className="text-right">Desconto</th><th className="text-right">Total</th></tr></thead>
                <tbody>{c.servicos.map((l) => <tr key={l.id}><td><span className="font-mono text-[11px] text-slate-500">{l.servico.codigo}</span> {l.servico.nome}{l.detalhes && <div className="text-[11px] text-slate-500">{l.detalhes}</div>}</td>
                  <td className="text-right">{qtd(l.quantidade)}</td><td className="text-right">{num2(l.valorUnit)}</td><td className="text-right">{Number(l.desconto) ? num2(l.desconto) : ""}</td><td className="text-right font-semibold">{num2(l.subtotal)}</td></tr>)}</tbody>
              </table>
            </div>
          )}

          {aba === "pagamento" && (
            <div className="space-y-3">
              <div className="cartao grid gap-3 p-4 text-[13px] sm:grid-cols-6">
                {([["Produtos", c.totalProdutos], ["Serviços", c.totalServicos], ["Frete", c.frete], ["Impostos", c.impostos], ["Desconto", c.desconto], ["Total", c.total]] as [string, unknown][]).map(([r, x]) => <div key={r}><div className="text-slate-500">{r}</div><div className={`font-semibold ${r === "Total" ? "text-[18px] text-marca" : "text-[15px]"}`}>{brl(Number(x))}</div></div>)}
              </div>
              {(!c.freteNoTotal && Number(c.frete) > 0) || (!c.impostosNoTotal && Number(c.impostos) > 0) ? <p className="px-1 text-[12px] text-slate-500">{!c.freteNoTotal && Number(c.frete) > 0 ? "O frete não soma ao total. " : ""}{!c.impostosNoTotal && Number(c.impostos) > 0 ? "Os impostos não somam ao total." : ""}</p> : null}
              {lancamentos.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {lancamentos.map((l) => {
                    const paga = !!l.pagoEm;
                    const atrasada = !paga && l.vencimento < new Date(new Date().toISOString().slice(0, 10));
                    return (
                      <div key={l.id} className="cartao p-3 text-[13px]">
                        <div className="flex items-center gap-2"><b>{l.formaPagamento?.nome ?? "A combinar"}</b>
                          <span className={`pilula ml-auto ${paga ? "border-emerald-300 bg-emerald-50 text-emerald-700" : atrasada ? "border-red-300 bg-red-50 text-red-700" : "border-orange-300 bg-orange-50 text-orange-700"}`}>{paga ? "Paga" : atrasada ? "Atrasada" : "A pagar"}</span></div>
                        <div className="mt-1 flex text-slate-600"><span>Vencimento {dia(l.vencimento)} · {l.categoria.nome}</span><b className="ml-auto text-slate-800">{brl(l.valor)}</b></div>
                        <div className="text-[11px] text-slate-500">Parcela {l.parcela}/{l.totalParcelas}</div>
                      </div>
                    );
                  })}
                </div>
              ) : c.parcelas.length ? (
                <div className="cartao overflow-x-auto">
                  <p className="px-4 pt-3 text-[12px] text-slate-500">{c.financeiroNoLegado ? "Compra migrada do Gestão Click: as contas a pagar em aberto vieram do backup." : "Esta situação não lança o financeiro: as parcelas viram contas a pagar quando a compra for para uma situação que lança."}</p>
                  <table className="tabela"><thead><tr><th>Parcela</th><th>Vencimento</th><th className="text-right">Valor</th><th>Forma</th><th>Observação</th></tr></thead>
                    <tbody>{c.parcelas.map((p) => <tr key={p.id}><td>{p.numero}</td><td>{dia(p.vencimento)}</td><td className="text-right">{num2(p.valor)}</td><td>{p.formaPagamento?.nome ?? c.formaPagamento?.nome ?? ""}</td><td>{p.observacao}</td></tr>)}</tbody></table>
                </div>
              ) : <Vazio icone="dinheiro" titulo="Nenhuma forma de pagamento foi definida" />}
            </div>
          )}

          {aba === "detalhes" && (
            <div className="cartao space-y-1 p-4 text-[13px]">
              <div><b>Número da NF-e:</b> {c.numeroNfe ?? "—"}</div>
              <div><b>Chave da NF-e:</b> <span className="font-mono text-[12px]">{c.chaveNfe ?? "—"}</span></div>
              <div><b>Centro de custo:</b> {c.centroCusto ?? "—"}</div>
              <div><b>Transportadora:</b> {c.transportadora?.nome ?? "—"} · <b>Frete:</b> {brl(c.frete)}</div>
              {c.observacoes && <div className="border-t pt-2"><b>Observações:</b> <span className="whitespace-pre-wrap">{c.observacoes}</span></div>}
              {c.observacaoInterna && <div className="border-t pt-2"><b>Observações internas:</b> <span className="whitespace-pre-wrap">{c.observacaoInterna}</span></div>}
            </div>
          )}

          {aba === "campos" && <div className="cartao p-4 text-[13px]">{campos.map((x) => <div key={x.id}><b>{x.nome}:</b> {ce[x.id] || "—"}</div>)}</div>}

          {aba === "envios" && <Vazio icone="envios" titulo="Nenhum envio registrado" texto="Use Compartilhar › Por e-mail ou WhatsApp para mandar o pedido de compra ao fornecedor." />}

          {aba === "historico" && (
            <div className="cartao p-4">
              <ol className="relative ml-2 border-l border-slate-200">
                {c.historico.map((x) => (
                  <li key={x.id} className="mb-4 ml-4 text-[13px]">
                    <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-marca" />
                    <div>{x.descricao}{x.situacao && <span className="ml-1 text-slate-500">· {x.situacao}</span>}</div>
                    <div className="text-[11px] text-slate-500">{x.usuarioNome ? `Por ${x.usuarioNome} · ` : ""}{dataSP(x.createdAt)} • {horaSP(x.createdAt)}</div>
                  </li>
                ))}
                {!c.historico.length && <li className="ml-4 text-[13px] text-slate-500">Sem histórico registrado.</li>}
              </ol>
            </div>
          )}

          {aba === "anexos" && (
            <div className="cartao p-4">
              <FormAnexo entidade="COMPRA" entidadeId={id} caminho={`${base}?aba=anexos`} />
              {anexos.length ? (
                <table className="tabela"><tbody>{anexos.map((a) => <tr key={a.id}><td><a href={`/api/cadastros/anexo/${a.id}`} className="text-marca hover:underline">{a.nome}</a></td><td className="w-36">{dataSP(a.createdAt)}</td>
                  <td className="w-12 text-right"><BotaoExcluir acao={excluirAnexoAcao.bind(null, a.id)} pergunta={`Excluir o anexo ${a.nome}?`} /></td></tr>)}</tbody></table>
              ) : <p className="text-[13px] text-slate-500">Nenhum anexo.</p>}
            </div>
          )}

          {aba === "anotacoes" && (
            <div className="cartao p-4">
              <FormAnotacaoOrc id={id} caminho={`${base}?aba=anotacoes`} acao={anotarCompraAcao} sobre="a compra" />
              <div className="space-y-2">
                {anotacoes.map((a) => (
                  <div key={a.id} className="rounded border border-slate-200 bg-[#fffdf3] p-3">
                    <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-500"><b>{usuarios.get(a.usuarioId ?? "") ?? "—"}</b> · {dataSP(a.createdAt)} {horaSP(a.createdAt)}
                      <span className="ml-auto"><BotaoExcluir acao={excluirAnotacaoAcao.bind(null, a.id)} pergunta="Excluir esta anotação?" /></span></div>
                    <p className="whitespace-pre-wrap text-[13px]">{a.texto}</p>
                  </div>
                ))}
                {!anotacoes.length && <p className="text-[13px] text-slate-500">Nenhuma interação.</p>}
              </div>
            </div>
          )}
        </section>
      </div>
    </Pagina>
  );
}
