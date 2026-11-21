import { Prisma, OrigemDocumento } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { alocar, arred, type Alocacao } from "./alocacao";
import { lojaAtualId } from "@/lib/empresa/loja";

/**
 * Regras de estoque do MXERP.
 *
 *  físico     = soma dos saldos por local
 *  reservado  = reservas ATIVAS com local (peça separada para um documento)
 *  falta      = reservas ATIVAS sem local (pedido sem estoque)
 *  disponível = físico - reservado
 *
 * Toda operação trava a linha do produto (SELECT ... FOR UPDATE) para que dois
 * técnicos nunca reservem a mesma peça ao mesmo tempo.
 *
 * Carro da equipe: depósito com equipeId. Fica fora do disponível da loja
 * (venda e OS comuns nunca reservam de lá); só sai dele o item de OS marcado "no carro"
 * (reserva com local fixo). Para abastecer o carro, transferência de depósito, sem venda.
 */

export class EstoqueError extends Error {}

const n = (d: Prisma.Decimal | number | string | null | undefined) => Number(d ?? 0);

export async function travarProduto(tx: Tx, produtoId: string) {
  const rows = await tx.$queryRaw<{ id: string; localPadraoId: string | null; controlaEstoque: boolean }[]>`
    SELECT id, "localPadraoId", "controlaEstoque" FROM "Produto" WHERE id = ${produtoId} FOR NO KEY UPDATE`;
  if (!rows.length) throw new EstoqueError("Produto não encontrado");
  return rows[0];
}

/**
 * Disponível por local (físico do local - reservas ativas naquele local).
 * Só os locais da loja atual (depósito da loja ou sem loja): cada CNPJ vende do próprio estoque.
 */
export async function disponivelPorLocal(tx: Tx, produtoId: string, opts: { incluirCarros?: boolean } = {}) {
  const loja = await lojaAtualId();
  const carros = !!opts.incluirCarros;
  const rows = await tx.$queryRaw<{ localId: string; fisico: Prisma.Decimal; reservado: Prisma.Decimal }[]>`
    SELECT s."localId",
           s.quantidade AS fisico,
           COALESCE((SELECT SUM(r.quantidade) FROM "Reserva" r
                     WHERE r."produtoId" = s."produtoId" AND r."localId" = s."localId"
                       AND r.status = 'ATIVA'), 0) AS reservado
      FROM "Saldo" s
     WHERE s."produtoId" = ${produtoId}
       AND (${loja}::text IS NULL OR s."localId" IN (
             SELECT l.id FROM "Local" l JOIN "Deposito" d ON d.id = l."depositoId"
              WHERE d."empresaId" IS NULL OR d."empresaId" = ${loja}))
       AND (${carros} OR s."localId" NOT IN (
             SELECT l.id FROM "Local" l JOIN "Deposito" d ON d.id = l."depositoId" WHERE d."equipeId" IS NOT NULL))`;
  return rows.map((r) => ({
    localId: r.localId,
    fisico: n(r.fisico),
    reservado: n(r.reservado),
    disponivel: arred(n(r.fisico) - n(r.reservado)),
  }));
}

export type ResumoEstoque = {
  fisico: number;
  reservado: number;
  falta: number;
  /** livre para a loja vender (não conta o que está livre nos carros das equipes) */
  disponivel: number;
  /** livre nos carros das equipes */
  nosCarros: number;
};

export async function resumoProduto(tx: Tx, produtoId: string): Promise<ResumoEstoque> {
  const [s] = await tx.$queryRaw<{ fisico: Prisma.Decimal | null }[]>`
    SELECT SUM(quantidade) AS fisico FROM "Saldo" WHERE "produtoId" = ${produtoId}`;
  const [r] = await tx.$queryRaw<{ reservado: Prisma.Decimal | null; falta: Prisma.Decimal | null }[]>`
    SELECT SUM(quantidade) FILTER (WHERE "localId" IS NOT NULL) AS reservado,
           SUM(quantidade) FILTER (WHERE "localId" IS NULL) AS falta
      FROM "Reserva" WHERE "produtoId" = ${produtoId} AND status = 'ATIVA'`;
  const [t] = await tx.$queryRaw<{ livre: Prisma.Decimal | null }[]>`
    SELECT SUM(s.quantidade - COALESCE((SELECT SUM(r.quantidade) FROM "Reserva" r
             WHERE r."produtoId" = s."produtoId" AND r."localId" = s."localId" AND r.status = 'ATIVA'), 0)) AS livre
      FROM "Saldo" s JOIN "Local" l ON l.id = s."localId" JOIN "Deposito" d ON d.id = l."depositoId"
     WHERE s."produtoId" = ${produtoId} AND d."equipeId" IS NOT NULL`;
  const fisico = n(s?.fisico);
  const reservado = n(r?.reservado);
  const nosCarros = n(t?.livre);
  return { fisico, reservado, falta: n(r?.falta), disponivel: arred(fisico - reservado - nosCarros), nosCarros };
}

type Origem = { origemTipo: OrigemDocumento; origemId: string; origemItemId: string };

/**
 * Reserva a quantidade de um item de documento, escolhendo as prateleiras.
 * Com `localId` (item "no carro"), reserva tudo naquele local: a peça já está com a equipe,
 * então não vira falta mesmo que o sistema mostre menos no carro (o saldo do carro pode ficar negativo).
 */
export async function reservarItem(
  tx: Tx,
  args: Origem & { produtoId: string; quantidade: number; localId?: string | null },
): Promise<Alocacao[]> {
  const prod = await travarProduto(tx, args.produtoId);
  if (!prod.controlaEstoque) return [];
  const alocacoes = args.localId
    ? [{ localId: args.localId, quantidade: arred(args.quantidade) }]
    : alocar(args.quantidade, await disponivelPorLocal(tx, args.produtoId), prod.localPadraoId);
  await tx.reserva.createMany({
    data: alocacoes.map((a) => ({
      produtoId: args.produtoId,
      localId: a.localId,
      quantidade: a.quantidade,
      origemTipo: args.origemTipo,
      origemId: args.origemId,
      origemItemId: args.origemItemId,
    })),
  });
  return alocacoes;
}

/** Libera as reservas ativas de um item (item removido ou documento cancelado). */
export async function liberarItem(tx: Tx, origemItemId: string) {
  const ativas = await tx.reserva.findMany({
    where: { origemItemId, status: "ATIVA" },
    select: { produtoId: true },
    distinct: ["produtoId"],
  });
  for (const a of ativas) await travarProduto(tx, a.produtoId);
  await tx.reserva.updateMany({ where: { origemItemId, status: "ATIVA" }, data: { status: "LIBERADA" } });
  // o que foi liberado pode cobrir faltas de outros documentos
  for (const a of ativas) await cobrirFaltas(tx, a.produtoId);
}

export async function liberarDocumento(tx: Tx, origemTipo: OrigemDocumento, origemId: string) {
  const itens = await tx.reserva.findMany({
    where: { origemTipo, origemId, status: "ATIVA" },
    select: { origemItemId: true },
    distinct: ["origemItemId"],
  });
  for (const i of itens) await liberarItem(tx, i.origemItemId);
}

/**
 * Converte reservas em falta (sem local) em reservas com local quando há
 * disponível, na ordem em que foram pedidas. Chamado após entradas/liberações.
 */
export async function cobrirFaltas(tx: Tx, produtoId: string) {
  const prod = await travarProduto(tx, produtoId);
  const faltas = await tx.reserva.findMany({
    where: { produtoId, status: "ATIVA", localId: null },
    orderBy: { createdAt: "asc" },
  });
  for (const f of faltas) {
    const locais = await disponivelPorLocal(tx, produtoId);
    const total = locais.reduce((s, l) => s + Math.max(0, l.disponivel), 0);
    if (total <= 0) break;
    const aloc = alocar(n(f.quantidade), locais, prod.localPadraoId);
    await tx.reserva.delete({ where: { id: f.id } });
    await tx.reserva.createMany({
      data: aloc.map((a) => ({
        produtoId,
        localId: a.localId,
        quantidade: a.quantidade,
        origemTipo: f.origemTipo,
        origemId: f.origemId,
        origemItemId: f.origemItemId,
        createdAt: f.createdAt, // mantém a fila
      })),
    });
  }
}

async function somarSaldo(tx: Tx, produtoId: string, localId: string, delta: number) {
  await tx.$executeRaw`
    INSERT INTO "Saldo" ("produtoId", "localId", quantidade, "updatedAt")
    VALUES (${produtoId}, ${localId}, ${delta}, now())
    ON CONFLICT ("produtoId", "localId")
    DO UPDATE SET quantidade = "Saldo".quantidade + ${delta}, "updatedAt" = now()`;
}

/** Entrada de mercadoria em um local (compra, devolução, ajuste, implantação). */
export async function entrada(
  tx: Tx,
  args: {
    produtoId: string;
    localId: string;
    quantidade: number;
    custoUnit?: number;
    origemTipo: OrigemDocumento;
    origemId?: string;
    observacao?: string;
    usuarioId?: string;
  },
) {
  if (!(args.quantidade > 0)) throw new EstoqueError("Quantidade deve ser maior que zero");
  await travarProduto(tx, args.produtoId);
  await somarSaldo(tx, args.produtoId, args.localId, args.quantidade);
  await tx.movimentoEstoque.create({
    data: {
      produtoId: args.produtoId,
      localId: args.localId,
      tipo: "ENTRADA",
      quantidade: args.quantidade,
      custoUnit: args.custoUnit,
      origemTipo: args.origemTipo,
      origemId: args.origemId,
      observacao: args.observacao,
      usuarioId: args.usuarioId,
    },
  });
  await cobrirFaltas(tx, args.produtoId);
}

/** Saída avulsa (ajuste de perda, uso interno). Não mexe em reservas. */
export async function saida(
  tx: Tx,
  args: {
    produtoId: string;
    localId: string;
    quantidade: number;
    origemTipo: OrigemDocumento;
    origemId?: string;
    observacao?: string;
    usuarioId?: string;
  },
) {
  if (!(args.quantidade > 0)) throw new EstoqueError("Quantidade deve ser maior que zero");
  await travarProduto(tx, args.produtoId);
  await somarSaldo(tx, args.produtoId, args.localId, -args.quantidade);
  await tx.movimentoEstoque.create({
    data: { ...args, tipo: "SAIDA" },
  });
}

/** Move mercadoria entre prateleiras, levando junto as reservas se necessário. */
export async function transferir(
  tx: Tx,
  args: { produtoId: string; deLocalId: string; paraLocalId: string; quantidade: number; usuarioId?: string },
) {
  const base = { produtoId: args.produtoId, quantidade: args.quantidade, origemTipo: "TRANSFERENCIA" as const, usuarioId: args.usuarioId };
  const cods = new Map((await tx.local.findMany({ where: { id: { in: [args.deLocalId, args.paraLocalId] } }, select: { id: true, codigo: true } })).map((l) => [l.id, l.codigo]));
  await saida(tx, { ...base, localId: args.deLocalId, observacao: `para ${cods.get(args.paraLocalId) ?? args.paraLocalId}` });
  await entrada(tx, { ...base, localId: args.paraLocalId, observacao: `de ${cods.get(args.deLocalId) ?? args.deLocalId}` });
  // se o local de origem ficou com reservado > físico, move reservas excedentes
  const locais = await disponivelPorLocal(tx, args.produtoId);
  const origem = locais.find((l) => l.localId === args.deLocalId);
  if (origem && origem.disponivel < 0) {
    // para o carro da equipe as reservas não vão junto: viram falta e procuram outra prateleira da loja
    const paraCarro = (await tx.local.count({ where: { id: args.paraLocalId, deposito: { equipeId: { not: null } } } })) > 0;
    let excesso = -origem.disponivel;
    const reservas = await tx.reserva.findMany({
      where: { produtoId: args.produtoId, localId: args.deLocalId, status: "ATIVA" },
      orderBy: { createdAt: "desc" },
    });
    for (const r of reservas) {
      if (excesso <= 0) break;
      const q = Math.min(excesso, n(r.quantidade));
      const destino = paraCarro ? null : args.paraLocalId;
      if (q >= n(r.quantidade)) {
        await tx.reserva.update({ where: { id: r.id }, data: { localId: destino } });
      } else {
        await tx.reserva.update({ where: { id: r.id }, data: { quantidade: arred(n(r.quantidade) - q) } });
        await tx.reserva.create({
          data: { ...r, id: undefined, quantidade: q, localId: destino, updatedAt: undefined },
        });
      }
      excesso = arred(excesso - q);
    }
    if (paraCarro) await cobrirFaltas(tx, args.produtoId);
  }
}

/**
 * Baixa o estoque de um documento: cada reserva ativa vira uma saída do
 * local onde estava reservada. Se houver falta, recusa — a não ser que
 * `permitirNegativo` seja true, caso em que a falta sai do local padrão.
 */
export async function baixarDocumento(
  tx: Tx,
  origemTipo: OrigemDocumento,
  origemId: string,
  opts: { permitirNegativo?: boolean; usuarioId?: string } = {},
) {
  const reservas = await tx.reserva.findMany({
    where: { origemTipo, origemId, status: "ATIVA" },
    include: { produto: { select: { id: true, codigo: true, nome: true, localPadraoId: true } } },
  });
  for (const pid of [...new Set(reservas.map((r) => r.produtoId))].sort()) await travarProduto(tx, pid);

  const faltas = reservas.filter((r) => r.localId === null);
  if (faltas.length && !opts.permitirNegativo) {
    const lista = faltas.map((f) => `${f.produto.codigo} (${n(f.quantidade)})`).join(", ");
    throw new EstoqueError(`Sem estoque para: ${lista}. Dê entrada nas peças ou confirme a baixa com estoque negativo.`);
  }

  for (const r of reservas) {
    const localId = r.localId ?? r.produto.localPadraoId ?? (await localQualquer(tx));
    await somarSaldo(tx, r.produtoId, localId, -n(r.quantidade));
    await tx.movimentoEstoque.create({
      data: {
        produtoId: r.produtoId,
        localId,
        tipo: "SAIDA",
        quantidade: r.quantidade,
        origemTipo,
        origemId,
        usuarioId: opts.usuarioId,
      },
    });
  }
  await tx.reserva.updateMany({ where: { origemTipo, origemId, status: "ATIVA" }, data: { status: "BAIXADA" } });
}

/** Desfaz a baixa (OS reaberta/cancelada após concluída): devolve ao mesmo local. */
export async function estornarBaixa(
  tx: Tx,
  origemTipo: OrigemDocumento,
  origemId: string,
  opts: { usuarioId?: string; cobrirFaltas?: boolean } = {},
) {
  const { usuarioId, cobrirFaltas: cobrir = true } = opts;
  const afetados = new Set<string>();
  // saldo líquido que o documento ainda tem "fora" do estoque, por produto/local
  const movs = await tx.movimentoEstoque.findMany({ where: { origemTipo, origemId } });
  const liquido = new Map<string, { produtoId: string; localId: string; q: number }>();
  for (const m of movs) {
    const k = `${m.produtoId}|${m.localId}`;
    const cur = liquido.get(k) ?? { produtoId: m.produtoId, localId: m.localId, q: 0 };
    cur.q = arred(cur.q + (m.tipo === "SAIDA" ? n(m.quantidade) : -n(m.quantidade)));
    liquido.set(k, cur);
  }
  for (const s of liquido.values()) {
    if (s.q <= 0) continue;
    await travarProduto(tx, s.produtoId);
    await somarSaldo(tx, s.produtoId, s.localId, s.q);
    await tx.movimentoEstoque.create({
      data: {
        produtoId: s.produtoId,
        localId: s.localId,
        tipo: "ENTRADA",
        quantidade: s.q,
        origemTipo,
        origemId,
        observacao: "estorno",
        usuarioId,
      },
    });
    afetados.add(s.produtoId);
  }
  if (cobrir) for (const p of afetados) await cobrirFaltas(tx, p);
  return [...afetados];
}

async function localQualquer(tx: Tx) {
  const l = await tx.local.findFirst({ where: { ativo: true }, orderBy: { codigo: "asc" } });
  if (!l) throw new EstoqueError("Cadastre ao menos um local de estoque");
  return l.id;
}
