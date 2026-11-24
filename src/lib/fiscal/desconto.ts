/**
 * Desconto geral de um documento com peças e serviços: cada nota leva a sua parte, na proporção dos valores.
 * (Antes a NF-e levava o desconto todo e a NFS-e nenhum: a soma das notas não batia com o cobrado por nota
 * e, com peças baratas e serviço caro, a NF-e ficava negativa.)
 */
export function dividirDesconto(produtos: number, servicos: number, desconto: number) {
  const base = Math.max(0, produtos) + Math.max(0, servicos);
  if (!(desconto > 0) || !(base > 0)) return { produtos: 0, servicos: 0 };
  const dp = Math.round(desconto * (Math.max(0, produtos) / base) * 100) / 100;
  return { produtos: dp, servicos: Math.round((desconto - dp) * 100) / 100 };
}
