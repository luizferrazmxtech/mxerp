import type { PapelUsuario } from "@prisma/client";

/** Quem entra em cada área. O primeiro prefixo que bater vale; o que não está aqui é liberado para todos os logados. */
const REGRAS: { prefixo: string; papeis: PapelUsuario[] }[] = [
  { prefixo: "/usuarios", papeis: ["ADMIN"] },
  // empresas (lojas): dados fiscais, certificado e numeração
  { prefixo: "/empresas", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/auditoria", papeis: ["ADMIN"] },
  { prefixo: "/funcionarios", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/campos-extras", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/valores-venda", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/grupos-produtos", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/unidades", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/grades", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/orcamentos/situacoes", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/orcamentos/mensagens", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/orcamentos/configuracoes", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/vendas/situacoes", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/os/situacoes", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/os/mensagens", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/os/configuracoes", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/os/equipes", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/vendas/canais", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/vendas/mensagens", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/vendas/balancas", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/vendas/configuracoes", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/compras/situacoes", papeis: ["ADMIN", "GERENTE"] },
  // notas de compra da SEFAZ e manifestação são da gerência (manifestar é ato fiscal)
  { prefixo: "/compras/notas-recebidas", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/api/notas-recebidas", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/compras/mensagens", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/estoque/configuracoes", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/estoque/zerar", papeis: ["ADMIN", "GERENTE"] },
  // custos e margens são da gerência
  { prefixo: "/estoque/custos", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/migracao", papeis: ["ADMIN"] },
  // WhatsApp (MXChat): configuração e histórico de mensagens mandadas aos clientes
  { prefixo: "/whatsapp", papeis: ["ADMIN", "GERENTE"] },
  // marketplaces geram vendas e baixam o financeiro (a conexão com a conta é só do administrador, na ação)
  { prefixo: "/marketplaces", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/api/mercadolivre", papeis: ["ADMIN", "GERENTE"] },
  // contratos mexem com cobrança e financeiro
  { prefixo: "/contratos", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/financeiro", papeis: ["ADMIN", "GERENTE"] },
  // relatórios (custo, lucro, comissões, DRE, painéis): ver AREAS_ACAO, decidido pela permissão "relatorios.ver"
  // ver/imprimir uma nota (DANFCE) é de quem vende; a configuração fiscal e a lista ficam com a gerência
  { prefixo: "/fiscal/inutilizacao", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/fiscal/impostos", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/fiscal/", papeis: ["ADMIN", "GERENTE", "OPERADOR", "CAIXA"] },
  { prefixo: "/fiscal", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/api/notas", papeis: ["ADMIN", "GERENTE"] },
  // frete: configurar o Melhor Envio é da gerência; a lista de envios é de quem vende
  // contador: arquivos fiscais e manifestação automática
  { prefixo: "/contador", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/api/contador", papeis: ["ADMIN", "GERENTE"] },
  // PagSeguro: configuração e conciliação (taxas, repasses) são da gerência
  { prefixo: "/pagseguro", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/openfinance", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/google-agenda", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/frete/configuracoes", papeis: ["ADMIN", "GERENTE"] },
  { prefixo: "/frete", papeis: ["ADMIN", "GERENTE", "OPERADOR", "CAIXA"] },
  { prefixo: "/api/frete", papeis: ["ADMIN", "GERENTE", "OPERADOR", "CAIXA"] },
  { prefixo: "/pdv", papeis: ["ADMIN", "GERENTE", "OPERADOR", "CAIXA"] },
  { prefixo: "/vendas", papeis: ["ADMIN", "GERENTE", "OPERADOR", "CAIXA"] },
  // a exportação segue a mesma regra da tela de vendas
  { prefixo: "/api/vendas", papeis: ["ADMIN", "GERENTE", "OPERADOR", "CAIXA"] },
];

/**
 * Áreas decididas por uma permissão por ação (Usuários › Permissões), para o administrador poder liberar a outro papel.
 * A chave é a de ACOES em permissoesAcao.ts (este arquivo não importa o banco: o menu usa no navegador).
 */
export const AREAS_ACAO: { prefixo: string; acao: string }[] = [
  { prefixo: "/relatorios", acao: "relatorios.ver" },
  { prefixo: "/api/relatorios", acao: "relatorios.ver" },
];

const bate = (caminho: string, prefixo: string) => caminho === prefixo || caminho.startsWith(prefixo.endsWith("/") ? prefixo : prefixo + "/");

/** Permissão por ação que decide este caminho (ou null). */
export const acaoDaArea = (caminho: string) => AREAS_ACAO.find((a) => bate(caminho, a.prefixo))?.acao ?? null;

/**
 * O papel entra neste caminho? `acoes` = permissões por ação liberadas para o papel (acoesLiberadas em
 * permissoesAcao.ts). Sem `acoes`, uma área decidida por ação só abre para o ADMIN (na dúvida, fecha).
 */
export function podeAcessar(papel: PapelUsuario, caminho: string, acoes?: ReadonlySet<string>) {
  const a = acaoDaArea(caminho);
  if (a && papel !== "ADMIN" && !acoes?.has(a)) return false;
  const r = REGRAS.find((x) => bate(caminho, x.prefixo));
  return !r || r.papeis.includes(papel);
}

export const ROTULO_PAPEL: Record<PapelUsuario, string> = {
  ADMIN: "Administrador (tudo)",
  GERENTE: "Gerente (tudo menos usuários e migração)",
  OPERADOR: "Atendente (OS, vendas, PDV, estoque, cadastros)",
  TECNICO: "Técnico (OS, estoque, cadastros)",
  CAIXA: "Caixa (PDV, vendas, OS, estoque, cadastros)",
};
