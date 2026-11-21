/** Constantes dos marketplaces que as telas ("use client") também usam: sem prisma aqui. */
export const CANAL_ML = "MERCADO_LIVRE";

export type EtapaPedido = "AGUARDANDO_PAGAMENTO" | "SEM_VINCULO" | "GERANDO" | "AGUARDANDO_LIBERACAO" | "LIBERADO" | "CANCELADO" | "IGNORADO" | "ERRO";

export const ETAPAS: Record<EtapaPedido, { rotulo: string; pilula: string }> = {
  AGUARDANDO_PAGAMENTO: { rotulo: "Aguardando pagamento", pilula: "border-slate-300 bg-slate-50 text-slate-700" },
  SEM_VINCULO: { rotulo: "Falta ligar o produto", pilula: "border-amber-300 bg-amber-50 text-amber-800" },
  GERANDO: { rotulo: "Gerando a venda", pilula: "border-sky-300 bg-sky-50 text-sky-700" },
  AGUARDANDO_LIBERACAO: { rotulo: "Aguardando liberação", pilula: "border-sky-300 bg-sky-50 text-sky-700" },
  LIBERADO: { rotulo: "Recebido", pilula: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  CANCELADO: { rotulo: "Cancelado", pilula: "border-red-300 bg-red-50 text-red-700" },
  IGNORADO: { rotulo: "Antes da integração", pilula: "border-slate-300 bg-slate-50 text-slate-500" },
  ERRO: { rotulo: "Com erro", pilula: "border-red-300 bg-red-50 text-red-700" },
};
export const etapa = (e: string) => ETAPAS[e as EtapaPedido] ?? { rotulo: e, pilula: "border-slate-300 bg-slate-50 text-slate-700" };
