import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { colunasVisiveis } from "@/lib/ui/colunas";
import { proximoNumeroOrcamento } from "@/lib/orcamentos/orcamentos";
import { configOrcamento } from "@/lib/orcamentos/config";
import { Pagina } from "@/components/ui/Pagina";
import FormOrcamento, { type InicialOrcamento } from "./FormOrcamento";
import { CAMPOS_DADOS, COLUNAS_ITENS } from "@/lib/orcamentos/tipos";

const n2 = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qt = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export default async function PaginaFormOrcamento({ tipo, id }: { tipo?: "PRODUTO" | "SERVICO"; id?: string }) {
  const u = await usuarioAtual();
  const [vendedores, situacoes, formas, tiposValor, campos, centros, proximo, cfg] = await Promise.all([
    prisma.usuario.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.situacaoOrcamento.findMany({ orderBy: { ordem: "asc" }, select: { id: true, nome: true } }),
    prisma.formaPagamento.findMany({ where: { ativa: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.tipoValor.findMany({ orderBy: [{ padrao: "desc" }, { nome: "asc" }], select: { id: true, nome: true, padrao: true } }),
    prisma.campoExtra.findMany({ where: { entidade: "ORCAMENTO" }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
    prisma.orcamento.findMany({ where: { centroCusto: { not: null } }, distinct: ["centroCusto"], select: { centroCusto: true } }),
    proximoNumeroOrcamento(),
    configOrcamento(),
  ]);
  let inicial: InicialOrcamento = {
    tipo: tipo ?? "PRODUTO", numero: "", clienteId: "", clienteNome: "", data: hoje(), validade: "", vendedorId: u?.id ?? "", prazoEntrega: "",
    aosCuidados: "", canal: "Presencial", centroCusto: "", introducao: cfg.introducao, situacaoId: "", produtos: [], servicos: [],
    transportadoraId: "", transportadoraNome: "", frete: "0,00", mostrarEntrega: false, enderecoEntregaId: "", desconto: "", descontoPct: false, exibirTotal: true,
    gerarCondicoes: true, condicao: "AVISTA", formaPagamentoId: "", vencimento: hoje(), intervaloDias: "30", numParcelas: "2", primeiraParcela: hoje(), parcelas: [],
    observacoes: cfg.observacoes, observacaoInterna: "", camposExtras: {}, proximoNumero: proximo, anexos: [],
  };
  if (id) {
    const o = await prisma.orcamento.findUnique({
      where: { id },
      include: {
        cliente: { select: { nome: true } }, transportadora: { select: { nome: true } }, parcelas: { orderBy: { numero: "asc" } },
        produtos: { orderBy: { ordem: "asc" }, include: { produto: { select: { nome: true, codigo: true, unidade: true, valores: { where: { ativo: true }, select: { tipoValorId: true, valor: true } } } } } },
        servicos: { orderBy: { ordem: "asc" }, include: { servico: { select: { nome: true, codigo: true } } } },
      },
    });
    if (!o) notFound();
    const anexos = await prisma.anexo.findMany({ where: { entidade: "ORCAMENTO", entidadeId: id }, select: { id: true, nome: true } });
    const pct = o.descontoPercentual != null;
    inicial = {
      id, tipo: o.tipo, numero: String(o.numero), clienteId: o.clienteId, clienteNome: o.cliente.nome, data: iso(o.data), validade: o.validade ?? "",
      vendedorId: o.vendedorId ?? "", prazoEntrega: iso(o.prazoEntrega), aosCuidados: o.aosCuidados ?? "", canal: o.canal, centroCusto: o.centroCusto ?? "",
      introducao: o.introducao ?? "", situacaoId: o.situacaoId,
      produtos: o.produtos.map((l) => ({ id: l.id, produtoId: l.produtoId, nome: l.produto.nome, codigo: l.produto.codigo, unidade: l.produto.unidade, detalhes: l.detalhes ?? "",
        quantidade: qt(l.quantidade), tipoValorId: l.tipoValorId ?? tiposValor[0]?.id ?? "", valorUnit: n2(l.valorUnit), desconto: Number(l.desconto) ? n2(l.desconto) : "", descontoPct: false,
        valores: l.produto.valores.map((v) => ({ tipoValorId: v.tipoValorId, valor: Number(v.valor) })) })),
      servicos: o.servicos.map((l) => ({ id: l.id, servicoId: l.servicoId, nome: l.servico.nome, codigo: l.servico.codigo, detalhes: l.detalhes ?? "",
        quantidade: qt(l.quantidade), valorUnit: n2(l.valorUnit), desconto: Number(l.desconto) ? n2(l.desconto) : "", descontoPct: false })),
      transportadoraId: o.transportadoraId ?? "", transportadoraNome: o.transportadora?.nome ?? "", frete: n2(o.frete), mostrarEntrega: o.mostrarEntrega, enderecoEntregaId: o.enderecoEntregaId ?? "",
      desconto: pct ? qt(o.descontoPercentual) : Number(o.desconto) ? n2(o.desconto) : "", descontoPct: pct, exibirTotal: o.exibirTotal,
      gerarCondicoes: o.gerarCondicoes, condicao: o.condicao === "PARCELADO" ? "PARCELADO" : "AVISTA", formaPagamentoId: o.formaPagamentoId ?? "",
      vencimento: iso(o.parcelas[0]?.vencimento) || iso(o.data), intervaloDias: String(o.intervaloDias), numParcelas: String(Math.max(2, o.parcelas.length)),
      primeiraParcela: iso(o.parcelas[0]?.vencimento) || iso(o.data),
      parcelas: o.parcelas.map((p) => ({ vencimento: iso(p.vencimento), valor: n2(p.valor), formaPagamentoId: p.formaPagamentoId ?? "", observacao: p.observacao ?? "" })),
      observacoes: o.observacoes ?? "", observacaoInterna: o.observacaoInterna ?? "", camposExtras: (o.camposExtras ?? {}) as Record<string, string>,
      proximoNumero: proximo, anexos,
    };
  }
  const t = inicial.tipo === "SERVICO" ? "Orçamentos de serviços" : "Orçamentos de produtos";
  const acao = id ? "Editar" : "Adicionar";
  return (
    <Pagina titulo={`${acao} orçamento`} trilha={[{ rotulo: t, href: inicial.tipo === "SERVICO" ? "/orcamentos/servicos" : "/orcamentos" }, { rotulo: acao }]}>
      <FormOrcamento inicial={inicial}
        op={{ vendedores, situacoes, formas, tiposValor, campos, centros: centros.map((c) => c.centroCusto!) }}
        vis={{
          dados: colunasVisiveis(u?.preferencias, "orcamento-campos", CAMPOS_DADOS, CAMPOS_DADOS.map((c) => c.chave)),
          itens: colunasVisiveis(u?.preferencias, "orcamento-itens", COLUNAS_ITENS, COLUNAS_ITENS.map((c) => c.chave)),
        }} />
    </Pagina>
  );
}
