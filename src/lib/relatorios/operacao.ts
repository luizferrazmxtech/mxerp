import { prisma } from "@/lib/db";
import { sqlDaLoja } from "@/lib/empresa/loja";
import { diaSP, rotuloMesCurto, somarDias } from "@/lib/datas";
import { itensVendidos, type FiltroVendas, type ItemVendido, type Periodo } from "./relatorios";

/**
 * Relatório de operação e clientes: vendas por canal, OS por técnico e por equipamento,
 * estoque parado, clientes novos × recorrentes e clientes que pararam de comprar.
 */
const r2 = (v: number) => Math.round(v * 100) / 100;
const DIA = 86400000;

export const ROTULO_TIPO: Record<string, string> = { BALCAO: "Balcão (PDV)", PEDIDO: "Pedido de venda", SERVICO: "Venda de serviço", OS: "Ordem de serviço" };

function somarPor(itens: ItemVendido[], chave: (i: ItemVendido) => string) {
  const m = new Map<string, { chave: string; receita: number; docs: Set<string> }>();
  for (const i of itens) {
    const k = chave(i);
    const g = m.get(k) ?? { chave: k, receita: 0, docs: new Set<string>() };
    g.receita += i.receita; g.docs.add(`${i.origem}:${i.docId}`);
    m.set(k, g);
  }
  return [...m.values()].map((g) => ({ chave: g.chave, receita: r2(g.receita), documentos: g.docs.size })).sort((a, b) => b.receita - a.receita);
}

/** Faturamento por canal de venda e por tipo de documento. */
export async function vendasPorCanal(p: Periodo, f: FiltroVendas = {}) {
  const itens = await itensVendidos(p, f);
  return {
    canais: somarPor(itens, (i) => i.canal?.trim() || "Sem canal"),
    tipos: somarPor(itens, (i) => i.tipoDoc).map((t) => ({ ...t, rotulo: ROTULO_TIPO[t.chave] ?? t.chave })),
    total: r2(itens.reduce((s, i) => s + i.receita, 0)),
  };
}

/** OS concluídas/faturadas no período por técnico (quantidade e faturamento) e OS que entraram por tipo de equipamento. */
export async function osPorTecnicoEEquipamento(p: Periodo) {
  const itens = (await itensVendidos(p)).filter((i) => i.origem === "OS");
  const tecnicos = new Map<string, { chave: string; nome: string; receita: number; servicos: number; os: Set<string> }>();
  for (const i of itens) {
    const k = i.tecnicoId ?? "-";
    const t = tecnicos.get(k) ?? { chave: k, nome: i.tecnico ?? "Sem técnico", receita: 0, servicos: 0, os: new Set<string>() };
    t.receita += i.receita; if (i.tipo === "SERVICO") t.servicos += i.receita; t.os.add(i.docId);
    tecnicos.set(k, t);
  }
  const fim = somarDias(p.ate, 1);
  const lo = await sqlDaLoja(`o."empresaId"`);
  // nome do equipamento é texto livre: agrupa sem diferenciar maiúsculas/espaços
  const equipamentos = await prisma.$queryRaw<{ equipamento: string; os: number; concluidas: number }[]>`
    SELECT MODE() WITHIN GROUP (ORDER BY TRIM(e.equipamento)) equipamento, COUNT(DISTINCT o.id)::int os,
           COUNT(DISTINCT o.id) FILTER (WHERE o.situacao IN ('CONCLUIDA','FATURADA'))::int concluidas
      FROM "OsEquipamento" e JOIN "OrdemServico" o ON o.id = e."osId"
     WHERE (o.entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date >= ${p.de}::date
       AND (o.entrada AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date < ${fim}::date
       AND o.situacao <> 'CANCELADA' AND TRIM(e.equipamento) <> '' ${lo}
     GROUP BY LOWER(TRIM(e.equipamento)) ORDER BY 2 DESC, 1 LIMIT 12`;
  return {
    tecnicos: [...tecnicos.values()].map((t) => ({ chave: t.chave, nome: t.nome, os: t.os.size, receita: r2(t.receita), servicos: r2(t.servicos), ticket: t.os.size ? r2(t.receita / t.os.size) : 0 }))
      .sort((a, b) => b.receita - a.receita),
    equipamentos,
  };
}

/**
 * Estoque parado: produtos com saldo e sem nenhuma saída nos últimos `dias` dias (venda, OS, ajuste…).
 * Valor = saldo × custo do cadastro. Também devolve o valor total do estoque da loja.
 */
export async function estoqueParado(dias = 90, hoje = diaSP()) {
  const desde = somarDias(hoje, -dias);
  const ld = await sqlDaLoja(`d."empresaId"`);
  const rows = await prisma.$queryRaw<{ id: string; codigo: string; nome: string; quantidade: number; custo: number; ultimaSaida: Date | null; parado: boolean }[]>`
    WITH saldo AS (
      SELECT s."produtoId", SUM(s.quantidade) quantidade
        FROM "Saldo" s JOIN "Local" l ON l.id = s."localId" JOIN "Deposito" d ON d.id = l."depositoId"
       WHERE TRUE ${ld} GROUP BY 1 HAVING SUM(s.quantidade) > 0
    ), saida AS (
      SELECT m."produtoId", MAX(m."createdAt") ultima FROM "MovimentoEstoque" m WHERE m.tipo = 'SAIDA' GROUP BY 1
    )
    SELECT p.id, p.codigo, p.nome, sa.quantidade::float quantidade, p.custo::float custo, sd.ultima "ultimaSaida",
           (sd.ultima IS NULL OR sd.ultima < ${desde}) AND p."createdAt" < ${desde} parado
      FROM saldo sa JOIN "Produto" p ON p.id = sa."produtoId" LEFT JOIN saida sd ON sd."produtoId" = p.id`;
  const valor = (r: { quantidade: number; custo: number }) => r2(r.quantidade * r.custo);
  const parados = rows.filter((r) => r.parado).map((r) => ({ ...r, valor: valor(r), dias: r.ultimaSaida ? Math.floor((hoje.getTime() - r.ultimaSaida.getTime()) / DIA) : null }))
    .sort((a, b) => b.valor - a.valor);
  return {
    valorEstoque: r2(rows.reduce((s, r) => s + valor(r), 0)),
    itensComSaldo: rows.length,
    valorParado: r2(parados.reduce((s, r) => s + r.valor, 0)),
    parados,
  };
}

/** Quando cada cliente comprou (vendas concretizadas e OS concluídas/faturadas, pela data), em todo o histórico da loja. */
async function comprasPorCliente() {
  const lv = await sqlDaLoja(`v."empresaId"`), lo = await sqlDaLoja(`o."empresaId"`);
  return prisma.$queryRaw<{ clienteId: string; nome: string; dia: Date; total: number }[]>`
    SELECT x."clienteId", c.nome, x.dia::timestamp AT TIME ZONE 'UTC' dia, x.total::float total FROM (
      SELECT v."clienteId", (v.data AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date dia, v.total
        FROM "Venda" v WHERE v.situacao = 'CONCLUIDA' AND v."clienteId" IS NOT NULL ${lv}
      UNION ALL
      SELECT o."clienteId", (COALESCE(o.saida, o.entrada) AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date, o.total
        FROM "OrdemServico" o WHERE o.situacao IN ('CONCLUIDA','FATURADA') AND o."clienteId" IS NOT NULL ${lo}
    ) x JOIN "Pessoa" c ON c.id = x."clienteId"
    ORDER BY x.dia`;
}

const chaveMes = (d: Date) => d.toISOString().slice(0, 7);

/**
 * Clientes por mês (últimos 12 meses até `ref`): novos (primeira compra no mês) e recorrentes (já tinham comprado).
 * "Pararam de comprar": compraram 2 vezes ou mais e a última compra foi entre `semComprar` dias e 1 ano atrás.
 */
export async function clientesNovosERecorrentes(ref = diaSP(), semComprar = 90) {
  const compras = await comprasPorCliente();
  const meses = Array.from({ length: 12 }, (_, k) => chaveMes(new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - 11 + k, 1))));
  const primeira = new Map<string, string>();
  const porMes = new Map(meses.map((m) => [m, { novos: new Set<string>(), recorrentes: new Set<string>() }]));
  const resumo = new Map<string, { id: string; nome: string; compras: number; total: number; ultima: Date }>();
  for (const c of compras) {
    const m = chaveMes(c.dia);
    if (!primeira.has(c.clienteId)) primeira.set(c.clienteId, m);
    const pm = porMes.get(m);
    if (pm) (primeira.get(c.clienteId) === m ? pm.novos : pm.recorrentes).add(c.clienteId);
    const r = resumo.get(c.clienteId) ?? { id: c.clienteId, nome: c.nome, compras: 0, total: 0, ultima: c.dia };
    r.compras += 1; r.total += c.total; if (c.dia > r.ultima) r.ultima = c.dia;
    resumo.set(c.clienteId, r);
  }
  for (const pm of porMes.values()) for (const id of pm.novos) pm.recorrentes.delete(id);
  const limite = somarDias(ref, -semComprar), umAno = somarDias(ref, -365);
  const sumiram = [...resumo.values()].filter((r) => r.compras >= 2 && r.ultima < limite && r.ultima >= umAno)
    .map((r) => ({ ...r, total: r2(r.total), dias: Math.floor((ref.getTime() - r.ultima.getTime()) / DIA) }))
    .sort((a, b) => b.total - a.total);
  return {
    meses: meses.map((m) => ({ mes: m, rotulo: rotuloMesCurto(m), novos: porMes.get(m)!.novos.size, recorrentes: porMes.get(m)!.recorrentes.size })),
    sumiram,
    ativos: [...resumo.values()].filter((r) => r.ultima >= limite).length,
  };
}

