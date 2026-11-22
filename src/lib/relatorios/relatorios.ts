import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sqlDaLoja } from "@/lib/empresa/loja";
import { atrasada, prazoOs, type PrazoOs } from "@/lib/os/prazo";

/**
 * Relatórios gerenciais. "Vendido" = vendas concretizadas (pela data da venda) + OS concluídas/faturadas
 * (pela data de saída, ou de entrada se não tiver saída), como no painel e na DRE.
 * A receita de cada item já desconta o desconto geral do documento (rateado pelo valor dos itens); o frete
 * não entra (é repasse). Custo = quantidade × custo da peça gravado no item. Serviço não tem custo.
 */
export type Periodo = { de: Date; ate: Date }; // datas civis (meia-noite UTC), inclusive
/** Filtros comuns dos relatórios de venda. A loja vem sempre do contexto (seletor de loja do topo). */
export type FiltroVendas = { vendedorId?: string };

export type ItemVendido = {
  origem: "VENDA" | "OS"; docId: string; numero: number; data: Date; clienteId: string | null; cliente: string | null;
  vendedorId: string | null; vendedor: string | null; tecnicoId: string | null; tecnico: string | null; tipo: "PRODUTO" | "SERVICO";
  /** canal de venda gravado no documento (Presencial, WhatsApp, Mercado Livre…) e o tipo: BALCAO, PEDIDO, SERVICO (venda) ou OS */
  canal: string; tipoDoc: string;
  itemId: string; codigo: string; nome: string; quantidade: number; receita: number; custo: number;
  /** só OS: datas para o prazo (entrada, previsão e saída/faturamento) */
  osEntrada: Date | null; osPrevisao: Date | null; osSaida: Date | null;
};

const local = (col: string) => Prisma.raw(`(${col} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date`);

export async function itensVendidos(p: Periodo, f: FiltroVendas = {}): Promise<ItemVendido[]> {
  const fim = new Date(p.ate.getTime() + 86400000);
  const lv = await sqlDaLoja(`v."empresaId"`), lo = await sqlDaLoja(`o."empresaId"`);
  const vv = f.vendedorId ? Prisma.sql` AND v."vendedorId" = ${f.vendedorId}` : Prisma.empty;
  const vo = f.vendedorId ? Prisma.sql` AND o."vendedorId" = ${f.vendedorId}` : Prisma.empty;
  const rows = await prisma.$queryRaw<ItemVendido[]>`
    WITH docs AS (
      SELECT 'VENDA' origem, v.id, v.numero, ${local("v.data")} dia, v."clienteId", v."vendedorId", NULL::text "tecnicoId", v.canal, v.tipo::text "tipoDoc", v.desconto,
             NULL::timestamp "osEntrada", NULL::timestamp "osPrevisao", NULL::timestamp "osSaida",
             COALESCE((SELECT SUM(subtotal) FROM "VendaItem" WHERE "vendaId" = v.id), 0) + COALESCE((SELECT SUM(subtotal) FROM "VendaItemServico" WHERE "vendaId" = v.id), 0) bruto
        FROM "Venda" v WHERE v.situacao = 'CONCLUIDA' AND ${local("v.data")} >= ${p.de}::date AND ${local("v.data")} < ${fim}::date${lv}${vv}
      UNION ALL
      SELECT 'OS', o.id, o.numero, ${local('COALESCE(o.saida, o.entrada)')}, o."clienteId", o."vendedorId", o."tecnicoId", o.canal, 'OS', o.desconto,
             o.entrada, o.previsao, o.saida,
             COALESCE((SELECT SUM(subtotal) FROM "OsItemProduto" WHERE "osId" = o.id), 0) + COALESCE((SELECT SUM(subtotal) FROM "OsItemServico" WHERE "osId" = o.id), 0)
        FROM "OrdemServico" o WHERE o.situacao IN ('CONCLUIDA','FATURADA') AND ${local('COALESCE(o.saida, o.entrada)')} >= ${p.de}::date AND ${local('COALESCE(o.saida, o.entrada)')} < ${fim}::date${lo}${vo}
    ), itens AS (
      SELECT 'VENDA' origem, i."vendaId" doc, 'PRODUTO' tipo, i."produtoId" item, i.quantidade, i.subtotal, i.quantidade * i."custoUnit" custo FROM "VendaItem" i
      UNION ALL SELECT 'VENDA', s."vendaId", 'SERVICO', s."servicoId", s.quantidade, s.subtotal, 0 FROM "VendaItemServico" s
      UNION ALL SELECT 'OS', i."osId", 'PRODUTO', i."produtoId", i.quantidade, i.subtotal, i.quantidade * i."custoUnit" FROM "OsItemProduto" i
      UNION ALL SELECT 'OS', s."osId", 'SERVICO', s."servicoId", s.quantidade, s.subtotal, 0 FROM "OsItemServico" s
    )
    SELECT d.origem, d.id "docId", d.numero, d.dia::timestamp AT TIME ZONE 'UTC' "data", d."clienteId", c.nome cliente,
           d."vendedorId", u.nome vendedor, d."tecnicoId", t.nome tecnico, d.canal, d."tipoDoc", it.tipo, it.item "itemId",
           d."osEntrada", d."osPrevisao", d."osSaida",
           COALESCE(pr.codigo, sv.codigo, '') codigo, COALESCE(pr.nome, sv.nome, '') nome, it.quantidade::float quantidade,
           (it.subtotal * CASE WHEN d.bruto > 0 THEN GREATEST(d.bruto - d.desconto, 0) / d.bruto ELSE 1 END)::float receita,
           it.custo::float custo
      FROM docs d JOIN itens it ON it.origem = d.origem AND it.doc = d.id
      LEFT JOIN "Pessoa" c ON c.id = d."clienteId"
      LEFT JOIN "Usuario" u ON u.id = d."vendedorId"
      LEFT JOIN "Usuario" t ON t.id = d."tecnicoId"
      LEFT JOIN "Produto" pr ON it.tipo = 'PRODUTO' AND pr.id = it.item
      LEFT JOIN "Servico" sv ON it.tipo = 'SERVICO' AND sv.id = it.item
     ORDER BY d.dia, d.numero`;
  return rows;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Faturamento e lucro ao longo do período: por dia até 62 dias, senão por mês. */
export function evolucao(p: Periodo, itens: { data: Date; receita: number; custo: number }[]) {
  const dias = Math.round((p.ate.getTime() - p.de.getTime()) / 86400000) + 1;
  const porDia = dias <= 62;
  const chaves: string[] = [];
  if (porDia) for (let d = 0; d < dias; d++) chaves.push(new Date(p.de.getTime() + d * 86400000).toISOString().slice(0, 10));
  else {
    // só os meses com movimento no começo (para "todo o período" não abrir 5 anos vazios)
    const primeiro = itens.length ? itens.reduce((m, i) => (new Date(i.data) < m ? new Date(i.data) : m), new Date(p.ate)) : p.de;
    const ini = new Date(Date.UTC(primeiro.getUTCFullYear(), primeiro.getUTCMonth(), 1));
    const agora = new Date();
    const fim = p.ate < agora ? p.ate : agora; // não abre meses futuros vazios
    for (let d = ini; d <= fim; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) chaves.push(d.toISOString().slice(0, 7));
  }
  const m = new Map(chaves.map((c) => [c, { receita: 0, lucro: 0 }]));
  for (const i of itens) {
    const c = new Date(i.data).toISOString().slice(0, porDia ? 10 : 7);
    const g = m.get(c);
    if (g) { g.receita += i.receita; g.lucro += i.receita - i.custo; }
  }
  return { porDia, pontos: chaves.map((c) => ({ chave: c, receita: r2(m.get(c)!.receita), lucro: r2(m.get(c)!.lucro) })) };
}

export type LinhaLucro = { chave: string; rotulo: string; detalhe?: string; href?: string; quantidade: number; receita: number; custo: number; lucro: number; margem: number; documentos: number;
  /** só na visão por venda/OS, para OS: quanto demorou em relação à previsão */
  prazo?: PrazoOs };

export type AgruparLucro = "documento" | "cliente" | "vendedor" | "produto" | "servico";

/** Lucro bruto (receita − custo das peças) do período, agrupado. */
export async function relatorioLucro(p: Periodo, por: AgruparLucro = "documento", f: FiltroVendas = {}) {
  const itens = await itensVendidos(p, f);
  const grupos = new Map<string, LinhaLucro & { docs: Set<string> }>();
  for (const i of itens) {
    if (por === "produto" && i.tipo !== "PRODUTO") continue;
    if (por === "servico" && i.tipo !== "SERVICO") continue;
    const [chave, rotulo, detalhe, href] =
      por === "documento" ? [`${i.origem}:${i.docId}`, `${i.origem === "OS" ? "OS" : "Venda"} nº ${i.numero}`, i.cliente ?? "Sem cliente", i.origem === "OS" ? `/os/${i.docId}` : `/vendas/${i.docId}`]
      : por === "cliente" ? [i.clienteId ?? "-", i.cliente ?? "Sem cliente", undefined, i.clienteId ? `/clientes/${i.clienteId}` : undefined]
      : por === "vendedor" ? [i.vendedorId ?? "-", i.vendedor ?? "Sem vendedor", undefined, undefined]
      : [i.itemId, i.nome, i.codigo, undefined];
    const g = grupos.get(chave) ?? { chave, rotulo, detalhe, href, quantidade: 0, receita: 0, custo: 0, lucro: 0, margem: 0, documentos: 0, docs: new Set<string>(),
      prazo: por === "documento" && i.origem === "OS" && i.osEntrada ? prazoOs({ entrada: i.osEntrada, previsao: i.osPrevisao, saida: i.osSaida }) : undefined };
    g.quantidade += i.quantidade;
    g.receita += i.receita;
    g.custo += i.custo;
    g.docs.add(`${i.origem}:${i.docId}`);
    grupos.set(chave, g);
  }
  const linhas: LinhaLucro[] = [...grupos.values()].map(({ docs, ...g }) => ({
    ...g, quantidade: Math.round(g.quantidade * 1e4) / 1e4, receita: r2(g.receita), custo: r2(g.custo), lucro: r2(g.receita - g.custo),
    margem: g.receita > 0 ? (g.receita - g.custo) / g.receita : 0, documentos: docs.size,
  }));
  linhas.sort((a, b) => (por === "documento" ? 0 : b.receita - a.receita));
  const docs = new Set(itens.map((i) => `${i.origem}:${i.docId}`));
  const receita = r2(itens.reduce((s, i) => s + i.receita, 0));
  const custo = r2(itens.reduce((s, i) => s + i.custo, 0));
  const produtos = r2(itens.filter((i) => i.tipo === "PRODUTO").reduce((s, i) => s + i.receita, 0));
  // OS do período que passaram da previsão (conta uma vez por OS, em qualquer visão)
  const osDoPeriodo = new Map<string, PrazoOs>();
  for (const i of itens) if (i.origem === "OS" && i.osEntrada && !osDoPeriodo.has(i.docId)) osDoPeriodo.set(i.docId, prazoOs({ entrada: i.osEntrada, previsao: i.osPrevisao, saida: i.osSaida }));
  const fora = [...osDoPeriodo.values()].filter(atrasada);
  return {
    linhas,
    prazo: { os: osDoPeriodo.size, atrasadas: fora.length, mediaDias: fora.length ? Math.round(fora.reduce((s, p) => s + p.dias, 0) / fora.length) : 0, maiorDias: fora.reduce((m, p) => Math.max(m, p.dias), 0) },
    evolucao: evolucao(p, itens),
    totais: { documentos: docs.size, receita, custo, lucro: r2(receita - custo), margem: receita > 0 ? (receita - custo) / receita : 0, ticket: docs.size ? r2(receita / docs.size) : 0, produtos, servicos: r2(receita - produtos) },
  };
}

export type CriterioAbc = "valor" | "quantidade" | "lucro";
export type LinhaAbc = { chave: string; rotulo: string; detalhe?: string; valor: number; quantidade: number; lucro: number; base: number; pct: number; acumulado: number; classe: "A" | "B" | "C" };

/** Curva ABC: A = itens que somam os primeiros 80% do critério, B = até 95%, C = o resto. */
export function classificarAbc<T extends { base: number }>(linhas: T[], limiteA = 0.8, limiteB = 0.95) {
  const ord = [...linhas].sort((a, b) => b.base - a.base);
  const total = ord.reduce((s, l) => s + Math.max(l.base, 0), 0);
  let acum = 0;
  return ord.map((l) => {
    const antes = acum;
    acum += Math.max(l.base, 0);
    const pct = total ? Math.max(l.base, 0) / total : 0;
    // o item entra na classe da faixa em que COMEÇA (o primeiro item é sempre A)
    const classe: "A" | "B" | "C" = total && antes / total < limiteA ? "A" : total && antes / total < limiteB ? "B" : "C";
    return { ...l, pct, acumulado: total ? acum / total : 0, classe };
  });
}

export async function curvaAbc(p: Periodo, por: "produtos" | "clientes" | "servicos", criterio: CriterioAbc = "valor", f: FiltroVendas = {}) {
  const itens = (await itensVendidos(p, f)).filter((i) => (por === "produtos" ? i.tipo === "PRODUTO" : por === "servicos" ? i.tipo === "SERVICO" : true));
  const m = new Map<string, { chave: string; rotulo: string; detalhe?: string; valor: number; quantidade: number; lucro: number }>();
  for (const i of itens) {
    const chave = por === "clientes" ? i.clienteId ?? "-" : i.itemId;
    const g = m.get(chave) ?? { chave, rotulo: por === "clientes" ? i.cliente ?? "Sem cliente" : i.nome, detalhe: por === "clientes" ? undefined : i.codigo, valor: 0, quantidade: 0, lucro: 0 };
    g.valor += i.receita; g.quantidade += i.quantidade; g.lucro += i.receita - i.custo;
    m.set(chave, g);
  }
  const linhas = classificarAbc([...m.values()].map((g) => ({ ...g, valor: r2(g.valor), lucro: r2(g.lucro), base: criterio === "quantidade" ? g.quantidade : criterio === "lucro" ? g.lucro : g.valor })));
  const resumo = (["A", "B", "C"] as const).map((c) => {
    const ls = linhas.filter((l) => l.classe === c);
    return { classe: c, itens: ls.length, base: ls.reduce((s, l) => s + l.base, 0), pctItens: linhas.length ? ls.length / linhas.length : 0 };
  });
  return { linhas: linhas as LinhaAbc[], resumo };
}

// ───────────── comissões ─────────────

export type LinhaComissao = {
  origem: "VENDA" | "OS"; docId: string; numero: number; data: Date; cliente: string | null; base: number; percentual: number;
  comissao: number; recebido: number; totalReceber: number; liberada: number; regra: string;
};

const REGRA: Record<string, string> = {
  GERADO_FINANCEIRO: "integral ao gerar o financeiro", PRIMEIRA_PARCELA: "integral ao receber a 1ª parcela",
  ULTIMA_PARCELA: "integral ao receber a última parcela", PARCIAL: "proporcional ao recebido",
};

/**
 * Comissão por funcionário: vendas (vendedor) e OS (vendedor; se a OS não tem vendedor, o técnico).
 * Base = valor dos itens com o desconto geral (sem frete). % do cadastro do funcionário.
 * Liberação conforme o cadastro: integral ao gerar financeiro, na 1ª parcela, na última, ou proporcional ao recebido.
 */
export async function relatorioComissoes(p: Periodo, usuarioId?: string) {
  const itens = await itensVendidos(p);
  const docs = new Map<string, { origem: "VENDA" | "OS"; docId: string; numero: number; data: Date; cliente: string | null; funcionario: string | null; base: number }>();
  for (const i of itens) {
    const k = `${i.origem}:${i.docId}`;
    const d = docs.get(k) ?? { origem: i.origem, docId: i.docId, numero: i.numero, data: i.data, cliente: i.cliente, funcionario: i.vendedorId ?? (i.origem === "OS" ? i.tecnicoId : null), base: 0 };
    d.base += i.receita;
    docs.set(k, d);
  }
  const usuarios = await prisma.usuario.findMany({ where: { id: { in: [...new Set([...docs.values()].map((d) => d.funcionario).filter(Boolean) as string[])] } }, select: { id: true, nome: true, comissao: true, liberacaoComissao: true } });
  const lancs = await prisma.lancamento.findMany({
    where: { tipo: "RECEBER", OR: [{ origemTipo: "VENDA", origemId: { in: [...docs.values()].filter((d) => d.origem === "VENDA").map((d) => d.docId) } }, { origemTipo: "OS", origemId: { in: [...docs.values()].filter((d) => d.origem === "OS").map((d) => d.docId) } }] },
    select: { origemTipo: true, origemId: true, parcela: true, valor: true, valorPago: true, pagoEm: true },
    orderBy: { parcela: "asc" },
  });
  const porFunc = new Map<string, { usuarioId: string; nome: string; percentual: number; regra: string; linhas: LinhaComissao[] }>();
  for (const d of docs.values()) {
    if (!d.funcionario || (usuarioId && d.funcionario !== usuarioId)) continue;
    const u = usuarios.find((x) => x.id === d.funcionario);
    if (!u) continue;
    const pct = Number(u.comissao ?? 0);
    const ls = lancs.filter((l) => l.origemTipo === d.origem && l.origemId === d.docId);
    const total = ls.reduce((s, l) => s + Number(l.valor), 0);
    const recebido = ls.reduce((s, l) => s + (l.pagoEm ? Number(l.valor) : 0), 0);
    const comissao = r2((d.base * pct) / 100);
    const lib = u.liberacaoComissao;
    const fracao = !ls.length ? 0
      : lib === "GERADO_FINANCEIRO" ? 1
      : lib === "PRIMEIRA_PARCELA" ? (ls[0].pagoEm ? 1 : 0)
      : lib === "ULTIMA_PARCELA" ? (ls.every((l) => l.pagoEm) ? 1 : 0)
      : total > 0 ? Math.min(1, recebido / total) : 0;
    const f = porFunc.get(u.id) ?? { usuarioId: u.id, nome: u.nome, percentual: pct, regra: REGRA[lib], linhas: [] };
    f.linhas.push({ origem: d.origem, docId: d.docId, numero: d.numero, data: d.data, cliente: d.cliente, base: r2(d.base), percentual: pct, comissao, recebido: r2(recebido), totalReceber: r2(total), liberada: r2(comissao * fracao), regra: REGRA[lib] });
    porFunc.set(u.id, f);
  }
  return [...porFunc.values()].map((f) => ({
    ...f, base: r2(f.linhas.reduce((s, l) => s + l.base, 0)), comissao: r2(f.linhas.reduce((s, l) => s + l.comissao, 0)), liberada: r2(f.linhas.reduce((s, l) => s + l.liberada, 0)),
  })).sort((a, b) => b.comissao - a.comissao);
}

// ───────────── tempo de OS ─────────────

export type TempoSituacao = { situacao: string; horas: number; vezes: number; media: number };

/**
 * Situação × tempo: para as OS que saíram no período, quanto tempo cada uma ficou em cada situação
 * (pelo histórico de mudanças) e o tempo total da entrada até a saída, também por técnico.
 */
export async function tempoOs(p: Periodo) {
  const fim = new Date(p.ate.getTime() + 86400000);
  const oss = await prisma.ordemServico.findMany({
    where: { situacao: { in: ["CONCLUIDA", "FATURADA"] }, saida: { gte: new Date(p.de.getTime() + 3 * 3600000), lt: new Date(fim.getTime() + 3 * 3600000) } },
    select: { id: true, numero: true, entrada: true, saida: true, previsao: true, tecnico: { select: { id: true, nome: true } }, cliente: { select: { nome: true } },
      historico: { where: { situacao: { not: null } }, orderBy: { createdAt: "asc" }, select: { situacao: true, createdAt: true } } },
    orderBy: { saida: "asc" },
  });
  const porSit = new Map<string, { horas: number; vezes: number }>();
  const porTec = new Map<string, { tecnico: string; os: number; horas: number; atrasadas: number }>();
  const linhas = oss.map((o) => {
    const horas = (o.saida!.getTime() - o.entrada.getTime()) / 3600000;
    const marcos = o.historico.filter((h, i, a) => i === 0 || h.situacao !== a[i - 1].situacao);
    for (let i = 0; i < marcos.length; i++) {
      const ini = marcos[i].createdAt, ate = i + 1 < marcos.length ? marcos[i + 1].createdAt : o.saida!;
      if (ate <= ini) continue;
      const s = porSit.get(marcos[i].situacao!) ?? { horas: 0, vezes: 0 };
      s.horas += (ate.getTime() - ini.getTime()) / 3600000; s.vezes += 1;
      porSit.set(marcos[i].situacao!, s);
    }
    const atrasada = !!o.previsao && o.saida! > o.previsao;
    const t = porTec.get(o.tecnico?.id ?? "-") ?? { tecnico: o.tecnico?.nome ?? "Sem técnico", os: 0, horas: 0, atrasadas: 0 };
    t.os += 1; t.horas += horas; if (atrasada) t.atrasadas += 1;
    porTec.set(o.tecnico?.id ?? "-", t);
    return { id: o.id, numero: o.numero, cliente: o.cliente.nome, tecnico: o.tecnico?.nome ?? null, entrada: o.entrada, saida: o.saida!, previsao: o.previsao, horas, atrasada };
  });
  const ordenadas = linhas.map((l) => l.horas).sort((a, b) => a - b);
  const mediana = ordenadas.length ? (ordenadas.length % 2 ? ordenadas[(ordenadas.length - 1) / 2] : (ordenadas[ordenadas.length / 2 - 1] + ordenadas[ordenadas.length / 2]) / 2) : 0;
  return {
    linhas,
    situacoes: [...porSit.entries()].map(([situacao, s]) => ({ situacao, horas: s.horas, vezes: s.vezes, media: s.horas / s.vezes })).sort((a, b) => b.horas - a.horas) as TempoSituacao[],
    tecnicos: [...porTec.values()].map((t) => ({ ...t, media: t.horas / t.os })).sort((a, b) => b.os - a.os),
    resumo: { os: linhas.length, mediaHoras: linhas.length ? linhas.reduce((s, l) => s + l.horas, 0) / linhas.length : 0, medianaHoras: mediana, atrasadas: linhas.filter((l) => l.atrasada).length },
  };
}

/** "3 d 4 h", "5 h 20 min". */
export function duracao(horas: number) {
  if (!(horas > 0)) return "—";
  const min = Math.round(horas * 60);
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return d ? `${d} d ${h} h` : h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}
