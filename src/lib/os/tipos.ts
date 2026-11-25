/** Tipos e regras da OS que também rodam no navegador (sem banco). */
import { lerNumero, totais, type DadosOrcamento } from "@/lib/orcamentos/tipos";

export type EquipamentoForm = {
  equipamento: string; marca: string; modelo: string; serie: string; condicoes: string; defeitos: string;
  acessorios: string; solucao: string; laudo: string; garantia: string;
};
export const equipamentoVazio = (garantia = ""): EquipamentoForm => ({ equipamento: "", marca: "", modelo: "", serie: "", condicoes: "", defeitos: "", acessorios: "", solucao: "", laudo: "", garantia });

/** OS = pedido (mesmos blocos de produtos, serviços, entrega, pagamento) + dados próprios. */
export type DadosOs = DadosOrcamento & {
  entrada: string; // YYYY-MM-DDTHH:mm (Brasília)
  saida: string;
  prioridade: string;
  tecnicoIds: string[];
  /** equipe de técnicos (opcional): todos os membros podem lançar itens pela tela do técnico */
  equipeId?: string;
  /** agendamento da visita (YYYY-MM-DDTHH:mm, Brasília) e duração em minutos: Agenda das equipes e Google Agenda */
  agendaInicio?: string;
  agendaDuracao?: string;
  equipamentos: EquipamentoForm[];
  outros: string;
  /** empresa que fatura os serviços (NFS-e e conta a receber dela); vazio = a própria empresa da OS */
  empresaServicosId?: string;
};

/** Durações do agendamento da OS (minutos). */
export const DURACOES_AGENDA: [number, string][] = [[30, "30 min"], [60, "1 hora"], [90, "1h30"], [120, "2 horas"], [180, "3 horas"], [240, "4 horas"], [360, "6 horas"], [480, "Dia todo (8h)"]];

export const PRIORIDADES: [string, string][] = [["BAIXA", "Baixa"], ["MEDIA", "Média"], ["ALTA", "Alta"], ["URGENTE", "Urgente"], ["MUITO_URGENTE", "Muito urgente"]];
export const rotuloPrioridade = (p?: string | null) => PRIORIDADES.find(([v]) => v === p)?.[1] ?? "";

const arred = (v: number) => Math.round(v * 100) / 100;
/** Totais da OS: Mão de obra (serviços), Peças (produtos), Frete, Outros, Desconto e Valor total. */
export function totaisOs(d: Pick<DadosOs, "produtos" | "servicos" | "desconto" | "descontoPct" | "frete" | "outros">) {
  const t = totais(d);
  const outros = lerNumero(d.outros) ?? 0;
  return { ...t, outros, total: arred(t.total + outros) };
}

export const CAMPOS_OS = [
  { chave: "numero", rotulo: "Número" }, { chave: "saida", rotulo: "Saída" }, { chave: "canal", rotulo: "Canal de venda" },
  { chave: "centro", rotulo: "Centro de custo" }, { chave: "prioridade", rotulo: "Prioridade" },
];

/** "2026-11-16T14:30" em Brasília ↔ Date. */
export const isoLocalSP = (d: Date | null | undefined) =>
  d ? new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 16) : "";
export const dataLocalSP = (s: string) => (s && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) ? new Date(`${s.slice(0, 16)}:00-03:00`) : null);

/** Aviso no seletor de situação: o que cada uma faz com estoque, financeiro e saída. */
export const avisoSituacaoOs = (s: { estoque: string; financeiro: boolean; preencherSaida?: boolean }) =>
  [s.estoque === "RESERVAR" ? "reserva as peças" : s.estoque === "LANCAR" ? (s.financeiro ? "baixa as peças e lança o financeiro" : "baixa as peças") : "libera as peças", s.preencherSaida ? "preenche a saída" : ""].filter(Boolean).join(", ");
