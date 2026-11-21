import { prisma, type Tx } from "@/lib/db";
import { liberarItem, reservarItem } from "@/lib/estoque/estoque";
import { estadoDe, OsError } from "@/lib/os/ordens";
import { estadoEstoque } from "@/lib/os/os";

/**
 * "Itens no carro": marca de onde sai cada peça da OS (estoque da loja ou o carro de uma equipe).
 * Com a OS reservando, a reserva do item é refeita no novo local; com a OS já baixada, é preciso reabrir.
 * Usado pela visualização da OS (ao mandar para execução) e pela tela do técnico.
 */

export type OrigemItem = { itemId: string; localId: string | null };
type Quem = { id: string; nome: string };

/** opts.membro: o técnico só mexe com o carro das equipes de que ele é membro (marcar que saiu do carro ou devolver para a loja). */
export async function definirOrigemItensTx(tx: Tx, osId: string, origens: OrigemItem[], u: Quem, opts: { membro?: string } = {}) {
  const [o] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "OrdemServico" WHERE id = ${osId} FOR NO KEY UPDATE`;
  if (!o) throw new OsError("OS não encontrada");
  const os = await tx.ordemServico.findUniqueOrThrow({ where: { id: osId }, include: { situacaoCfg: true } });
  const estado = os.situacaoCfg ? estadoDe(os.situacaoCfg.estoque) : estadoEstoque(os.situacao);
  const itens = await tx.osItemProduto.findMany({ where: { osId }, include: { produto: { select: { nome: true } } } });
  const ids = [...new Set([...origens.map((x) => x.localId), ...itens.map((i) => i.localOrigemId)].filter((x): x is string => !!x))];
  const locais = new Map((await tx.local.findMany({
    where: { id: { in: ids } },
    select: { id: true, deposito: { select: { nome: true, equipeId: true, equipe: { select: { nome: true, membros: true } } } } },
  })).map((l) => [l.id, l]));
  const mudou: string[] = [];
  for (const { itemId, localId } of origens) {
    const item = itens.find((i) => i.id === itemId);
    if (!item) throw new OsError("Item não encontrado nesta OS");
    const novo = localId || null;
    if ((item.localOrigemId ?? null) === novo) continue;
    if (novo && !locais.get(novo)?.deposito.equipeId) throw new OsError("Escolha o carro de uma equipe");
    if (opts.membro) {
      const deOutro = [novo, item.localOrigemId].filter((x): x is string => !!x).some((l) => !locais.get(l)?.deposito.equipe?.membros.includes(opts.membro!));
      if (deOutro) throw new OsError("Você só pode marcar itens do carro da sua equipe");
    }
    if (estado === "BAIXADO") throw new OsError(`A OS nº ${os.numero} já baixou o estoque: reabra para trocar de onde saem as peças`);
    await tx.osItemProduto.update({ where: { id: item.id }, data: { localOrigemId: novo } });
    if (estado === "RESERVADO") {
      await liberarItem(tx, item.id);
      await reservarItem(tx, { produtoId: item.produtoId, quantidade: Number(item.quantidade), localId: novo, origemTipo: "OS", origemId: osId, origemItemId: item.id });
    }
    const dep = novo ? locais.get(novo)!.deposito : null;
    mudou.push(`${item.produto.nome} → ${dep ? dep.nome : "estoque da loja"}`);
  }
  if (mudou.length)
    await tx.osHistorico.create({ data: { osId, descricao: `Itens no carro: ${mudou.join("; ")}`.slice(0, 1000), usuarioNome: u.nome, usuarioId: u.id } });
  return mudou.length;
}

export const definirOrigemItens = (osId: string, origens: OrigemItem[], u: Quem, opts: { membro?: string } = {}) =>
  prisma.$transaction((tx) => definirOrigemItensTx(tx, osId, origens, u, opts), { timeout: 30000 });
