import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { colunasVisiveis } from "@/lib/ui/colunas";
import { proximoNumeroOs, situacaoPadraoOs } from "@/lib/os/ordens";
import { configOs } from "@/lib/os/config";
import { Pagina } from "@/components/ui/Pagina";
import FormOrcamento, { type InicialOrcamento } from "@/components/orcamentos/FormOrcamento";
import { canalLista } from "@/components/orcamentos/PaginaFormOrcamento";
import { COLUNAS_ITENS } from "@/lib/orcamentos/tipos";
import { avisoSituacaoOs, CAMPOS_OS, isoLocalSP } from "@/lib/os/tipos";

const n2 = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qt = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Formulário "Adicionar/Editar OS" no padrão do Gestão Click (o mesmo pedido, com equipamentos e responsáveis). */
export default async function PaginaFormOs({ id, clienteId }: { id?: string; clienteId?: string }) {
  const u = await usuarioAtual();
  const [usuarios, situacoes, formas, tiposValor, campos, centros, proximo, cfg, canais, padrao, equipes] = await Promise.all([
    prisma.usuario.findMany({ where: { ativo: true }, select: { id: true, nome: true, papel: true, tecnico: true }, orderBy: { nome: "asc" } }),
    prisma.situacaoOsConfig.findMany({ orderBy: { ordem: "asc" } }),
    prisma.formaPagamento.findMany({ where: { ativa: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.tipoValor.findMany({ orderBy: [{ padrao: "desc" }, { nome: "asc" }], select: { id: true, nome: true, padrao: true } }),
    prisma.campoExtra.findMany({ where: { entidade: "OS" }, orderBy: [{ ordem: "asc" }, { nome: "asc" }], select: { id: true, nome: true } }),
    prisma.ordemServico.findMany({ where: { centroCusto: { not: null } }, distinct: ["centroCusto"], select: { centroCusto: true } }),
    proximoNumeroOs(),
    configOs(),
    prisma.canalVenda.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }] }),
    situacaoPadraoOs(),
    prisma.equipe.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
  ]);
  const agora = isoLocalSP(new Date());
  let inicial: InicialOrcamento = {
    tipo: "SERVICO", numero: "", clienteId: "", clienteNome: "", data: hoje(), validade: "", vendedorId: u?.id ?? "", prazoEntrega: "",
    aosCuidados: "", canal: canais.find((c) => c.padrao)?.nome ?? canais[0]?.nome ?? "Presencial", centroCusto: "", introducao: "", situacaoId: padrao.id, produtos: [], servicos: [],
    transportadoraId: "", transportadoraNome: "", frete: "0,00", mostrarEntrega: false, enderecoEntregaId: "", desconto: "", descontoPct: false, exibirTotal: true,
    gerarCondicoes: true, condicao: "AVISTA", formaPagamentoId: "", vencimento: "", intervaloDias: "30", numParcelas: "2", primeiraParcela: hoje(), parcelas: [],
    observacoes: cfg.observacoes, observacaoInterna: "", camposExtras: {}, proximoNumero: proximo, anexos: [],
    entrada: agora, saida: "", prioridade: "", tecnicoIds: u?.papel === "TECNICO" ? [u.id] : [""], outros: "0,00",
    equipamentos: [{ equipamento: "", marca: "", modelo: "", serie: "", condicoes: "", defeitos: "", acessorios: "", solucao: "", laudo: "", garantia: cfg.garantia }],
  };
  if (!id && clienteId) {
    const c = await prisma.pessoa.findUnique({ where: { id: clienteId }, select: { id: true, nome: true } });
    if (c) inicial = { ...inicial, clienteId: c.id, clienteNome: c.nome };
  }
  if (id) {
    const o = await prisma.ordemServico.findUnique({
      where: { id },
      include: {
        cliente: { select: { nome: true } }, transportadora: { select: { nome: true } }, parcelas: { orderBy: { numero: "asc" } }, equipamentos: { orderBy: { ordem: "asc" } },
        produtos: { orderBy: [{ ordem: "asc" }, { createdAt: "asc" }], include: { produto: { select: { nome: true, codigo: true, unidade: true, valores: { where: { ativo: true }, select: { tipoValorId: true, valor: true } } } } } },
        servicos: { orderBy: [{ ordem: "asc" }, { createdAt: "asc" }], include: { servico: { select: { nome: true, codigo: true } } } },
      },
    });
    if (!o) notFound();
    const anexos = await prisma.anexo.findMany({ where: { entidade: "OS", entidadeId: id }, select: { id: true, nome: true } });
    const pct = o.descontoPercentual != null;
    const s = (v: string | null) => v ?? "";
    inicial = {
      id, tipo: "SERVICO", numero: String(o.numero), clienteId: o.clienteId, clienteNome: o.cliente.nome, data: hoje(), validade: "",
      vendedorId: o.vendedorId ?? "", prazoEntrega: "", aosCuidados: "", canal: o.canal, centroCusto: o.centroCusto ?? "", introducao: "", situacaoId: o.situacaoId ?? padrao.id,
      produtos: o.produtos.map((l) => ({ id: l.id, produtoId: l.produtoId, nome: l.produto.nome, codigo: l.produto.codigo, unidade: l.produto.unidade, detalhes: l.detalhes ?? "",
        quantidade: qt(l.quantidade), tipoValorId: l.tipoValorId ?? tiposValor[0]?.id ?? "", valorUnit: n2(l.valorUnit), desconto: Number(l.desconto) ? n2(l.desconto) : "", descontoPct: false,
        valores: l.produto.valores.map((x) => ({ tipoValorId: x.tipoValorId, valor: Number(x.valor) })) })),
      servicos: o.servicos.map((l) => ({ id: l.id, servicoId: l.servicoId, nome: l.servico.nome, codigo: l.servico.codigo, detalhes: l.detalhes ?? "",
        quantidade: qt(l.quantidade), valorUnit: n2(l.valorUnit), desconto: Number(l.desconto) ? n2(l.desconto) : "", descontoPct: false })),
      transportadoraId: o.transportadoraId ?? "", transportadoraNome: o.transportadora?.nome ?? "", frete: n2(o.frete), mostrarEntrega: o.mostrarEntrega, enderecoEntregaId: o.enderecoEntregaId ?? "",
      desconto: pct ? qt(o.descontoPercentual) : Number(o.desconto) ? n2(o.desconto) : "", descontoPct: pct, exibirTotal: o.exibirTotal,
      gerarCondicoes: true, condicao: o.condicao === "PARCELADO" ? "PARCELADO" : "AVISTA", formaPagamentoId: o.formaPagamentoId ?? "",
      vencimento: iso(o.parcelas[0]?.vencimento), intervaloDias: String(o.intervaloDias), numParcelas: String(Math.max(2, o.parcelas.length)),
      primeiraParcela: iso(o.parcelas[0]?.vencimento) || hoje(),
      parcelas: o.parcelas.map((p) => ({ vencimento: iso(p.vencimento), valor: n2(p.valor), formaPagamentoId: p.formaPagamentoId ?? "", observacao: p.observacao ?? "" })),
      observacoes: o.observacoes ?? "", observacaoInterna: o.observacaoInterna ?? "", camposExtras: (o.camposExtras ?? {}) as Record<string, string>,
      proximoNumero: proximo, anexos,
      entrada: isoLocalSP(o.entrada), saida: isoLocalSP(o.saida), prioridade: o.prioridade ?? "", tecnicoIds: o.tecnicoIds.length ? o.tecnicoIds : [o.tecnicoId ?? ""], equipeId: o.equipeId ?? "", outros: n2(o.outros),
      equipamentos: o.equipamentos.map((e) => ({ equipamento: e.equipamento, marca: s(e.marca), modelo: s(e.modelo), serie: s(e.serie), condicoes: s(e.condicoes), defeitos: s(e.defeitos), acessorios: s(e.acessorios), solucao: s(e.solucao), laudo: s(e.laudo), garantia: s(e.garantia) })),
    };
  }
  const acao = id ? "Editar" : "Adicionar";
  const tecnicos = usuarios.filter((x) => x.tecnico || x.papel === "TECNICO");
  return (
    <Pagina titulo={`${acao} OS`} trilha={[{ rotulo: "Ordens de serviços", href: "/os" }, { rotulo: acao }]}>
      <FormOrcamento inicial={inicial} modo="os"
        op={{ vendedores: usuarios, tecnicos: tecnicos.length ? tecnicos : usuarios, equipes, situacoes: situacoes.map((s) => ({ id: s.id, nome: `${s.nome} (${avisoSituacaoOs(s)})` })), formas, tiposValor, campos,
          centros: centros.map((c) => c.centroCusto!), canais: canalLista(canais.map((c) => c.nome), inicial.canal) }}
        vis={{
          dados: colunasVisiveis(u?.preferencias, "os-campos", CAMPOS_OS, CAMPOS_OS.map((c) => c.chave)),
          itens: colunasVisiveis(u?.preferencias, "os-itens", COLUNAS_ITENS, COLUNAS_ITENS.map((c) => c.chave)),
        }} />
    </Pagina>
  );
}
