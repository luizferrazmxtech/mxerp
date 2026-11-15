import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * DRE gerencial mensal.
 * - Regime de competência (padrão): lançamentos pelo mês de competência.
 * - Regime de caixa: lançamentos pela data de pagamento/recebimento.
 * O CMV vem do custo das peças das vendas e OS concluídas no mês (não das compras).
 */
export type Regime = "COMPETENCIA" | "CAIXA";

export type LinhaDre = { chave: string; rotulo: string; meses: number[]; total: number; nivel: "grupo" | "categoria" | "resultado" };

const GRUPOS: { grupo: string; rotulo: string; sinal: 1 | -1 }[] = [
  { grupo: "RECEITA_BRUTA", rotulo: "Receita bruta", sinal: 1 },
  { grupo: "DEDUCOES", rotulo: "(−) Deduções e impostos sobre vendas", sinal: -1 },
  { grupo: "CUSTO", rotulo: "(−) Custos (CMV e serviços de terceiros)", sinal: -1 },
  { grupo: "DESPESA_OPERACIONAL", rotulo: "(−) Despesas operacionais", sinal: -1 },
  { grupo: "RECEITA_FINANCEIRA", rotulo: "(+) Receitas financeiras", sinal: 1 },
  { grupo: "DESPESA_FINANCEIRA", rotulo: "(−) Despesas financeiras", sinal: -1 },
  { grupo: "OUTRAS_RECEITAS", rotulo: "(+) Outras receitas", sinal: 1 },
  { grupo: "OUTRAS_DESPESAS", rotulo: "(−) Outras despesas", sinal: -1 },
];

export async function calcularDre(ano: number, regime: Regime = "COMPETENCIA") {
  const ini = new Date(Date.UTC(ano, 0, 1));
  const fim = new Date(Date.UTC(ano + 1, 0, 1));
  const campoData = regime === "CAIXA" ? `l."pagoEm"` : `l.competencia`;
  const campoValor = regime === "CAIXA" ? `l."valorPago"` : `l.valor`;

  const lanc = await prisma.$queryRawUnsafe<{ grupo: string; categoria: string; mes: number; valor: number }[]>(
    `SELECT c."grupoDre"::text grupo, c.nome categoria, EXTRACT(MONTH FROM ${campoData})::int mes, SUM(${campoValor})::float valor
       FROM "Lancamento" l JOIN "CategoriaFinanceira" c ON c.id = l."categoriaId"
      WHERE ${campoData} >= $1 AND ${campoData} < $2 AND c."grupoDre" <> 'NAO_OPERACIONAL'
        ${regime === "CAIXA" ? `AND l."pagoEm" IS NOT NULL` : ""}
      GROUP BY 1, 2, 3`,
    ini,
    fim,
  );

  // timestamps são gravados em UTC; o mês da DRE é o de São Paulo
  const local = (col: string) => Prisma.raw(`(${col} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')`);
  const iniL = `${ano}-01-01`;
  const fimL = `${ano + 1}-01-01`;
  // CMV: custo das peças de vendas concluídas (data) e OS concluídas/faturadas (saída)
  const cmv = await prisma.$queryRaw<{ mes: number; valor: number }[]>`
    SELECT mes, SUM(valor)::float valor FROM (
      SELECT EXTRACT(MONTH FROM ${local("v.data")})::int mes, i.quantidade * i."custoUnit" valor
        FROM "VendaItem" i JOIN "Venda" v ON v.id = i."vendaId"
       WHERE v.situacao = 'CONCLUIDA' AND ${local("v.data")} >= ${iniL}::date AND ${local("v.data")} < ${fimL}::date
      UNION ALL
      SELECT EXTRACT(MONTH FROM ${local("o.saida")})::int, i.quantidade * i."custoUnit"
        FROM "OsItemProduto" i JOIN "OrdemServico" o ON o.id = i."osId"
       WHERE o.situacao IN ('CONCLUIDA','FATURADA') AND ${local("o.saida")} >= ${iniL}::date AND ${local("o.saida")} < ${fimL}::date
    ) x GROUP BY mes`;

  const vazio = () => Array(12).fill(0) as number[];
  const porGrupo = new Map<string, Map<string, number[]>>();
  const add = (g: string, cat: string, mes: number, v: number) => {
    const m = porGrupo.get(g) ?? new Map<string, number[]>();
    const arr = m.get(cat) ?? vazio();
    arr[mes - 1] += v;
    m.set(cat, arr);
    porGrupo.set(g, m);
  };
  for (const l of lanc) add(l.grupo, l.categoria, l.mes, l.valor);
  for (const c of cmv) add("CUSTO", "CMV (custo das peças vendidas)", c.mes, c.valor);

  const soma = (a: number[]) => a.reduce((s, x) => s + x, 0);
  const totGrupo = (g: string) => {
    const t = vazio();
    for (const arr of porGrupo.get(g)?.values() ?? []) arr.forEach((v, i) => (t[i] += v));
    return t;
  };
  const combinar = (...partes: [number[], 1 | -1][]) => {
    const t = vazio();
    for (const [arr, s] of partes) arr.forEach((v, i) => (t[i] += s * v));
    return t;
  };

  const linhas: LinhaDre[] = [];
  const resultado = (chave: string, rotulo: string, meses: number[]) =>
    linhas.push({ chave, rotulo, meses, total: soma(meses), nivel: "resultado" });
  const grupo = (g: string) => {
    const def = GRUPOS.find((x) => x.grupo === g)!;
    const t = totGrupo(g);
    linhas.push({ chave: g, rotulo: def.rotulo, meses: t, total: soma(t), nivel: "grupo" });
    for (const [cat, arr] of [...(porGrupo.get(g) ?? new Map()).entries()].sort())
      linhas.push({ chave: `${g}:${cat}`, rotulo: cat, meses: arr, total: soma(arr), nivel: "categoria" });
    return t;
  };

  const rb = grupo("RECEITA_BRUTA");
  const ded = grupo("DEDUCOES");
  const rl = combinar([rb, 1], [ded, -1]);
  resultado("RL", "= Receita líquida", rl);
  const custo = grupo("CUSTO");
  const lb = combinar([rl, 1], [custo, -1]);
  resultado("LB", "= Lucro bruto", lb);
  const desp = grupo("DESPESA_OPERACIONAL");
  const ro = combinar([lb, 1], [desp, -1]);
  resultado("RO", "= Resultado operacional", ro);
  const rf = grupo("RECEITA_FINANCEIRA");
  const df = grupo("DESPESA_FINANCEIRA");
  const or = grupo("OUTRAS_RECEITAS");
  const od = grupo("OUTRAS_DESPESAS");
  const liq = combinar([ro, 1], [rf, 1], [df, -1], [or, 1], [od, -1]);
  resultado("RLIQ", "= Resultado líquido", liq);
  return { ano, regime, linhas, margemLiquida: soma(rb) ? soma(liq) / soma(rb) : 0 };
}
