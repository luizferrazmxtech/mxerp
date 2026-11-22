/** Filtros favoritos dos relatórios (guardados em Usuario.preferencias.favoritosRelatorios). Sem banco: testável. */
export type Favorito = { nome: string; url: string };

/** Só endereços internos de relatório/financeiro (nada de link externo) e um nome curto. */
export function normalizarFavorito(nome: string, url: string): Favorito {
  const n = nome.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!n) throw new Error("Dê um nome ao filtro");
  const u = url.trim();
  if (!/^\/(relatorios|financeiro\/dre|financeiro\/fluxo)(\/[\w-]+)*(\?[^#\s]*)?$/.test(u)) throw new Error("Endereço de relatório inválido");
  return { nome: n, url: u };
}

export function favoritosDe(preferencias: unknown): Favorito[] {
  const l = (preferencias as { favoritosRelatorios?: unknown } | null)?.favoritosRelatorios;
  return Array.isArray(l) ? l.filter((x): x is Favorito => typeof x?.nome === "string" && typeof x?.url === "string") : [];
}
