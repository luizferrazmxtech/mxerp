import { prisma, type Tx } from "@/lib/db";
import { configEstoque } from "./config";

/**
 * Estoque de entrada das compras: em qual depósito as peças entram. A compra escolhe; sem escolha vale o padrão das
 * configurações de estoque e, sem padrão, o primeiro estoque da loja que não é carro. Antes a entrada caía no primeiro
 * local pelo código, que podia ser o carro de uma equipe.
 */

/** Estoque que pode receber a compra (carro = estoque de uma equipe). */
export type EstoqueEntrada = { id: string; nome: string; carro: boolean };

/** Estoques ativos da loja atual (a extensão do Prisma filtra Deposito pela loja), com os carros por último. */
export async function estoquesDeEntrada(tx: Tx | typeof prisma = prisma): Promise<EstoqueEntrada[]> {
  const ds = await tx.deposito.findMany({
    where: { ativo: true, locais: { some: { ativo: true } } },
    select: { id: true, nome: true, equipeId: true, empresaId: true },
    orderBy: [{ empresaId: { sort: "asc", nulls: "last" } }, { nome: "asc" }],
  });
  return ds.map((d) => ({ id: d.id, nome: d.nome, carro: !!d.equipeId })).sort((a, b) => Number(a.carro) - Number(b.carro));
}

/** Estoque padrão da entrada: o das configurações (se ainda é da loja), senão o primeiro que não é carro. */
export async function estoquePadraoEntrada(tx: Tx | typeof prisma = prisma, lista?: EstoqueEntrada[]): Promise<string | null> {
  const ds = lista ?? (await estoquesDeEntrada(tx));
  const cfg = (await configEstoque()).depositoEntrada;
  return ds.find((d) => d.id === cfg)?.id ?? ds.find((d) => !d.carro)?.id ?? null;
}

/**
 * Escolhe o local (prateleira) de cada item da compra.
 *  - Com o estoque escolhido: o local padrão do produto se ele for desse estoque, senão o primeiro local do estoque.
 *  - Sem escolha (compras antigas, importação): o local padrão do produto se não for de um carro, senão o primeiro
 *    local do estoque padrão de entrada.
 */
export async function resolvedorDeLocal(tx: Tx, depositoId: string | null) {
  const dep = depositoId ?? (await estoquePadraoEntrada(tx));
  if (!dep) throw new Error("Cadastre um estoque (Estoque › Locais) antes de lançar a compra");
  const locais = await tx.local.findMany({ where: { depositoId: dep, ativo: true }, orderBy: { codigo: "asc" }, select: { id: true } });
  if (!locais.length) throw new Error("O estoque escolhido não tem nenhum local ativo");
  const ids = new Set(locais.map((l) => l.id));
  const foraDoCarro = new Set<string>();
  if (!depositoId) {
    const daLoja = await tx.local.findMany({ where: { ativo: true, deposito: { equipeId: null } }, select: { id: true } });
    for (const l of daLoja) foraDoCarro.add(l.id);
  }
  return (localPadraoProduto: string | null | undefined) => {
    if (localPadraoProduto && (ids.has(localPadraoProduto) || foraDoCarro.has(localPadraoProduto))) return localPadraoProduto;
    return locais[0].id;
  };
}

/**
 * Local da loja quando o documento não diz de onde sai ou para onde volta (venda com falta baixada no negativo,
 * devolução, estorno de venda/OS migrada, ajuste sem prateleira): o local padrão do produto, se for desta loja e não
 * for carro; senão o primeiro local do estoque padrão de entrada. Nunca o carro de uma equipe: só OS de equipe e
 * transferência mexem no carro. Antes caía no primeiro local pelo código, que podia ser o carro (CARRO-… < LOJA…).
 */
export async function localDaLoja(tx: Tx | typeof prisma, localPadraoProduto?: string | null): Promise<string> {
  if (localPadraoProduto) {
    const deposito = (await estoquesDeEntrada(tx)).filter((d) => !d.carro).map((d) => d.id);
    const ok = await tx.local.findFirst({ where: { id: localPadraoProduto, ativo: true, depositoId: { in: deposito } }, select: { id: true } });
    if (ok) return ok.id;
  }
  const dep = await estoquePadraoEntrada(tx);
  const l = dep ? await tx.local.findFirst({ where: { depositoId: dep, ativo: true }, orderBy: { codigo: "asc" }, select: { id: true } }) : null;
  if (!l) throw new Error("Cadastre um estoque da loja (Estoque › Locais) com ao menos um local ativo");
  return l.id;
}

/** true se o local é de um carro (depósito de equipe). */
export async function localEhCarro(tx: Tx | typeof prisma, localId: string) {
  return (await tx.local.count({ where: { id: localId, deposito: { equipeId: { not: null } } } })) > 0;
}
