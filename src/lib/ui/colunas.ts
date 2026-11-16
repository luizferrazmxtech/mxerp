/** Colunas visíveis de uma lista para o usuário (preferência salva) ou as padrão. */
export function colunasVisiveis(preferencias: unknown, lista: string, todas: { chave: string }[], padrao: string[]) {
  const salvas = (preferencias as { colunas?: Record<string, string[]> } | null)?.colunas?.[lista];
  const validas = salvas?.filter((c) => todas.some((t) => t.chave === c));
  return validas?.length ? validas : padrao;
}
