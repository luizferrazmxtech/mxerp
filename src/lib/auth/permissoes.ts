import type { PapelUsuario } from "@prisma/client";

/** Quem entra em cada área. O primeiro prefixo que bater vale; o que não está aqui é liberado para todos os logados. */
const REGRAS: { prefixo: string; papeis: PapelUsuario[] }[] = [
  { prefixo: "/usuarios", papeis: ["ADMIN"] },
  { prefixo: "/funcionarios", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/campos-extras", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/valores-venda", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/grupos-produtos", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/unidades", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/grades", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/migracao", papeis: ["ADMIN"] },
  { prefixo: "/financeiro", papeis: ["ADMIN", "GERENTE"] },
  // ver/imprimir uma nota (DANFCE) é de quem vende; a configuração fiscal e a lista ficam com a gerência
  { prefixo: "/fiscal/", papeis: ["ADMIN", "GERENTE", "OPERADOR", "CAIXA"] },
  { prefixo: "/fiscal", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/api/notas", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/pdv", papeis: ["ADMIN", "GERENTE", "OPERADOR", "CAIXA"] },
  { prefixo: "/vendas", papeis: ["ADMIN", "GERENTE", "OPERADOR", "CAIXA"] },
];

export function podeAcessar(papel: PapelUsuario, caminho: string) {
  const r = REGRAS.find((x) => caminho === x.prefixo || caminho.startsWith(x.prefixo.endsWith("/") ? x.prefixo : x.prefixo + "/"));
  return !r || r.papeis.includes(papel);
}

export const ROTULO_PAPEL: Record<PapelUsuario, string> = {
  ADMIN: "Administrador (tudo)",
  GERENTE: "Gerente (tudo menos usuários e migração)",
  OPERADOR: "Atendente (OS, vendas, PDV, estoque, cadastros)",
  TECNICO: "Técnico (OS, estoque, cadastros)",
  CAIXA: "Caixa (PDV, vendas, OS, estoque, cadastros)",
};
