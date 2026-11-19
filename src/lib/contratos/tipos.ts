/** Tipos e regras de contratos que também rodam no navegador (sem banco). */
import { descontoLinha, lerNumero, subtotalServico, type LinhaServico } from "@/lib/orcamentos/tipos";

export type PeriodicidadeContrato = "MENSAL" | "TRIMESTRAL" | "SEMESTRAL" | "ANUAL";
export type SituacaoContratoT = "EM_ABERTO" | "ATIVO" | "PAUSADO" | "FINALIZADO" | "CANCELADO";
export type TerminoContrato = "SEM" | "DATA" | "VEZES";

export const PERIODICIDADES: { valor: PeriodicidadeContrato; rotulo: string; meses: number }[] = [
  { valor: "MENSAL", rotulo: "Mensal", meses: 1 },
  { valor: "TRIMESTRAL", rotulo: "Trimestral", meses: 3 },
  { valor: "SEMESTRAL", rotulo: "Semestral", meses: 6 },
  { valor: "ANUAL", rotulo: "Anual", meses: 12 },
];
export const mesesDe = (p: PeriodicidadeContrato) => PERIODICIDADES.find((x) => x.valor === p)?.meses ?? 1;
export const rotuloPeriodicidade = (p: PeriodicidadeContrato) => PERIODICIDADES.find((x) => x.valor === p)?.rotulo ?? p;

export const SITUACOES_CONTRATO: { valor: SituacaoContratoT; rotulo: string; cor: string }[] = [
  { valor: "EM_ABERTO", rotulo: "Em aberto", cor: "cinza" },
  { valor: "ATIVO", rotulo: "Ativo", cor: "verde" },
  { valor: "PAUSADO", rotulo: "Pausado", cor: "amarelo" },
  { valor: "FINALIZADO", rotulo: "Finalizado", cor: "azul" },
  { valor: "CANCELADO", rotulo: "Cancelado", cor: "vermelho" },
];
export const situacaoContrato = (s: string) => SITUACOES_CONTRATO.find((x) => x.valor === s) ?? SITUACOES_CONTRATO[0];

export type DadosContrato = {
  id?: string;
  numero: string; clienteId: string; clienteNome: string; vendedorId: string; situacao: SituacaoContratoT; canal: string; centroCusto: string;
  dataInicio: string; periodicidade: PeriodicidadeContrato; diaVencimento: string; proximoVencimento: string;
  termino: TerminoContrato; dataFim: string; totalCobrancas: string;
  servicos: LinhaServico[]; desconto: string; descontoPct: boolean;
  formaPagamentoId: string; diasAntecedencia: string; enviarBoleto: boolean; lembrete: boolean; diasLembrete: string; emitirNota: boolean;
  emailCobranca: string; observacoes: string; observacaoInterna: string;
};

const arred = (v: number) => Math.round(v * 100) / 100;

/** Valor de cada cobrança: soma dos serviços menos o desconto geral (R$ ou %). */
export function totaisContrato(d: Pick<DadosContrato, "servicos" | "desconto" | "descontoPct">) {
  const servicos = arred(d.servicos.reduce((s, l) => s + subtotalServico(l), 0));
  const desconto = descontoLinha(servicos, d.desconto, d.descontoPct);
  return { servicos, desconto, total: arred(servicos - desconto) };
}

const ultimoDia = (a: number, m: number) => new Date(Date.UTC(a, m + 1, 0)).getUTCDate();

/** Data (meia-noite UTC) no mês `a/m` (m de 0 a 11, pode passar de 11) com o dia de vencimento, limitado ao fim do mês. */
export function dataNoMes(a: number, m: number, dia: number) {
  const y = a + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  return new Date(Date.UTC(y, mm, Math.min(Math.max(1, dia), ultimoDia(y, mm))));
}

/** Vencimento seguinte: soma os meses da periodicidade mantendo o dia escolhido (31 vira 30/28 nos meses curtos). */
export function vencimentoSeguinte(atual: Date, p: PeriodicidadeContrato, dia: number) {
  return dataNoMes(atual.getUTCFullYear(), atual.getUTCMonth() + mesesDe(p), dia);
}

/** Primeiro vencimento a partir de uma data (no próprio mês, se o dia ainda não passou; senão no mês seguinte). */
export function primeiroVencimento(desde: Date, dia: number) {
  const v = dataNoMes(desde.getUTCFullYear(), desde.getUTCMonth(), dia);
  return v >= desde ? v : dataNoMes(desde.getUTCFullYear(), desde.getUTCMonth() + 1, dia);
}

const mm = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

/** Período coberto pela cobrança: "12/2026" na mensal, "12/2026 a 02/2027" nas outras. */
export function referencia(venc: Date, p: PeriodicidadeContrato) {
  const meses = mesesDe(p);
  if (meses === 1) return mm(venc);
  const fim = new Date(Date.UTC(venc.getUTCFullYear(), venc.getUTCMonth() + meses - 1, 1));
  return `${mm(venc)} a ${mm(fim)}`;
}

/** Tags aceitas nos textos dos e-mails de cobrança. */
export const TAGS_CONTRATO = ["[nome_cliente]", "[numero_contrato]", "[referencia]", "[valor]", "[vencimento]", "[linha_digitavel]", "[pix_copia_cola]", "[link_boleto]", "[nome_empresa]"];

export const n = (s: string) => lerNumero(s) ?? 0;
