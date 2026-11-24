import type { PapelUsuario } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Permissões por ação: o que cada papel pode fazer além de entrar na tela (excluir, cancelar, estornar, dar desconto…).
 * O padrão de cada ação é o comportamento que o sistema já tinha; a tela /usuarios/permissoes grava as exceções
 * em PermissaoPapel. O ADMIN sempre pode tudo (para nunca ficar trancado do lado de fora).
 */
const TODOS: PapelUsuario[] = ["ADMIN", "GERENTE", "OPERADOR", "TECNICO", "CAIXA"];
const GER: PapelUsuario[] = ["ADMIN", "GERENTE"];
const VENDE: PapelUsuario[] = ["ADMIN", "GERENTE", "OPERADOR", "CAIXA"];

export const ACOES = {
  "venda.situacao": { grupo: "Vendas", rotulo: "Mudar a situação de vendas", padrao: VENDE },
  "venda.excluir": { grupo: "Vendas", rotulo: "Excluir vendas", padrao: GER },
  "venda.devolucao": { grupo: "Vendas", rotulo: "Registrar trocas e devoluções", padrao: VENDE },
  "venda.juntar": { grupo: "Vendas", rotulo: "Juntar vendas do mesmo cliente numa só", padrao: VENDE },
  "venda.etiqueta": { grupo: "Vendas", rotulo: "Comprar e cancelar etiquetas de frete (Melhor Envio)", padrao: VENDE },
  "pdv.desconto": { grupo: "PDV", rotulo: "Dar desconto no PDV", padrao: VENDE },
  "pdv.sangria": { grupo: "PDV", rotulo: "Fazer sangria e reforço de caixa", padrao: VENDE },
  "pdv.caixas": { grupo: "PDV", rotulo: "Ver todos os caixas (inclusive os que não abriu nem vendeu)", padrao: GER },
  "pdv.cancelar": { grupo: "PDV", rotulo: "Cancelar venda do PDV (estorna o recebimento)", padrao: GER },
  "os.situacao": { grupo: "Ordens de serviço", rotulo: "Mudar a situação de OS", padrao: TODOS },
  "os.excluir": { grupo: "Ordens de serviço", rotulo: "Excluir OS", padrao: GER },
  "os.juntar": { grupo: "Ordens de serviço", rotulo: "Juntar OS do mesmo cliente numa só", padrao: ["ADMIN", "GERENTE", "OPERADOR"] as PapelUsuario[] },
  "os.tecnicoItens": { grupo: "Ordens de serviço", rotulo: "Lançar itens e marcar instalados pela tela do técnico", padrao: TODOS },
  "os.editarTempo": { grupo: "Ordens de serviço", rotulo: "Corrigir o tempo de mão de obra da OS (início, fim, incluir e excluir trechos)", padrao: ["ADMIN"] as PapelUsuario[] },
  "os.tecnicoFotos": { grupo: "Ordens de serviço", rotulo: "Anexar fotos da instalação pela tela do técnico", padrao: TODOS },
  "orcamento.excluir": { grupo: "Orçamentos", rotulo: "Excluir orçamentos", padrao: GER },
  "compra.excluir": { grupo: "Compras e estoque", rotulo: "Excluir compras", padrao: GER },
  "estoque.ajuste": { grupo: "Compras e estoque", rotulo: "Lançar ajuste de estoque", padrao: ["ADMIN", "GERENTE", "OPERADOR"] as PapelUsuario[] },
  "estoque.zerar": { grupo: "Compras e estoque", rotulo: "Zerar estoque", padrao: GER },
  "pessoa.excluir": { grupo: "Cadastros", rotulo: "Excluir clientes e fornecedores", padrao: TODOS },
  "produto.excluir": { grupo: "Cadastros", rotulo: "Excluir produtos e serviços", padrao: ["ADMIN", "GERENTE", "OPERADOR", "TECNICO"] as PapelUsuario[] },
  "produto.precos": { grupo: "Cadastros", rotulo: "Reajustar preços em massa", padrao: GER },
  "nota.cancelar": { grupo: "Fiscal", rotulo: "Cancelar notas fiscais", padrao: GER },
  "nota.cce": { grupo: "Fiscal", rotulo: "Emitir carta de correção", padrao: GER },
  "nota.inutilizar": { grupo: "Fiscal", rotulo: "Inutilizar numeração", padrao: GER },
  "financeiro.lancar": { grupo: "Financeiro", rotulo: "Lançar contas a pagar e receber", padrao: GER },
  "financeiro.baixar": { grupo: "Financeiro", rotulo: "Baixar contas", padrao: GER },
  "financeiro.estornar": { grupo: "Financeiro", rotulo: "Estornar baixas", padrao: GER },
  "financeiro.agrupar": { grupo: "Financeiro", rotulo: "Agrupar e desagrupar contas a receber", padrao: GER },
  "financeiro.excluir": { grupo: "Financeiro", rotulo: "Excluir lançamentos", padrao: GER },
} satisfies Record<string, { grupo: string; rotulo: string; padrao: PapelUsuario[] }>;

export type ChaveAcao = keyof typeof ACOES;
export const PAPEIS_CONFIGURAVEIS: PapelUsuario[] = ["GERENTE", "OPERADOR", "TECNICO", "CAIXA"];

let cache: { mapa: Map<string, boolean>; ate: number } | null = null;
export const limparCachePermissoes = () => { cache = null; };

async function excecoes() {
  if (cache && cache.ate > Date.now()) return cache.mapa;
  const rs = await prisma.permissaoPapel.findMany();
  const mapa = new Map(rs.map((r) => [`${r.papel}:${r.acao}`, r.permitido]));
  cache = { mapa, ate: Date.now() + 30_000 };
  return mapa;
}

/** O papel pode fazer esta ação? */
export async function pode(papel: PapelUsuario, acao: ChaveAcao) {
  if (papel === "ADMIN") return true;
  const x = (await excecoes()).get(`${papel}:${acao}`);
  return x ?? (ACOES[acao].padrao as PapelUsuario[]).includes(papel);
}

/** Matriz completa (para a tela): ação → papel → pode? */
export async function matrizPermissoes() {
  const ex = await excecoes();
  return (Object.keys(ACOES) as ChaveAcao[]).map((acao) => ({
    acao, ...ACOES[acao],
    papeis: Object.fromEntries(PAPEIS_CONFIGURAVEIS.map((p) => {
      const padrao = (ACOES[acao].padrao as PapelUsuario[]).includes(p);
      const v = ex.get(`${p}:${acao}`) ?? padrao;
      return [p, { pode: v, padrao }];
    })) as Record<PapelUsuario, { pode: boolean; padrao: boolean }>,
  }));
}

/** Grava a matriz marcada na tela; o que volta ao padrão deixa de ser exceção. */
export async function salvarPermissoes(marcadas: Set<string>, restaurarPadrao = false) {
  if (restaurarPadrao) {
    await prisma.permissaoPapel.deleteMany({});
    limparCachePermissoes();
    return;
  }
  for (const acao of Object.keys(ACOES) as ChaveAcao[]) {
    for (const papel of PAPEIS_CONFIGURAVEIS) {
      const quer = marcadas.has(`${papel}:${acao}`);
      const padrao = (ACOES[acao].padrao as PapelUsuario[]).includes(papel);
      if (quer === padrao) await prisma.permissaoPapel.deleteMany({ where: { papel, acao } });
      else await prisma.permissaoPapel.upsert({ where: { papel_acao: { papel, acao } }, create: { papel, acao, permitido: quer }, update: { permitido: quer } });
    }
  }
  limparCachePermissoes();
}
