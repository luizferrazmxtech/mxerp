/**
 * Taxas das formas de pagamento (cartão). Roda no navegador e no servidor (sem banco).
 *
 * Cada forma de cartão guarda uma tabela (FormaPagamento.taxas) com grupos de bandeiras, como a maquininha mostra:
 * "Visa e Mastercard, na hora", "Diners, em 30 dias" e "Demais bandeiras, na hora". No crédito, a taxa de cada
 * nº de vezes é a soma de duas, como no simulador da PagSeguro:
 *  - intermediação (a do plano: 3,05% à vista, 2,75% de 2x a 6x, 2,85% de 7x a 12x);
 *  - parcelamento (a antecipação das parcelas, paga pelo lojista): 1 − (1/n)·Σ 1/(1+j)^i, com j = 1,71% ao mês.
 *    Ex.: 12x = 2,85% + 10,28% = 13,13% → de R$ 100,00 recebe R$ 86,87 na hora.
 * Cada célula é editável; "Recalcular parcelamento" refaz a linha pela fórmula.
 *
 * Na venda: forma + bandeira + nº de vezes → taxa (%), valor da taxa, líquido e data em que cai.
 * Forma sem tabela (PIX, boleto…) usa a taxa fixa da forma (FormaPagamento.taxa), que pode ser 0.
 */

export const BANDEIRAS = [
  "Visa", "Mastercard", "Elo", "Hipercard", "American Express", "Diners", "Aura", "Brasilcard", "Verdcard", "Cabal", "Sorocred", "Banescard", "Outras",
] as const;

export const MAX_VEZES = 12;

export type GrupoBandeiras = {
  nome: string;
  bandeiras: string[];
  /** dias até o crédito cair na conta (0 = na hora, com antecipação) */
  prazoCredito: number;
  prazoDebito: number;
  /** % do débito; null = sem débito neste grupo (usa o do primeiro grupo que tiver) */
  debito: number | null;
  /** % de intermediação em 1x, 2x … 12x (índice 0 = 1x); null = não aceita nessa quantidade de vezes */
  intermediacao: (number | null)[];
  /** % de parcelamento (antecipação) em 1x … 12x; null = 0 */
  parcelamento: (number | null)[];
};

export type TabelaTaxas = {
  grupos: GrupoBandeiras[];
  /** juros de antecipação ao mês (pagos pelo lojista), usados em "Recalcular parcelamento" */
  acrescimoMes?: number | null;
};

const r2 = (n: number) => Math.round(n * 100 + 1e-9) / 100;

/** Parcelamento (antecipação) em % para n vezes: 1 − (1/n)·Σ 1/(1+j)^i. 1x = 0. */
export function parcelamentoPadrao(n: number, jurosMes = 1.71) {
  if (n <= 1 || !(jurosMes > 0)) return 0;
  let s = 0;
  for (let i = 1; i <= n; i++) s += 1 / Math.pow(1 + jurosMes / 100, i);
  return r2((1 - s / n) * 100);
}
export const colunaParcelamento = (jurosMes = 1.71) => Array.from({ length: MAX_VEZES }, (_, k) => parcelamentoPadrao(k + 1, jurosMes));

/** Intermediação de 1x a 12x a partir das três faixas do plano. */
export const colunaIntermediacao = (aVista: number, ate6x: number, ate12x: number) =>
  Array.from({ length: MAX_VEZES }, (_, k) => (k === 0 ? aVista : k < 6 ? ate6x : ate12x));

/** Parcelamento do simulador da PagSeguro em 24/11/2026 (1,71% a.m.); a fórmula dá 0,01 a menos em 3x e 7x. */
const PARCELAMENTO_PAGSEGURO = [0, 2.51, 3.33, 4.13, 4.93, 5.72, 6.51, 7.28, 8.04, 8.8, 9.54, 10.28];

/** Taxas da PagSeguro (PagBank) da conta do Luiz em 24/11/2026, conferidas no simulador da maquininha. Débito só é conhecido na Visa/Master. */
export const TAXAS_PAGSEGURO: TabelaTaxas = {
  grupos: [
    {
      nome: "Visa e Mastercard (na hora)", bandeiras: ["Visa", "Mastercard"], prazoCredito: 0, prazoDebito: 0, debito: 1.55,
      intermediacao: colunaIntermediacao(3.05, 2.75, 2.85), parcelamento: [...PARCELAMENTO_PAGSEGURO],
    },
    {
      nome: "Diners (30 dias)", bandeiras: ["Diners"], prazoCredito: 30, prazoDebito: 1, debito: null,
      intermediacao: colunaIntermediacao(3.19, 3.79, 3.79), parcelamento: [...PARCELAMENTO_PAGSEGURO],
    },
    {
      nome: "Demais bandeiras (na hora)", bandeiras: ["Elo", "Hipercard", "American Express", "Aura", "Brasilcard", "Verdcard", "Cabal", "Sorocred", "Banescard", "Outras"],
      prazoCredito: 0, prazoDebito: 0, debito: null,
      intermediacao: colunaIntermediacao(4.75, 4.25, 4.35), parcelamento: [...PARCELAMENTO_PAGSEGURO],
    },
  ],
  acrescimoMes: 1.71,
};

export type TipoCartao = "CREDITO" | "DEBITO";
/** Pelo código do meio de pagamento da NF-e: 03 crédito, 04 débito. */
export const tipoCartao = (tPag: string | null | undefined): TipoCartao | null => (tPag === "03" ? "CREDITO" : tPag === "04" ? "DEBITO" : null);

const numOuNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n < 100 ? Math.round(n * 10000) / 10000 : null;
};
const inteiro = (v: unknown, padrao: number) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 365 ? n : padrao;
};

/** Lê (e limpa) o JSON guardado na forma. Qualquer coisa estranha vira tabela vazia. */
export function lerTabela(v: unknown): TabelaTaxas {
  const o = (v && typeof v === "object" ? v : {}) as Partial<TabelaTaxas>;
  const grupos = Array.isArray(o.grupos) ? o.grupos : [];
  return {
    grupos: grupos.filter((g) => g && typeof g === "object").map((g, i) => ({
      nome: String(g.nome ?? "").trim() || `Grupo ${i + 1}`,
      bandeiras: Array.isArray(g.bandeiras) ? [...new Set(g.bandeiras.map((b) => String(b).trim()).filter(Boolean))] : [],
      prazoCredito: inteiro(g.prazoCredito, 30),
      prazoDebito: inteiro(g.prazoDebito, 1),
      debito: numOuNull(g.debito),
      intermediacao: Array.from({ length: MAX_VEZES }, (_, k) => numOuNull(Array.isArray(g.intermediacao) ? g.intermediacao[k] : null)),
      parcelamento: Array.from({ length: MAX_VEZES }, (_, k) => numOuNull(Array.isArray(g.parcelamento) ? g.parcelamento[k] : null)),
    })),
    acrescimoMes: numOuNull(o.acrescimoMes),
  };
}

export const temTabela = (v: unknown) => lerTabela(v).grupos.length > 0;

/** Grupo da bandeira: o que a lista; senão o que tem "Outras"; senão o primeiro. */
export function grupoDaBandeira(tab: TabelaTaxas, bandeira?: string | null): GrupoBandeiras | null {
  if (!tab.grupos.length) return null;
  const b = (bandeira ?? "").trim().toLowerCase();
  return (b && tab.grupos.find((g) => g.bandeiras.some((x) => x.toLowerCase() === b)))
    || (b && tab.grupos.find((g) => g.bandeiras.some((x) => x.toLowerCase() === "outras")))
    || tab.grupos[0];
}

/** Maior nº de vezes que a tabela aceita (para o select da venda). */
export function maxVezes(v: unknown, bandeira?: string | null) {
  const g = grupoDaBandeira(lerTabela(v), bandeira);
  if (!g) return MAX_VEZES;
  let m = 1;
  g.intermediacao.forEach((x, i) => { if (x !== null) m = i + 1; });
  return m;
}

export type FormaComTaxa = { tPag: string; taxa: number | string | { toString(): string }; diasPrazo?: number; taxas?: unknown };

/** Taxa total do crédito em n vezes no grupo (intermediação + parcelamento); null = não aceita. */
export function taxaCredito(g: GrupoBandeiras, n: number): number | null {
  const i = g.intermediacao[n - 1];
  return i === null || i === undefined ? null : r2(i + (g.parcelamento[n - 1] ?? 0));
}

export type CalculoTaxa = {
  /** % aplicado (no crédito, intermediação + parcelamento) */
  percentual: number;
  intermediacao: number;
  parcelamento: number;
  /** valor da taxa em reais (arredondado em centavos) */
  taxa: number;
  liquido: number;
  /** dias até cair na conta; null = forma sem tabela (segue o prazo da forma) */
  prazoDias: number | null;
  grupo: string | null;
  bandeira: string | null;
  vezes: number;
  /** "Crédito 3x Visa" — vai na observação da conta */
  rotulo: string;
};

const arred = (n: number) => Math.round(n * 100) / 100;

/**
 * Taxa de um pagamento. Cartão com tabela: pela bandeira e vezes (sem bandeira, o primeiro grupo; vezes fora da
 * tabela, a maior que ela aceita). Sem tabela: a taxa fixa da forma.
 */
export function calcularTaxa(forma: FormaComTaxa, valor: number, bandeira?: string | null, vezes?: number | null): CalculoTaxa {
  const tipo = tipoCartao(forma.tPag);
  const tab = lerTabela(forma.taxas);
  const g = tipo ? grupoDaBandeira(tab, bandeira) : null;
  const bnd = (bandeira ?? "").trim() || null;
  let pct = Number(String(forma.taxa ?? 0)) || 0;
  let parc = 0;
  let prazo: number | null = null;
  let n = Math.max(1, Math.trunc(vezes ?? 1) || 1);
  if (g && tipo === "DEBITO") {
    n = 1;
    pct = g.debito ?? tab.grupos.find((x) => x.debito !== null)?.debito ?? pct;
    prazo = g.prazoDebito;
  } else if (g && tipo === "CREDITO") {
    n = Math.min(n, maxVezes(tab, bnd));
    const i = g.intermediacao[n - 1];
    if (i !== null && i !== undefined) { parc = g.parcelamento[n - 1] ?? 0; pct = r2(i + parc); }
    prazo = g.prazoCredito;
  } else n = tipo === "CREDITO" ? n : 1;
  // como a PagSeguro: cada taxa em centavos (de R$ 100,00 em 2x: R$ 2,75 + R$ 2,51)
  const v = Math.max(0, valor);
  const taxa = arred(arred(v * (pct - parc) / 100) + arred(v * parc / 100));
  const rotulo = tipo === "CREDITO" ? `Crédito ${n}x${bnd ? ` ${bnd}` : ""}` : tipo === "DEBITO" ? `Débito${bnd ? ` ${bnd}` : ""}` : "";
  return { percentual: pct, intermediacao: r2(pct - parc), parcelamento: parc, taxa, liquido: arred(valor - taxa), prazoDias: prazo, grupo: g?.nome ?? null, bandeira: bnd, vezes: n, rotulo };
}

export const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`);

/** Bandeira e vezes digitadas no formulário → colunas da parcela (vazio = null). */
export function cartao(bandeira?: string | null, vezes?: string | number | null) {
  const b = (bandeira ?? "").trim();
  const v = Math.trunc(Number(vezes));
  return { bandeira: b || null, vezes: Number.isFinite(v) && v >= 1 ? Math.min(v, MAX_VEZES) : null };
}
