/** Tipos do frete (Melhor Envio) que os componentes "use client" podem importar (sem prisma). */

export type CotacaoFrete = {
  servicoId: number;
  servico: string; // PAC, SEDEX, .Package…
  transportadora: string; // Correios, Jadlog…
  logo: string | null;
  custo: number; // o que o Melhor Envio cobra pela etiqueta
  valor: number; // o que vai para o cliente (custo + acréscimos da configuração)
  prazoDias: number | null; // prazo já com os dias a mais da configuração
  pacotes: VolumeFrete[];
  erro: string | null; // serviço indisponível para este CEP/pacote
};

export type VolumeFrete = { altura: number; largura: number; comprimento: number; peso: number };

export type ItemCotacao = { produtoId: string; quantidade: number; valor: number };

export const SITUACOES_ENVIO: Record<string, { rotulo: string; cor: string }> = {
  CARRINHO: { rotulo: "No carrinho", cor: "border-slate-300 bg-slate-50 text-slate-700" },
  PAGA: { rotulo: "Paga", cor: "border-sky-300 bg-sky-50 text-sky-700" },
  GERADA: { rotulo: "Etiqueta pronta", cor: "border-amber-300 bg-amber-50 text-amber-800" },
  POSTADA: { rotulo: "Postada", cor: "border-violet-300 bg-violet-50 text-violet-700" },
  ENTREGUE: { rotulo: "Entregue", cor: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  NAO_ENTREGUE: { rotulo: "Não entregue", cor: "border-red-300 bg-red-50 text-red-700" },
  CANCELADA: { rotulo: "Cancelada", cor: "border-slate-300 bg-slate-100 text-slate-500" },
  ERRO: { rotulo: "Com erro", cor: "border-red-300 bg-red-50 text-red-700" },
};

/** Situações em que a etiqueta ainda está andando (o agendador consulta o rastreio). */
export const ENVIO_EM_ANDAMENTO = ["PAGA", "GERADA", "POSTADA"];

export const linkRastreio = (e: { rastreio?: string | null; rastreioMe?: string | null }) => {
  const c = e.rastreioMe || e.rastreio;
  return c ? `https://www.melhorrastreio.com.br/rastreio/${encodeURIComponent(c)}` : null;
};
