/**
 * Decide de quais locais (prateleiras) uma quantidade será reservada.
 * Função pura: recebe o disponível por local e devolve as alocações.
 *
 * Regra: primeiro o local padrão do produto; depois os locais com mais
 * disponível (menos viagens para separar). O que não couber vira "falta".
 */
export type DisponivelLocal = { localId: string; disponivel: number };
export type Alocacao = { localId: string | null; quantidade: number };

const EPS = 1e-9;
export const arred = (n: number) => Math.round(n * 10000) / 10000;

export function alocar(
  quantidade: number,
  locais: DisponivelLocal[],
  localPadraoId?: string | null,
): Alocacao[] {
  if (!(quantidade > 0)) throw new Error("Quantidade deve ser maior que zero");
  const ordenados = [...locais]
    .filter((l) => l.disponivel > EPS)
    .sort((a, b) => {
      if (a.localId === localPadraoId) return -1;
      if (b.localId === localPadraoId) return 1;
      return b.disponivel - a.disponivel || a.localId.localeCompare(b.localId);
    });

  const out: Alocacao[] = [];
  let resta = arred(quantidade);
  for (const l of ordenados) {
    if (resta <= EPS) break;
    const q = arred(Math.min(resta, l.disponivel));
    out.push({ localId: l.localId, quantidade: q });
    resta = arred(resta - q);
  }
  if (resta > EPS) out.push({ localId: null, quantidade: resta });
  return out;
}
