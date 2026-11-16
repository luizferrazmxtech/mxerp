import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { cor, aplicarTags } from "@/lib/orcamentos/orcamentos";
import { clonarOrcamentoAcao, excluirAnotacaoAcao, excluirOrcamentoAcao, gerarOsAcao, gerarVendaAcao } from "@/lib/orcamentos/acoes";
import { excluirAnexoAcao } from "@/lib/cadastros/acoes";
import { brl, dataSP, horaSP, num2, qtd } from "@/lib/ui/format";
import { Pagina } from "@/components/ui/Pagina";
import Suspenso from "@/components/ui/Suspenso";
import { LinkSuspenso } from "@/components/ui/BarraLista";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import BotaoAcao from "@/components/ui/BotaoAcao";
import Icone from "@/components/Icone";
import { FormAnexo } from "@/components/cadastros/FormsVer";
import FormSituacao from "@/components/orcamentos/FormSituacao";
import CopiarLink from "@/components/orcamentos/CopiarLink";
import FormAnotacaoOrc from "@/components/orcamentos/FormAnotacaoOrc";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visualizar orçamento" };

const dia = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const cnpjFmt = (c: string) => (c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4"));

function Vazio({ icone, titulo, texto }: { icone: string; titulo: string; texto?: string }) {
  return <div className="cartao flex flex-col items-center px-4 py-10 text-center text-slate-500"><Icone nome={icone} size={28} /><b className="mt-2 text-slate-700">{titulo}</b>{texto && <span className="text-[13px]">{texto}</span>}</div>;
}

export default async function VerOrcamento({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string; situacao?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const o = await prisma.orcamento.findUnique({
    where: { id },
    include: {
      cliente: { include: { enderecos: { orderBy: { ordem: "asc" } } } }, vendedor: { select: { nome: true, comissao: true } }, situacao: true, transportadora: { select: { nome: true } },
      formaPagamento: true, parcelas: { orderBy: { numero: "asc" }, include: { formaPagamento: { select: { nome: true } } } },
      produtos: { orderBy: { ordem: "asc" }, include: { produto: { select: { id: true, codigo: true, nome: true, unidade: true } } } },
      servicos: { orderBy: { ordem: "asc" }, include: { servico: { select: { id: true, codigo: true, nome: true } } } },
      historico: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!o) notFound();
  const [situacoes, criador, empresa, anexos, anotacoes, campos, venda, os, modelo] = await Promise.all([
    prisma.situacaoOrcamento.findMany({ orderBy: { ordem: "asc" } }),
    o.criadoPorId ? prisma.usuario.findUnique({ where: { id: o.criadoPorId }, select: { nome: true } }) : null,
    o.empresaId ? prisma.empresa.findUnique({ where: { id: o.empresaId } }) : prisma.empresa.findFirst(),
    prisma.anexo.findMany({ where: { entidade: "ORCAMENTO", entidadeId: id }, select: { id: true, nome: true, tamanho: true, createdAt: true } }),
    prisma.anotacao.findMany({ where: { entidade: "ORCAMENTO", entidadeId: id }, orderBy: { createdAt: "desc" } }),
    prisma.campoExtra.findMany({ where: { entidade: "ORCAMENTO" }, orderBy: [{ ordem: "asc" }, { nome: "asc" }] }),
    o.vendaId ? prisma.venda.findUnique({ where: { id: o.vendaId }, select: { id: true, numero: true } }) : null,
    o.osId ? prisma.ordemServico.findUnique({ where: { id: o.osId }, select: { id: true, numero: true } }) : null,
    prisma.modeloMensagem.findFirst({ where: { tipo: "OR" }, orderBy: { padrao: "desc" } }),
  ]);
  const h = await headers();
  const link = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}/proposta/${o.token}`;
  const nomeEmpresa = empresa?.nomeFantasia || empresa?.razaoSocial || "MXTECH";
  const tags = { nome_cliente: o.cliente.nome, numero: String(o.numero), valor_total: brl(o.total), data: dia(o.data), validade: o.validade ?? "", vendedor: o.vendedor?.nome ?? "", link, nome_empresa: nomeEmpresa };
  const assunto = aplicarTags(modelo?.assunto ?? "Proposta comercial", tags);
  const corpo = aplicarTags(modelo?.email ?? "Segue a proposta: [link]", tags);
  const zap = aplicarTags(modelo?.sms ?? "Olá [nome_cliente], segue a proposta [numero]: [link]", tags);
  const fone = (o.cliente.celular ?? o.cliente.telefone ?? "").replace(/\D/g, "");
  const usuarios = new Map((await prisma.usuario.findMany({ where: { id: { in: anotacoes.map((a) => a.usuarioId).filter((x): x is string => !!x) } }, select: { id: true, nome: true } })).map((u) => [u.id, u.nome]));
  const ce = (o.camposExtras ?? {}) as Record<string, string>;
  const c = cor(o.situacao.cor);
  const base = `/orcamentos/${id}`;
  const ABAS = [
    { chave: "cliente", rotulo: "Cliente", icone: "pessoa", tem: true }, { chave: "produtos", rotulo: "Produtos", icone: "produtos", tem: o.produtos.length > 0 },
    { chave: "servicos", rotulo: "Serviços", icone: "servicos", tem: o.servicos.length > 0 }, { chave: "pagamento", rotulo: "Pagamento", icone: "dinheiro", tem: true },
    { chave: "entrega", rotulo: "Entrega", icone: "frete", tem: !!(o.transportadoraId || Number(o.frete) || o.mostrarEntrega || o.prazoEntrega) },
    { chave: "comissao", rotulo: "Comissão", icone: "percentual", tem: !!o.vendedor }, { chave: "campos", rotulo: "Campos extras", icone: "ajustes", tem: campos.length > 0 },
    { chave: "envios", rotulo: "Envios", icone: "envios", tem: true }, { chave: "historico", rotulo: "Histórico", icone: "relogio", tem: true },
    { chave: "anexos", rotulo: "Anexos", icone: "anexos", tem: true }, { chave: "anotacoes", rotulo: "Anotações", icone: "anotacoes", tem: true },
  ].filter((a) => a.tem);
  const aba = ABAS.some((a) => a.chave === sp.aba) ? sp.aba! : "cliente";
  const comissaoPct = Number(o.vendedor?.comissao ?? 0);
  const endEntrega = o.mostrarEntrega ? o.cliente.enderecos.find((e) => e.id === o.enderecoEntregaId) ?? o.cliente.enderecos[0] : null;

  return (
    <Pagina titulo="Visualizar orçamento" trilha={[{ rotulo: o.tipo === "SERVICO" ? "Orçamentos de serviços" : "Orçamentos de produtos", href: o.tipo === "SERVICO" ? "/orcamentos/servicos" : "/orcamentos" }, { rotulo: "Visualizar" }]}>
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[18px]"><Icone nome="notas" size={18} /> Orçamento #{o.numero}
            <span className={`pilula ${c.pilula}`}><span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${c.ponto}`} />{o.situacao.nome}</span></h2>
          <p className="text-[12px] text-slate-500">Criado em {o.createdAt.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" })}{criador ? ` por ${criador.nome.toUpperCase()}` : ""}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Suspenso direita classe="btn-laranja" botao={<><Icone nome="editar" size={15} /> Editar <Icone nome="abaixo" size={13} /></>}>
            <LinkSuspenso href={`${base}/editar`} icone="editar">Editar orçamento</LinkSuspenso>
            <LinkSuspenso href={`${base}?situacao=1`} icone="atualizar">Alterar situação</LinkSuspenso>
            <BotaoAcao acao={clonarOrcamentoAcao.bind(null, id)} icone="copiar">Gerar cópia</BotaoAcao>
            {venda ? <LinkSuspenso href={`/vendas/${venda.id}`} icone="carrinho">Ver venda nº {venda.numero}</LinkSuspenso>
              : <BotaoAcao acao={gerarVendaAcao.bind(null, id)} icone="carrinho" confirmar="Gerar a venda deste orçamento? Os produtos ficam reservados no estoque.">Gerar venda</BotaoAcao>}
            {os ? <LinkSuspenso href={`/os/${os.id}`} icone="os">Ver OS nº {os.numero}</LinkSuspenso>
              : <BotaoAcao acao={gerarOsAcao.bind(null, id)} icone="os" confirmar="Gerar uma ordem de serviço com os itens deste orçamento?">Gerar OS</BotaoAcao>}
            <BotaoExcluir acao={excluirOrcamentoAcao.bind(null, id)} pergunta={`Excluir o orçamento nº ${o.numero}?`} depois="/orcamentos" rotulo="Excluir orçamento" />
          </Suspenso>
          <Suspenso direita classe="btn bg-emerald-600 hover:bg-emerald-700" botao={<><Icone nome="compartilhar" size={15} /> Compartilhar <Icone nome="abaixo" size={13} /></>}>
            <a href={`mailto:${o.cliente.email ?? ""}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`} className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="email" size={15} /> Por e-mail</a>
            <a href={`https://wa.me/${fone.length >= 10 ? "55" + fone : ""}?text=${encodeURIComponent(zap)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="whatsapp" size={15} /> Por WhatsApp</a>
            <CopiarLink url={link} menu />
            <a href={`${base}/imprimir`} target="_blank" className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="imprimir" size={15} /> Imprimir</a>
          </Suspenso>
        </div>
      </div>

      {sp.situacao && <FormSituacao id={id} numero={o.numero} atual={o.situacaoId} situacoes={situacoes} voltar={base} />}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-3">
          <div className="cartao p-4 text-[13px]">
            <div className="flex justify-between text-slate-500"><span>Orçamento Nº {o.numero}</span><span>{dia(o.data)}</span></div>
            <div className="my-2 text-[26px] font-semibold text-marca">{brl(o.total)}</div>
            <dl className="space-y-1 border-t pt-2">
              <div><b>Situação:</b> {o.situacao.nome}</div>
              <div><b>Cliente:</b> <Link href={`/clientes/${o.clienteId}`} className="text-marca hover:underline">{o.cliente.nome}</Link></div>
              <div><b>Vendedor:</b> {o.vendedor?.nome ?? "—"}</div>
              <div><b>Previsão de entrega:</b> {dia(o.prazoEntrega)}</div>
              <div><b>Canal de venda:</b> {o.canal}</div>
              <div><b>Loja:</b> {nomeEmpresa}</div>
              {venda && <div><b>Venda:</b> <Link href={`/vendas/${venda.id}`} className="text-marca hover:underline">nº {venda.numero}</Link></div>}
              {os && <div><b>OS:</b> <Link href={`/os/${os.id}`} className="text-marca hover:underline">nº {os.numero}</Link></div>}
            </dl>
            <div className="mt-2 border-t pt-2 text-[11px] text-slate-500">Atualizado em {dataSP(o.updatedAt)} {horaSP(o.updatedAt)}</div>
          </div>
          <div className="cartao p-4 text-[13px]">
            <div className="mb-2 font-semibold">Link da proposta</div>
            <CopiarLink url={link} />
            <a href={`/proposta/${o.token}`} target="_blank" className="mt-2 inline-block text-[12px] text-marca hover:underline">Abrir a proposta como o cliente vê</a>
          </div>
        </aside>

        <section>
          <nav className="mb-3 flex flex-wrap gap-1">
            {ABAS.map((a) => <Link key={a.chave} href={a.chave === "cliente" ? base : `${base}?aba=${a.chave}`} className={`aba ${aba === a.chave ? "aba-ativa" : ""}`}><Icone nome={a.icone} size={14} /> {a.rotulo}</Link>)}
          </nav>

          {aba === "cliente" && (
            <div className="cartao p-4 text-[13px]">
              <div className="mb-2 flex items-center"><b className="text-[15px]">{o.cliente.nome}</b><Link href={`/clientes/${o.clienteId}`} className="btn-sec ml-auto py-1">Visualizar cliente</Link></div>
              <dl className="grid gap-1 sm:grid-cols-2">
                {o.cliente.fantasia && <div><b>Nome fantasia:</b> {o.cliente.fantasia}</div>}
                {o.cliente.documento && <div><b>CPF/CNPJ:</b> {cnpjFmt(o.cliente.documento)}</div>}
                <div><b>Telefone:</b> {o.cliente.telefone || o.cliente.celular || "—"}</div>
                <div><b>E-mail:</b> {o.cliente.email || "—"}</div>
                {o.aosCuidados && <div><b>Aos cuidados de:</b> {o.aosCuidados}</div>}
              </dl>
              {o.cliente.enderecos.map((e) => <p key={e.id} className="mt-2 border-t pt-2"><b>{e.tipo ?? "Endereço"}:</b> {e.logradouro}, {e.numero} · {e.bairro} · {e.cidade}/{e.uf} · CEP {e.cep}</p>)}
            </div>
          )}

          {aba === "produtos" && (
            <div className="cartao overflow-x-auto">
              <table className="tabela">
                <thead><tr><th>Produto</th><th className="text-right">Quant.</th><th className="text-right">Valor</th><th className="text-right">Desconto</th><th className="text-right">Subtotal</th></tr></thead>
                <tbody>{o.produtos.map((l) => <tr key={l.id}><td><Link href={`/produtos/${l.produto.id}`} className="hover:underline"><span className="font-mono text-[11px] text-slate-500">{l.produto.codigo}</span> {l.produto.nome}</Link>{l.detalhes && <div className="text-[11px] text-slate-500">{l.detalhes}</div>}</td>
                  <td className="text-right">{qtd(l.quantidade)} {l.produto.unidade}</td><td className="text-right">{num2(l.valorUnit)}</td><td className="text-right">{Number(l.desconto) ? num2(l.desconto) : ""}</td><td className="text-right font-semibold">{num2(l.subtotal)}</td></tr>)}</tbody>
                <tfoot><tr><td colSpan={4} className="text-right">Total de produtos</td><td className="text-right font-semibold">{num2(o.totalProdutos)}</td></tr></tfoot>
              </table>
            </div>
          )}

          {aba === "servicos" && (
            <div className="cartao overflow-x-auto">
              <table className="tabela">
                <thead><tr><th>Serviço</th><th className="text-right">Quant.</th><th className="text-right">Valor</th><th className="text-right">Desconto</th><th className="text-right">Subtotal</th></tr></thead>
                <tbody>{o.servicos.map((l) => <tr key={l.id}><td><Link href={`/servicos/${l.servico.id}`} className="hover:underline"><span className="font-mono text-[11px] text-slate-500">{l.servico.codigo}</span> {l.servico.nome}</Link>{l.detalhes && <div className="text-[11px] text-slate-500">{l.detalhes}</div>}</td>
                  <td className="text-right">{qtd(l.quantidade)}</td><td className="text-right">{num2(l.valorUnit)}</td><td className="text-right">{Number(l.desconto) ? num2(l.desconto) : ""}</td><td className="text-right font-semibold">{num2(l.subtotal)}</td></tr>)}</tbody>
                <tfoot><tr><td colSpan={4} className="text-right">Total de serviços</td><td className="text-right font-semibold">{num2(o.totalServicos)}</td></tr></tfoot>
              </table>
            </div>
          )}

          {aba === "pagamento" && (
            <div className="space-y-3">
              <div className="cartao grid gap-3 p-4 text-[13px] sm:grid-cols-5">
                {[["Produtos", o.totalProdutos], ["Serviços", o.totalServicos], ["Frete", o.frete], ["Desconto", o.desconto], ["Total", o.total]].map(([k, v]) => <div key={k as string}><div className="text-slate-500">{k as string}</div><div className={`font-semibold ${k === "Total" ? "text-[18px] text-marca" : "text-[15px]"}`}>{brl(Number(v))}</div></div>)}
              </div>
              {o.gerarCondicoes && o.parcelas.length ? (
                <div className="cartao overflow-x-auto">
                  <div className="px-4 pt-3 text-[13px]"><b>Condição:</b> {o.condicao === "PARCELADO" ? `Parcelado em ${o.parcelas.length}x` : "À vista"}{o.formaPagamento ? ` · ${o.formaPagamento.nome}` : ""}</div>
                  <table className="tabela"><thead><tr><th>Parcela</th><th>Vencimento</th><th className="text-right">Valor</th><th>Forma</th><th>Observação</th></tr></thead>
                    <tbody>{o.parcelas.map((p) => <tr key={p.id}><td>{p.numero}</td><td>{dia(p.vencimento)}</td><td className="text-right">{num2(p.valor)}</td><td>{p.formaPagamento?.nome ?? o.formaPagamento?.nome ?? ""}</td><td>{p.observacao}</td></tr>)}</tbody></table>
                </div>
              ) : <Vazio icone="dinheiro" titulo="Nenhuma forma de pagamento foi definida" />}
            </div>
          )}

          {aba === "entrega" && (
            <div className="cartao space-y-1 p-4 text-[13px]">
              <div><b>Previsão de entrega:</b> {dia(o.prazoEntrega)}</div>
              <div><b>Transportadora:</b> {o.transportadora?.nome ?? "—"}</div>
              <div><b>Valor do frete:</b> {brl(o.frete)}</div>
              {endEntrega && <div><b>Endereço de entrega:</b> {endEntrega.logradouro}, {endEntrega.numero} · {endEntrega.bairro} · {endEntrega.cidade}/{endEntrega.uf}</div>}
            </div>
          )}

          {aba === "comissao" && (
            <div className="cartao p-4 text-[13px]">
              <b>{o.vendedor?.nome}</b> · comissão de {num2(comissaoPct)}% sobre {brl(o.total)} = <b>{brl((Number(o.total) * comissaoPct) / 100)}</b>
              <p className="mt-1 text-[11px] text-slate-500">A comissão só é gerada quando o orçamento vira venda.</p>
            </div>
          )}

          {aba === "campos" && <div className="cartao p-4 text-[13px]">{campos.map((x) => <div key={x.id}><b>{x.nome}:</b> {ce[x.id] || "—"}</div>)}</div>}

          {aba === "envios" && <Vazio icone="envios" titulo="Nenhum envio registrado" texto="Use Compartilhar › Por e-mail ou WhatsApp para mandar a proposta ao cliente." />}

          {aba === "historico" && (
            <div className="cartao p-4">
              <ol className="relative ml-2 border-l border-slate-200">
                {o.historico.map((x) => (
                  <li key={x.id} className="mb-4 ml-4 text-[13px]">
                    <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-marca" />
                    <div>{x.descricao}{x.situacao && <span className="ml-1 text-slate-500">· {x.situacao}</span>}</div>
                    <div className="text-[11px] text-slate-500">{x.usuarioNome ? `Por ${x.usuarioNome} · ` : ""}{dataSP(x.createdAt)} • {horaSP(x.createdAt)}</div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {aba === "anexos" && (
            <div className="cartao p-4">
              <FormAnexo entidade="ORCAMENTO" entidadeId={id} caminho={`${base}?aba=anexos`} />
              {anexos.length ? (
                <table className="tabela"><tbody>{anexos.map((a) => <tr key={a.id}><td><a href={`/api/cadastros/anexo/${a.id}`} className="text-marca hover:underline">{a.nome}</a></td><td className="w-36">{dataSP(a.createdAt)}</td>
                  <td className="w-12 text-right"><BotaoExcluir acao={excluirAnexoAcao.bind(null, a.id)} pergunta={`Excluir o anexo ${a.nome}?`} /></td></tr>)}</tbody></table>
              ) : <p className="text-[13px] text-slate-500">Nenhum anexo.</p>}
            </div>
          )}

          {aba === "anotacoes" && (
            <div className="cartao p-4">
              <FormAnotacaoOrc id={id} caminho={`${base}?aba=anotacoes`} />
              <div className="space-y-2">
                {anotacoes.map((a) => (
                  <div key={a.id} className="rounded border border-slate-200 bg-[#fffdf3] p-3">
                    <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-500"><b>{usuarios.get(a.usuarioId ?? "") ?? "—"}</b> · {dataSP(a.createdAt)} {horaSP(a.createdAt)}
                      <span className="ml-auto"><BotaoExcluir acao={excluirAnotacaoAcao.bind(null, a.id)} pergunta="Excluir esta anotação?" /></span></div>
                    <p className="whitespace-pre-wrap text-[13px]">{a.texto}</p>
                  </div>
                ))}
                {!anotacoes.length && <p className="text-[13px] text-slate-500">Nenhuma anotação.</p>}
              </div>
            </div>
          )}
        </section>
      </div>
    </Pagina>
  );
}
