import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { boletosDisponiveis } from "@/lib/financeiro/boletos";
import { configContratos } from "@/lib/contratos/config";
import { proximoNumeroContrato } from "@/lib/contratos/contratos";
import type { DadosContrato, PeriodicidadeContrato, SituacaoContratoT, TerminoContrato } from "@/lib/contratos/tipos";
import { canalLista } from "@/components/orcamentos/PaginaFormOrcamento";
import { Pagina } from "@/components/ui/Pagina";
import FormContrato from "./FormContrato";

const n2 = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qt = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Página "Adicionar/Editar contrato". */
export default async function PaginaFormContrato({ id, clienteId }: { id?: string; clienteId?: string }) {
  const u = await usuarioAtual();
  const [vendedores, formas, canais, centros, proximo, cfg, interAtivo] = await Promise.all([
    prisma.usuario.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.formaPagamento.findMany({ where: { ativa: true }, select: { id: true, nome: true, boletoInter: true }, orderBy: { nome: "asc" } }),
    prisma.canalVenda.findMany({ orderBy: [{ ordem: "asc" }, { nome: "asc" }] }),
    prisma.contrato.findMany({ where: { centroCusto: { not: null } }, distinct: ["centroCusto"], select: { centroCusto: true } }),
    proximoNumeroContrato(),
    configContratos(),
    boletosDisponiveis(),
  ]);
  const boleto = formas.find((f) => f.boletoInter);
  let inicial: DadosContrato = {
    numero: "", clienteId: "", clienteNome: "", vendedorId: u?.id ?? "", situacao: "ATIVO", canal: canais.find((c) => c.padrao)?.nome ?? canais[0]?.nome ?? "Presencial", centroCusto: "",
    dataInicio: hoje(), periodicidade: "MENSAL", diaVencimento: "10", proximoVencimento: "", termino: "SEM", dataFim: "", totalCobrancas: "",
    servicos: [], desconto: "", descontoPct: false, formaPagamentoId: boleto?.id ?? "", diasAntecedencia: String(cfg.diasAntecedencia), enviarBoleto: true,
    lembrete: cfg.diasLembrete > 0, diasLembrete: String(cfg.diasLembrete), emitirNota: false, emailCobranca: "", observacoes: "", observacaoInterna: "",
  };
  if (!id) {
    const d = new Date(`${hoje()}T00:00:00Z`);
    const venc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + (d.getUTCDate() > 10 ? 1 : 0), 10));
    inicial.proximoVencimento = iso(venc);
  }
  if (!id && clienteId) {
    const c = await prisma.pessoa.findUnique({ where: { id: clienteId }, select: { id: true, nome: true } });
    if (c) inicial = { ...inicial, clienteId: c.id, clienteNome: c.nome };
  }
  if (id) {
    const c = await prisma.contrato.findUnique({ where: { id }, include: { cliente: { select: { nome: true } }, servicos: { orderBy: { ordem: "asc" }, include: { servico: { select: { nome: true, codigo: true } } } } } });
    if (!c) notFound();
    const pct = c.descontoPercentual != null;
    inicial = {
      id, numero: String(c.numero), clienteId: c.clienteId, clienteNome: c.cliente.nome, vendedorId: c.vendedorId ?? "", situacao: c.situacao as SituacaoContratoT, canal: c.canal, centroCusto: c.centroCusto ?? "",
      dataInicio: iso(c.dataInicio), periodicidade: c.periodicidade as PeriodicidadeContrato, diaVencimento: String(c.diaVencimento), proximoVencimento: iso(c.proximoVencimento),
      termino: c.termino as TerminoContrato, dataFim: iso(c.dataFim), totalCobrancas: c.totalCobrancas ? String(c.totalCobrancas) : "",
      servicos: c.servicos.map((l) => ({ id: l.id, servicoId: l.servicoId, nome: l.servico.nome, codigo: l.servico.codigo, detalhes: l.detalhes ?? "", quantidade: qt(l.quantidade), valorUnit: n2(l.valorUnit), desconto: Number(l.desconto) ? n2(l.desconto) : "", descontoPct: false })),
      desconto: pct ? qt(c.descontoPercentual) : Number(c.desconto) ? n2(c.desconto) : "", descontoPct: pct,
      formaPagamentoId: c.formaPagamentoId ?? "", diasAntecedencia: String(c.diasAntecedencia), enviarBoleto: c.enviarBoleto,
      lembrete: c.diasLembrete != null, diasLembrete: String(c.diasLembrete ?? cfg.diasLembrete), emitirNota: c.emitirNota, emailCobranca: c.emailCobranca ?? "",
      observacoes: c.observacoes ?? "", observacaoInterna: c.observacaoInterna ?? "",
    };
  }
  const acao = id ? "Editar" : "Adicionar";
  return (
    <Pagina titulo={`${acao} contrato`} icone="contratos" trilha={[{ rotulo: "Contratos", href: "/contratos" }, { rotulo: acao }]}>
      <FormContrato inicial={inicial} proximoNumero={proximo} interAtivo={interAtivo}
        op={{ vendedores, formas, canais: canalLista(canais.map((c) => c.nome), inicial.canal), centros: centros.map((c) => c.centroCusto!) }} />
    </Pagina>
  );
}
