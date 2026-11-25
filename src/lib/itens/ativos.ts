/** Situação do cadastro nas listas: por padrão só ativos; inativos só quando o usuário escolhe. */
export type SituacaoAtivo = "sim" | "nao" | "todos";

/** Lê o parâmetro ?ativo= (vazio ou desconhecido = só ativos). */
export function situacaoAtivo(v?: string): SituacaoAtivo {
  return v === "nao" || v === "todos" ? v : "sim";
}
