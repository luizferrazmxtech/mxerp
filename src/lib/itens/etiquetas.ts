/** Medidas de folhas e modelos de etiqueta (sem banco: pode ir para o navegador). Tudo em centímetros. */

export type MedidasEtiqueta = {
  altura: number; largura: number; pagina: string; colunas: number; linhas: number;
  margemSuperior: number; margemLateral: number; distVertical: number; distHorizontal: number;
};

/** Tamanhos de página. "BOBINA" é a impressora térmica: a página tem o tamanho exato da faixa de etiquetas. */
export const PAGINAS: { chave: string; rotulo: string; largura: number | null; altura: number | null }[] = [
  { chave: "A4", rotulo: "A4 – 21,0 X 29,7 cm", largura: 21, altura: 29.7 },
  { chave: "CARTA", rotulo: "Carta – 21,59 X 27,94 cm", largura: 21.59, altura: 27.94 },
  { chave: "OFICIO", rotulo: "Ofício – 21,59 X 35,56 cm", largura: 21.59, altura: 35.56 },
  { chave: "BOBINA", rotulo: "Bobina (impressora térmica)", largura: null, altura: null },
];

const m = (pagina: string, altura: number, largura: number, colunas: number, linhas: number, margemSuperior: number, margemLateral: number, distVertical: number, distHorizontal: number): MedidasEtiqueta =>
  ({ pagina, altura, largura, colunas, linhas, margemSuperior, margemLateral, distVertical, distHorizontal });

/** Modelos prontos mais usados (confira as medidas na caixa da etiqueta). */
export const PADROES_ETIQUETA: { nome: string; medidas: MedidasEtiqueta }[] = [
  { nome: "PIMACO 6180", medidas: m("CARTA", 2.54, 6.67, 3, 10, 1.27, 0.48, 0, 0.31) },
  { nome: "PIMACO 6181", medidas: m("CARTA", 2.54, 10.16, 2, 10, 1.27, 0.4, 0, 0.48) },
  { nome: "PIMACO 6182", medidas: m("CARTA", 3.39, 10.16, 2, 7, 2.12, 0.4, 0, 0.48) },
  { nome: "PIMACO 6183", medidas: m("CARTA", 5.08, 10.16, 2, 5, 1.27, 0.4, 0, 0.48) },
  { nome: "PIMACO 6184", medidas: m("CARTA", 8.47, 10.16, 2, 3, 1.27, 0.4, 0, 0.48) },
  { nome: "PIMACO A4251", medidas: m("A4", 2.12, 3.82, 5, 13, 1.07, 0.45, 0, 0.25) },
  { nome: "PIMACO A4263", medidas: m("A4", 3.81, 9.91, 2, 7, 1.51, 0.46, 0, 0.25) },
  { nome: "Térmica 4 x 2,5 cm (1 coluna)", medidas: m("BOBINA", 2.5, 4, 1, 1, 0, 0, 0.3, 0) },
  { nome: "Térmica gôndola 10 x 3 cm", medidas: m("BOBINA", 3, 10, 1, 1, 0, 0, 0.3, 0) },
  { nome: "Térmica 3 colunas 3,3 x 2,2 cm", medidas: m("BOBINA", 2.2, 3.3, 3, 1, 0, 0.1, 0.3, 0.2) },
];

/** Página pela chave, sem diferenciar maiúsculas ("Carta" = "CARTA"). */
export function paginaDe(chave: string) {
  const c = chave.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return PAGINAS.find((p) => p.chave === c) ?? PAGINAS[0];
}

/** Tamanho real da página (a bobina tem o tamanho de uma linha de etiquetas). */
export function tamanhoPagina(e: MedidasEtiqueta) {
  const p = paginaDe(e.pagina);
  return {
    largura: p.largura ?? e.margemLateral * 2 + e.colunas * e.largura + (e.colunas - 1) * e.distHorizontal,
    altura: p.altura ?? e.margemSuperior * 2 + e.linhas * e.altura + (e.linhas - 1) * e.distVertical,
  };
}
