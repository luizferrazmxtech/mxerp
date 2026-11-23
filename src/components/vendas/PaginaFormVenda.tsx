import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { colunasVisiveis } from "@/lib/ui/colunas";
import { proximoNumeroVenda, situacaoPadraoVenda } from "@/lib/vendas/pedidos";
import { configVenda } from "@/lib/vendas/config";
import { Pagina } from "@/components/ui/Pagina";
import { freteAtivo } from "@/lib/frete/melhorEnvio";
import FormOrcamento, { type InicialOrcamento } from "@/components/orcamentos/FormOrcamento";
import { canalLista } from "@/components/orcamentos/PaginaFormOrcamento";
import { CAMPOS_VENDA, COLUNAS_ITENS } from "@/lib/orcamentos/tipos";
import { avisoSituacao, baseVendas, tituloVendas } from "./ListaVendas";

const n2 = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qt = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const isoSP = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const hoje = () => isoSP(new Date());

/** Formulário "Adicionar/Editar venda": o mesmo do orçamento, com situação e sem os campos da proposta. */
export default async function PaginaFormVenda({ tipo, id, clienteId }: { tipo?: "PRODUTO" | "SERVICO"; id?: string; clienteId?: string }) {
  const u = await usuarioAtual();
  const [vendedores, situacoes, formas, tiposValor, campos, centros, proximo, cfg, canais, padrao] = await Promise.all([
    prisma.usuario.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.situacaoVendaConfig.findMany({ orderBy: { ordem: "asc" } }),
    prisma.formaPagamento.findMany({ where: { ativa: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.tipoValor.findMany({ orderBy: [{ padrao: "desc" }, { nome: "asc" }], select: { id: true, nome: true, padrao: true } }),
    prisma.campoExtra.findMany({ where: { entidade: "VENDA" }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
    prisma.venda.findMany({ where: { centroCusto: { not: null } }, distinct: ["centroCusto"], select: { centroCusto: true } }),
    proximoNumeroVenda(),
    configVenda(),
    prisma.canalVenda.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }] }),
    situacaoPadraoVenda(),
  ]);
  let inicial: InicialOrcamento = {
    tipo: tipo ?? "PRODUTO", numero: "", clienteId: "", clienteNome: "", data: hoje(), validade: "", vendedorId: u?.id ?? "", prazoEntrega: "",
    aosCuidados: "", canal: canais.find((c) => c.padrao)?.nome ?? canais[0]?.nome ?? "Presencial", centroCusto: "", introducao: "", situacaoId: padrao.id, produtos: [], servicos: [],
    transportadoraId: "", transportadoraNome: "", frete: "0,00", mostrarEntrega: false, enderecoEntregaId: "", desconto: "", descontoPct: false, exibirTotal: true,
    gerarCondicoes: true, condicao: "AVISTA", formaPagamentoId: "", vencimento: hoje(), intervaloDias: "30", numParcelas: "2", primeiraParcela: hoje(), parcelas: [],
    observacoes: cfg.observacoes, observacaoInterna: "", camposExtras: {}, proximoNumero: proximo, anexos: [],
  };
  if (!id && clienteId) {
    const c = await prisma.pessoa.findUnique({ where: { id: clienteId }, select: { id: true, nome: true } });
    if (c) inicial = { ...inicial, clienteId: c.id, clienteNome: c.nome };
  }
  if (id) {
    const v = await prisma.venda.findUnique({
      where: { id },
      include: {
        cliente: { select: { nome: true } }, transportadora: { select: { nome: true } }, parcelas: { orderBy: { numero: "asc" } }, situacaoCfg: true,
        itens: { orderBy: { ordem: "asc" }, include: { produto: { select: { nome: true, codigo: true, unidade: true, valores: { where: { ativo: true }, select: { tipoValorId: true, valor: true } } } } } },
        servicos: { orderBy: { ordem: "asc" }, include: { servico: { select: { nome: true, codigo: true } } } },
      },
    });
    if (!v) notFound();
    const anexos = await prisma.anexo.findMany({ where: { entidade: "VENDA", entidadeId: id }, select: { id: true, nome: true } });
    const pct = v.descontoPercentual != null;
    inicial = {
      id, tipo: v.tipo === "SERVICO" ? "SERVICO" : "PRODUTO", numero: String(v.numero), clienteId: v.clienteId ?? "", clienteNome: v.cliente?.nome ?? "", data: isoSP(v.data), validade: "",
      vendedorId: v.vendedorId ?? "", prazoEntrega: iso(v.prazoEntrega), aosCuidados: "", canal: v.canal, centroCusto: v.centroCusto ?? "", introducao: "", situacaoId: v.situacaoId ?? padrao.id,
      produtos: v.itens.map((l) => ({ id: l.id, produtoId: l.produtoId, avulso: !!l.descricao, nome: l.descricao ?? l.produto.nome, codigo: l.produto.codigo, unidade: l.produto.unidade, detalhes: l.detalhes ?? "",
        quantidade: qt(l.quantidade), tipoValorId: l.tipoValorId ?? tiposValor[0]?.id ?? "", valorUnit: n2(l.valorUnit), desconto: Number(l.desconto) ? n2(l.desconto) : "", descontoPct: false,
        valores: l.produto.valores.map((x) => ({ tipoValorId: x.tipoValorId, valor: Number(x.valor) })) })),
      servicos: v.servicos.map((l) => ({ id: l.id, servicoId: l.servicoId, nome: l.servico.nome, codigo: l.servico.codigo, detalhes: l.detalhes ?? "",
        quantidade: qt(l.quantidade), valorUnit: n2(l.valorUnit), desconto: Number(l.desconto) ? n2(l.desconto) : "", descontoPct: false })),
      transportadoraId: v.transportadoraId ?? "", transportadoraNome: v.transportadora?.nome ?? "", frete: n2(v.frete), mostrarEntrega: v.mostrarEntrega, enderecoEntregaId: v.enderecoEntregaId ?? "",
      freteServicoId: v.freteServicoId ? String(v.freteServicoId) : "", freteServicoNome: v.freteServicoNome ?? "", fretePrazoDias: v.fretePrazoDias ? String(v.fretePrazoDias) : "",
      desconto: pct ? qt(v.descontoPercentual) : Number(v.desconto) ? n2(v.desconto) : "", descontoPct: pct, exibirTotal: true,
      gerarCondicoes: true, condicao: v.condicao === "PARCELADO" ? "PARCELADO" : "AVISTA", formaPagamentoId: v.formaPagamentoId ?? "",
      vencimento: iso(v.parcelas[0]?.vencimento) || isoSP(v.data), intervaloDias: String(v.intervaloDias), numParcelas: String(Math.max(2, v.parcelas.length)),
      primeiraParcela: iso(v.parcelas[0]?.vencimento) || isoSP(v.data),
      parcelas: v.parcelas.map((p) => ({ vencimento: iso(p.vencimento), valor: n2(p.valor), formaPagamentoId: p.formaPagamentoId ?? "", observacao: p.observacao ?? "" })),
      observacoes: v.observacoes ?? "", observacaoInterna: v.observacaoInterna ?? "", camposExtras: (v.camposExtras ?? {}) as Record<string, string>,
      proximoNumero: proximo, anexos,
    };
  }
  const tl = inicial.tipo === "SERVICO" ? "SERVICO" : "PEDIDO";
  const acao = id ? "Editar" : "Adicionar";
  return (
    <Pagina titulo={`${acao} venda`} trilha={[{ rotulo: tituloVendas(tl), href: baseVendas(tl) }, { rotulo: acao }]}>
      <FormOrcamento inicial={inicial} modo="venda"
        op={{ vendedores, situacoes: situacoes.map((s) => ({ id: s.id, nome: `${s.nome} (${avisoSituacao(s)})` })), formas, tiposValor, campos, centros: centros.map((c) => c.centroCusto!), canais: canalLista(canais.map((c) => c.nome), inicial.canal), freteMelhorEnvio: await freteAtivo() }}
        vis={{
          dados: colunasVisiveis(u?.preferencias, "venda-campos", CAMPOS_VENDA, CAMPOS_VENDA.map((c) => c.chave)),
          itens: colunasVisiveis(u?.preferencias, "venda-itens", COLUNAS_ITENS, COLUNAS_ITENS.map((c) => c.chave)),
        }} />
    </Pagina>
  );
}
