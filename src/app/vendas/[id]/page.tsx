import Link from "next/link";
import DicaSaldo from "@/components/estoque/DicaSaldo";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { diaSP } from "@/lib/datas";
import { empresaDoDocumento } from "@/lib/empresa/atual";
import { cor, aplicarTags } from "@/lib/orcamentos/tipos";
import { excluirAnotacaoAcao } from "@/lib/orcamentos/acoes";
import { alterarSituacaoVendaAcao, anotarVendaAcao, clonarVendaAcao, emitirNotaVendaAcao, excluirVendaEVoltarAcao } from "@/lib/vendas/acoes";
import { excluirAnexoAcao } from "@/lib/cadastros/acoes";
import { brl, dataSP, horaSP, num2, qtd } from "@/lib/ui/format";
import { Pagina } from "@/components/ui/Pagina";
import Suspenso from "@/components/ui/Suspenso";
import { LinkSuspenso } from "@/components/ui/BarraLista";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import BotaoAcao from "@/components/ui/BotaoAcao";
import Icone from "@/components/Icone";
import VoltarConta from "@/components/financeiro/VoltarConta";
import NotasDoDocumento from "@/components/NotasDoDocumento";
import { FormAnexo } from "@/components/cadastros/FormsVer";
import FormSituacao from "@/components/orcamentos/FormSituacao";
import CancelarBalcao from "@/components/vendas/CancelarBalcao";
import { usuarioAtual } from "@/lib/auth/atual";
import { podeAcessar } from "@/lib/auth/permissoes";
import { pode } from "@/lib/auth/permissoesAcao";
import CopiarLink from "@/components/orcamentos/CopiarLink";
import FormAnotacaoOrc from "@/components/orcamentos/FormAnotacaoOrc";
import { avisoSituacao, baseVendas, tituloVendas } from "@/components/vendas/ListaVendas";
import BoletoParcela from "@/components/BoletoParcela";
import { baseLinks, boletosDisponiveis } from "@/lib/financeiro/boletos";
import EnviosDaVenda from "@/components/frete/EnviosDaVenda";
import { freteAtivo } from "@/lib/frete/melhorEnvio";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visualizar venda" };

const dia = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const docFmt = (c: string) => (c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4"));

function Vazio({ icone, titulo, texto }: { icone: string; titulo: string; texto?: string }) {
  return <div className="cartao flex flex-col items-center px-4 py-10 text-center text-slate-500"><Icone nome={icone} size={28} /><b className="mt-2 text-slate-700">{titulo}</b>{texto && <span className="text-[13px]">{texto}</span>}</div>;
}

export default async function VerVenda({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string; situacao?: string; conta?: string; cancelar?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const v = await prisma.venda.findUnique({
    where: { id },
    include: {
      cliente: { include: { enderecos: { orderBy: { ordem: "asc" } } } }, vendedor: { select: { nome: true, comissao: true } }, situacaoCfg: true, transportadora: { select: { nome: true } },
      formaPagamento: true, parcelas: { orderBy: { numero: "asc" }, include: { formaPagamento: { select: { nome: true } } } },
      itens: { orderBy: { ordem: "asc" }, include: { produto: { select: { id: true, codigo: true, nome: true, unidade: true } } } },
      servicos: { orderBy: { ordem: "asc" }, include: { servico: { select: { id: true, codigo: true, nome: true } } } },
      pagamentos: { include: { formaPagamento: true } }, historico: { orderBy: { createdAt: "desc" } },
      devolucoes: { orderBy: { createdAt: "desc" }, include: { itens: true, vale: true } },
    },
  });
  if (!v) notFound();
  const [situacoes, criador, empresa, anexos, anotacoes, campos, modelo, lancamentos, reservas, orcamento] = await Promise.all([
    prisma.situacaoVendaConfig.findMany({ orderBy: { ordem: "asc" } }),
    v.criadoPorId ? prisma.usuario.findUnique({ where: { id: v.criadoPorId }, select: { nome: true } }) : null,
    empresaDoDocumento(v.empresaId),
    prisma.anexo.findMany({ where: { entidade: "VENDA", entidadeId: id }, select: { id: true, nome: true, tamanho: true, createdAt: true } }),
    prisma.anotacao.findMany({ where: { entidade: "VENDA", entidadeId: id }, orderBy: { createdAt: "desc" } }),
    prisma.campoExtra.findMany({ where: { entidade: "VENDA" }, orderBy: [{ ordem: "asc" }, { nome: "asc" }] }),
    prisma.modeloMensagem.findFirst({ where: { tipo: "VE" }, orderBy: { padrao: "desc" } }),
    prisma.lancamento.findMany({ where: { origemTipo: "VENDA", origemId: id }, include: { formaPagamento: true, categoria: true, boletos: { orderBy: { createdAt: "desc" } } }, orderBy: [{ vencimento: "asc" }, { parcela: "asc" }] }),
    prisma.reserva.findMany({ where: { origemTipo: "VENDA", origemId: id, status: { in: ["ATIVA", "BAIXADA"] } }, include: { local: { select: { codigo: true } } } }),
    prisma.orcamento.findFirst({ where: { vendaId: id }, select: { id: true, numero: true } }),
  ]);
  const h = await headers();
  const [interAtivo, baseCliente, comFrete, envios] = await Promise.all([boletosDisponiveis(), baseLinks(), freteAtivo(), prisma.envioFrete.count({ where: { vendaId: id } })]);
  const errosBoleto = lancamentos.filter((l) => !l.pagoEm && l.boletos[0]?.situacao === "ERRO").length;
  const link = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}/cobranca/${v.token}`;
  const nomeEmpresa = empresa?.nomeFantasia || empresa?.razaoSocial || "MXTECH";
  const nomeCliente = v.cliente?.nome ?? "Consumidor";
  const tags = { nome_cliente: nomeCliente, numero: String(v.numero), valor_total: brl(v.total), data: dataSP(v.data), validade: "", vendedor: v.vendedor?.nome ?? "", link, nome_empresa: nomeEmpresa };
  const assunto = aplicarTags(modelo?.assunto ?? "Pedido de venda", tags);
  const corpo = aplicarTags(modelo?.email ?? "Segue o pedido: [link]", tags);
  const zap = aplicarTags(modelo?.sms ?? "Olá [nome_cliente], segue o pedido [numero]: [link]", tags);
  const fone = (v.cliente?.celular ?? v.cliente?.telefone ?? "").replace(/\D/g, "");
  const usuarios = new Map((await prisma.usuario.findMany({ where: { id: { in: anotacoes.map((a) => a.usuarioId).filter((x): x is string => !!x) } }, select: { id: true, nome: true } })).map((u) => [u.id, u.nome]));
  const ce = (v.camposExtras ?? {}) as Record<string, string>;
  const c = cor(v.situacaoCfg?.cor ?? "cinza");
  const base = `/vendas/${id}`;
  const balcao = v.tipo === "BALCAO";
  const tl = v.tipo === "SERVICO" ? "SERVICO" : balcao ? "BALCAO" : "PEDIDO";
  const notas = await prisma.notaFiscal.count({ where: { origemTipo: "VENDA", origemId: id } });
  const doContrato = await prisma.contratoCobranca.findUnique({ where: { vendaId: id }, select: { referencia: true, contrato: { select: { id: true, numero: true } } } });
  const ABAS = [
    { chave: "cliente", rotulo: "Cliente", icone: "pessoa", tem: !!v.cliente }, { chave: "produtos", rotulo: "Produtos", icone: "produtos", tem: v.itens.length > 0 },
    { chave: "servicos", rotulo: "Serviços", icone: "servicos", tem: v.servicos.length > 0 }, { chave: "pagamento", rotulo: "Pagamento", icone: "dinheiro", tem: true },
    { chave: "entrega", rotulo: "Entrega", icone: "frete", tem: !!(v.transportadoraId || Number(v.frete) || v.mostrarEntrega || v.prazoEntrega || envios || (comFrete && v.itens.length && !balcao)) },
    { chave: "comissao", rotulo: "Comissão", icone: "percentual", tem: !!v.vendedor }, { chave: "notas", rotulo: "Notas fiscais", icone: "notas", tem: true },
    { chave: "devolucoes", rotulo: "Trocas e devoluções", icone: "atualizar", tem: v.devolucoes.length > 0 },
    { chave: "campos", rotulo: "Campos extras", icone: "ajustes", tem: campos.length > 0 }, { chave: "envios", rotulo: "Envios", icone: "envios", tem: true },
    { chave: "historico", rotulo: "Histórico", icone: "relogio", tem: true }, { chave: "anexos", rotulo: "Anexos", icone: "anexos", tem: true },
    { chave: "anotacoes", rotulo: "Anotações", icone: "anotacoes", tem: true },
  ].filter((a) => a.tem);
  const aba = ABAS.some((a) => a.chave === sp.aba) ? sp.aba! : ABAS[0].chave;
  const comissaoPct = Number(v.vendedor?.comissao ?? 0);
  const endEntrega = v.mostrarEntrega && v.cliente ? v.cliente.enderecos.find((e) => e.id === v.enderecoEntregaId) ?? v.cliente.enderecos[0] : null;
  const ondeItem = (itemId: string) => reservas.filter((r) => r.origemItemId === itemId).map((r) => `${r.local?.codigo ?? "EM FALTA"} (${qtd(r.quantidade)})${r.status === "BAIXADA" ? " · saiu" : ""}`).join(", ");
  const concluida = v.situacao === "CONCLUIDA";
  const podeEditar = !balcao && (v.situacaoCfg?.permiteEdicao ?? true);
  const eu = await usuarioAtual();
  const verFinanceiro = !!eu && podeAcessar(eu.papel, "/financeiro");
  const podeCancelar = balcao && concluida && !!eu && (await pode(eu.papel, "pdv.cancelar"));
  const recebido = lancamentos.filter((l) => l.pagoEm).reduce((s, l) => s + Number(l.valor), 0);

  return (
    <Pagina voltar={baseVendas(tl)} titulo="Visualizar venda" trilha={[{ rotulo: tituloVendas(tl), href: baseVendas(tl) }, { rotulo: "Visualizar" }]}>
      <VoltarConta contaId={sp.conta} />
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[18px]"><Icone nome={balcao ? "balcao" : "carrinho"} size={18} /> Venda #{v.numero}
            <span className={`pilula ${c.pilula}`}>{v.situacaoCfg?.nome ?? v.situacao}</span></h2>
          <p className="text-[12px] text-slate-500">Criado em {v.createdAt.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" })}{criador ? ` por ${criador.nome.toUpperCase()}` : ""}{balcao ? " · Balcão (PDV)" : ""}</p>
        </div>
        <div className="no-print ml-auto flex gap-2">
          <Suspenso direita classe="btn-laranja" botao={<><Icone nome="editar" size={15} /> Editar <Icone nome="abaixo" size={13} /></>}>
            {podeEditar && <LinkSuspenso href={`${base}/editar`} icone="editar">Editar venda</LinkSuspenso>}
            <LinkSuspenso href={`${base}?situacao=1`} icone="atualizar">Alterar situação</LinkSuspenso>
            {!balcao && <BotaoAcao acao={clonarVendaAcao.bind(null, id)} icone="copiar">Gerar cópia</BotaoAcao>}
            {concluida && v.itens.length > 0 && <BotaoAcao acao={emitirNotaVendaAcao.bind(null, id, "NFE")} icone="notas" confirmar={`Emitir a NF-e da venda nº ${v.numero}?`}>Emitir NF-e</BotaoAcao>}
            {concluida && v.servicos.length > 0 && <BotaoAcao acao={emitirNotaVendaAcao.bind(null, id, "NFSE")} icone="notas" confirmar={`Emitir a NFS-e da venda nº ${v.numero}?`}>Emitir NFS-e</BotaoAcao>}
            {verFinanceiro && <LinkSuspenso href={`/financeiro?tipo=RECEBER&periodo=todos&doc=${id}`} icone="financeiro">Ver no financeiro</LinkSuspenso>}
            {concluida && v.itens.length > 0 && <LinkSuspenso href={`/vendas/devolucoes/adicionar?venda=${v.numero}`} icone="atualizar">Troca ou devolução</LinkSuspenso>}
            {podeCancelar && <LinkSuspenso href={`${base}?cancelar=1`} icone="fechar">Cancelar venda</LinkSuspenso>}
            <BotaoExcluir acao={excluirVendaEVoltarAcao.bind(null, id, baseVendas(tl))} pergunta={`Excluir a venda nº ${v.numero}? O estoque volta e as contas a receber em aberto são apagadas.`} rotulo="Excluir venda" />
          </Suspenso>
          <Suspenso direita classe="btn bg-emerald-600 hover:bg-emerald-700" botao={<><Icone nome="compartilhar" size={15} /> Compartilhar <Icone nome="abaixo" size={13} /></>}>
            <a href={`mailto:${v.cliente?.email ?? ""}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`} className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="email" size={15} /> Por e-mail</a>
            <a href={`https://wa.me/${fone.length >= 10 ? "55" + fone.replace(/^55/, "") : ""}?text=${encodeURIComponent(zap)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="whatsapp" size={15} /> Por WhatsApp</a>
            <CopiarLink url={link} menu />
            <a href={`${base}/imprimir`} target="_blank" className="flex items-center gap-2 px-3 py-[7px] hover:bg-slate-100"><Icone nome="imprimir" size={15} /> Imprimir</a>
          </Suspenso>
        </div>
      </div>

      {errosBoleto > 0 && (
        <Link href={`${base}?aba=pagamento`} className="mb-3 flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          <Icone nome="alerta" size={15} /> {errosBoleto === 1 ? "Um boleto não foi registrado" : `${errosBoleto} boletos não foram registrados`} no Banco Inter. Veja o motivo na aba Pagamento.
        </Link>
      )}

      {sp.cancelar && (podeCancelar || (balcao && v.situacao === "CANCELADA")) && <CancelarBalcao id={id} numero={v.numero} recebido={brl(recebido)} formas={[...new Set(v.pagamentos.map((p) => p.formaPagamento.nome))].join(", ")} voltar={base} />}
      {sp.situacao && <FormSituacao id={id} numero={v.numero} atual={v.situacaoId ?? ""} situacoes={situacoes.map((s) => ({ id: s.id, nome: s.nome, aviso: avisoSituacao(s) }))} voltar={base} acao={alterarSituacaoVendaAcao} rotulo="da venda" />}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-3">
          <div className="cartao p-4 text-[13px]">
            <div className="flex justify-between text-slate-500"><span>Venda Nº {v.numero}</span><span>{dataSP(v.data)}</span></div>
            <div className="my-2 text-[26px] font-semibold text-marca">{brl(v.total)}</div>
            <dl className="space-y-1 border-t pt-2">
              <div><b>Situação:</b> {v.situacaoCfg?.nome ?? v.situacao}</div>
              <div><b>Cliente:</b> {v.cliente ? <Link href={`/clientes/${v.clienteId}`} className="text-marca hover:underline">{v.cliente.nome}</Link> : "Consumidor"}</div>
              <div><b>Vendedor:</b> {v.vendedor?.nome ?? "—"}</div>
              {doContrato && <div><b>Contrato:</b> <Link href={`/contratos/${doContrato.contrato.id}`} className="text-marca hover:underline">nº {doContrato.contrato.numero}</Link> ({doContrato.referencia})</div>}
              {!balcao && <div><b>Previsão de entrega:</b> {dia(v.prazoEntrega)}</div>}
              <div><b>Canal de venda:</b> {v.canal}</div>
              <div><b>Loja:</b> {nomeEmpresa}</div>
              {orcamento && <div><b>Orçamento:</b> <Link href={`/orcamentos/${orcamento.id}`} className="text-marca hover:underline">nº {orcamento.numero}</Link></div>}
            </dl>
            <div className="mt-2 border-t pt-2 text-[11px] text-slate-500">Atualizado em {dataSP(v.updatedAt)} {horaSP(v.updatedAt)}</div>
          </div>
          {v.situacaoCfg?.exibirCobranca !== false && (
            <div className="cartao p-4 text-[13px]">
              <div className="mb-2 font-semibold">Link de cobrança</div>
              <CopiarLink url={link} />
              <a href={`/cobranca/${v.token}`} target="_blank" className="mt-2 inline-block text-[12px] text-marca hover:underline">Abrir como o cliente vê</a>
            </div>
          )}
        </aside>

        <section>
          <nav className="mb-3 flex flex-wrap gap-1">
            {ABAS.map((a) => <Link key={a.chave} href={a.chave === ABAS[0].chave ? (sp.conta ? `${base}?conta=${sp.conta}` : base) : `${base}?aba=${a.chave}${sp.conta ? `&conta=${sp.conta}` : ""}`} className={`aba ${aba === a.chave ? "aba-ativa" : ""}`}><Icone nome={a.icone} size={14} /> {a.rotulo}</Link>)}
          </nav>

          {aba === "cliente" && v.cliente && (
            <div className="cartao p-4 text-[13px]">
              <div className="mb-2 flex items-center"><b className="text-[15px]">{v.cliente.nome}</b><Link href={`/clientes/${v.clienteId}`} className="btn-sec ml-auto py-1">Visualizar cliente</Link></div>
              <dl className="grid gap-1 sm:grid-cols-2">
                {v.cliente.fantasia && <div><b>Nome fantasia:</b> {v.cliente.fantasia}</div>}
                {v.cliente.documento && <div><b>CPF/CNPJ:</b> {docFmt(v.cliente.documento)}</div>}
                <div><b>Telefone:</b> {v.cliente.telefone || v.cliente.celular || "—"}</div>
                <div><b>E-mail:</b> {v.cliente.email || "—"}</div>
              </dl>
              {v.cliente.enderecos.map((e) => <p key={e.id} className="mt-2 border-t pt-2"><b>{e.tipo ?? "Endereço"}:</b> {e.logradouro}, {e.numero} · {e.bairro} · {e.cidade}/{e.uf} · CEP {e.cep}</p>)}
            </div>
          )}

          {aba === "produtos" && (
            <div className="cartao overflow-x-auto">
              <table className="tabela">
                <thead><tr><th>Produto</th><th>Estoque</th><th className="text-right">Quant.</th><th className="text-right">Valor</th><th className="text-right">Desconto</th><th className="text-right">Subtotal</th></tr></thead>
                <tbody>{v.itens.map((l) => <tr key={l.id}><td>{l.descricao ? <>{l.descricao} <span className="pilula text-[10px] text-slate-500">avulso</span></> : <Link href={`/produtos/${l.produto.id}`} className="hover:underline"><span className="font-mono text-[11px] text-slate-500">{l.produto.codigo}</span> {l.produto.nome}</Link>}{l.detalhes && <div className="text-[11px] text-slate-500">{l.detalhes}</div>}</td>
                  <td className="text-[12px] text-slate-600">{ondeItem(l.id) || "—"}</td>
                  <td className="text-right"><DicaSaldo produtoId={l.produto.id}>{qtd(l.quantidade)} {l.produto.unidade}</DicaSaldo></td><td className="text-right">{num2(l.valorUnit)}</td><td className="text-right">{Number(l.desconto) ? num2(l.desconto) : ""}</td><td className="text-right font-semibold">{num2(l.subtotal)}</td></tr>)}</tbody>
                <tfoot><tr><td colSpan={5} className="text-right">Total de produtos</td><td className="text-right font-semibold">{num2(v.itens.reduce((s, i) => s + Number(i.subtotal), 0))}</td></tr></tfoot>
              </table>
            </div>
          )}

          {aba === "servicos" && (
            <div className="cartao overflow-x-auto">
              <table className="tabela">
                <thead><tr><th>Serviço</th><th className="text-right">Quant.</th><th className="text-right">Valor</th><th className="text-right">Desconto</th><th className="text-right">Subtotal</th></tr></thead>
                <tbody>{v.servicos.map((l) => <tr key={l.id}><td><Link href={`/servicos/${l.servico.id}`} className="hover:underline"><span className="font-mono text-[11px] text-slate-500">{l.servico.codigo}</span> {l.servico.nome}</Link>{l.detalhes && <div className="text-[11px] text-slate-500">{l.detalhes}</div>}</td>
                  <td className="text-right">{qtd(l.quantidade)}</td><td className="text-right">{num2(l.valorUnit)}</td><td className="text-right">{Number(l.desconto) ? num2(l.desconto) : ""}</td><td className="text-right font-semibold">{num2(l.subtotal)}</td></tr>)}</tbody>
                <tfoot><tr><td colSpan={4} className="text-right">Total de serviços</td><td className="text-right font-semibold">{num2(v.servicos.reduce((s, i) => s + Number(i.subtotal), 0))}</td></tr></tfoot>
              </table>
            </div>
          )}

          {aba === "pagamento" && (
            <div className="space-y-3">
              <div className="cartao grid gap-3 p-4 text-[13px] sm:grid-cols-5">
                {([["Produtos", v.totalProdutos], ["Serviços", v.totalServicos], ["Frete", v.frete], ["Desconto", v.desconto], ["Total", v.total]] as [string, unknown][]).map(([k, x]) => <div key={k}><div className="text-slate-500">{k}</div><div className={`font-semibold ${k === "Total" ? "text-[18px] text-marca" : "text-[15px]"}`}>{brl(Number(x))}</div></div>)}
              </div>
              <div className="px-1 text-[13px]"><b>Condição:</b> {balcao ? v.pagamentos.map((p) => `${p.formaPagamento.nome}${p.parcelas > 1 ? ` ${p.parcelas}x` : ""}`).join(" + ") || "—" : v.condicao === "PARCELADO" ? `Parcelado em ${v.parcelas.length}x` : "À vista"}{!balcao && v.formaPagamento ? ` · ${v.formaPagamento.nome}` : ""}</div>
              {lancamentos.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {lancamentos.map((l) => {
                    const recebida = !!l.pagoEm;
                    const atrasada = !recebida && l.vencimento < diaSP();
                    return (
                      <div key={l.id} className="cartao p-3 text-[13px]">
                        <div className="flex items-center gap-2"><b>{l.formaPagamento?.nome ?? "A combinar"}</b>
                          <span className={`pilula ml-auto ${recebida ? "border-emerald-300 bg-emerald-50 text-emerald-700" : atrasada ? "border-red-300 bg-red-50 text-red-700" : "border-orange-300 bg-orange-50 text-orange-700"}`}>{recebida ? "Recebida" : atrasada ? "Atrasada" : "A receber"}</span></div>
                        <div className="mt-1 flex text-slate-600"><span>Vencimento {dia(l.vencimento)} · {l.categoria.nome}</span><b className="ml-auto text-slate-800">{brl(l.valor)}</b></div>
                        <div className="text-[11px] text-slate-500">Parcela {l.parcela}/{l.totalParcelas}</div>
                        <BoletoParcela parcela={l} cliente={v.cliente} base={baseCliente} interAtivo={interAtivo} />
                      </div>
                    );
                  })}
                </div>
              ) : v.parcelas.length ? (
                <div className="cartao overflow-x-auto">
                  <p className="px-4 pt-3 text-[12px] text-slate-500">Esta situação não lança o financeiro: as parcelas viram contas a receber quando a venda for para uma situação que lança.</p>
                  <table className="tabela"><thead><tr><th>Parcela</th><th>Vencimento</th><th className="text-right">Valor</th><th>Forma</th><th>Observação</th></tr></thead>
                    <tbody>{v.parcelas.map((p) => <tr key={p.id}><td>{p.numero}</td><td>{dia(p.vencimento)}</td><td className="text-right">{num2(p.valor)}</td><td>{p.formaPagamento?.nome ?? v.formaPagamento?.nome ?? ""}</td><td>{p.observacao}</td></tr>)}</tbody></table>
                </div>
              ) : <Vazio icone="dinheiro" titulo="Nenhuma forma de pagamento foi definida" />}
            </div>
          )}

          {aba === "entrega" && (
            <div className="cartao space-y-1 p-4 text-[13px]">
              <div><b>Previsão de entrega:</b> {dia(v.prazoEntrega)}</div>
              <div><b>Transportadora:</b> {v.transportadora?.nome ?? "—"}</div>
              <div><b>Valor do frete:</b> {brl(v.frete)}</div>
              {v.freteServicoNome && <div><b>Serviço de frete:</b> {v.freteServicoNome}{v.fretePrazoDias ? ` · até ${v.fretePrazoDias} dias úteis` : ""}</div>}
              {endEntrega && <div><b>Endereço de entrega:</b> {endEntrega.logradouro}, {endEntrega.numero} · {endEntrega.bairro} · {endEntrega.cidade}/{endEntrega.uf}</div>}
            </div>
          )}
          {aba === "entrega" && <EnviosDaVenda vendaId={id} temProdutos={v.itens.length > 0} escolhido={v.freteServicoId} freteNome={v.freteServicoNome} />}

          {aba === "comissao" && (
            <div className="cartao p-4 text-[13px]">
              <b>{v.vendedor?.nome}</b> · comissão de {num2(comissaoPct)}% sobre {brl(v.total)} = <b>{brl((Number(v.total) * comissaoPct) / 100)}</b>
              <p className="mt-1 text-[11px] text-slate-500">{concluida ? "Venda concretizada: a comissão entra no relatório do vendedor." : "A comissão entra no relatório quando a venda for concretizada."}</p>
            </div>
          )}

          {aba === "notas" && <NotasDoDocumento origemTipo="VENDA" origemId={id} podeEmitir={concluida} temProdutos={v.itens.length > 0} temServicos={v.servicos.length > 0} />}
          {aba === "notas" && !notas && !concluida && <p className="mt-2 text-[12px] text-slate-500">A nota é emitida quando a venda estiver numa situação que lança o estoque.</p>}

          {aba === "devolucoes" && (
            <div className="cartao overflow-x-auto">
              <table className="tabela">
                <thead><tr><th>Nº</th><th>Tipo</th><th>Data</th><th className="text-right">Itens</th><th className="text-right">Total</th><th>Vale-compras</th></tr></thead>
                <tbody>{v.devolucoes.map((d) => <tr key={d.id}><td>{d.numero}</td><td>{d.tipo === "TROCA" ? "Troca" : "Devolução"}</td><td>{dataSP(d.createdAt)}</td><td className="text-right">{d.itens.reduce((s, i) => s + Number(i.quantidade), 0)}</td><td className="text-right">{num2(d.total)}</td><td>{d.vale ? `${d.vale.codigo} · saldo ${brl(d.vale.saldo)}` : "—"}</td></tr>)}</tbody>
              </table>
            </div>
          )}

          {aba === "campos" && <div className="cartao p-4 text-[13px]">{campos.map((x) => <div key={x.id}><b>{x.nome}:</b> {ce[x.id] || "—"}</div>)}</div>}

          {aba === "envios" && <Vazio icone="envios" titulo="Nenhum envio registrado" texto="Use Compartilhar › Por e-mail ou WhatsApp para mandar o pedido e o link de cobrança ao cliente." />}

          {aba === "historico" && (
            <div className="cartao p-4">
              <ol className="relative ml-2 border-l border-slate-200">
                {v.historico.map((x) => (
                  <li key={x.id} className="mb-4 ml-4 text-[13px]">
                    <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-marca" />
                    <div>{x.descricao}{x.situacao && <span className="ml-1 text-slate-500">· {x.situacao}</span>}</div>
                    <div className="text-[11px] text-slate-500">{x.usuarioNome ? `Por ${x.usuarioNome} · ` : ""}{dataSP(x.createdAt)} • {horaSP(x.createdAt)}</div>
                  </li>
                ))}
                {!v.historico.length && <li className="ml-4 text-[13px] text-slate-500">Sem histórico registrado.</li>}
              </ol>
            </div>
          )}

          {aba === "anexos" && (
            <div className="cartao p-4">
              <FormAnexo entidade="VENDA" entidadeId={id} caminho={`${base}?aba=anexos`} />
              {anexos.length ? (
                <table className="tabela"><tbody>{anexos.map((a) => <tr key={a.id}><td><a href={`/api/cadastros/anexo/${a.id}`} className="text-marca hover:underline">{a.nome}</a></td><td className="w-36">{dataSP(a.createdAt)}</td>
                  <td className="w-12 text-right"><BotaoExcluir acao={excluirAnexoAcao.bind(null, a.id)} pergunta={`Excluir o anexo ${a.nome}?`} /></td></tr>)}</tbody></table>
              ) : <p className="text-[13px] text-slate-500">Nenhum anexo.</p>}
            </div>
          )}

          {aba === "anotacoes" && (
            <div className="cartao p-4">
              <FormAnotacaoOrc id={id} caminho={`${base}?aba=anotacoes`} acao={anotarVendaAcao} sobre="a venda" />
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
