import { todasAsLojas } from "@/lib/empresa/loja";
import { prisma } from "@/lib/db";
import { diaSP } from "@/lib/datas";
import { normalizar } from "@/lib/migracao/planilha";

/**
 * Análise do extrato para a conciliação: para cada linha pendente diz o que fazer (baixar uma conta em aberto ou
 * lançar como despesa/receita avulsa), com a confiança da sugestão, o centro de custo e a categoria aprendidos com o
 * que já foi conciliado antes (mesmo favorecido), e a urgência pelo prazo (conta vencida ou vencendo, linha antiga,
 * mês já fechado).
 *
 * Regra do Luiz: conta a RECEBER não é baixada só por valor e data. Sem o nome do pagador batendo (ou o histórico dizendo
 * que aquele favorecido é aquele cliente), a sugestão de baixa de conta a receber fica com confiança baixa.
 */

const DIA = 86400000;

export type Acao = "BAIXAR" | "LANCAR" | "REVISAR";
export type Nivel = "alta" | "media" | "baixa";
export type Urgencia = "urgente" | "atencao" | "normal";

export type Candidato = {
  lancamentoId: string;
  descricao: string;
  pessoa: string | null;
  valor: number;
  vencimento: string; // AAAA-MM-DD
  confianca: number; // 0 a 99
  motivos: string[];
  centroCustoId: string | null;
};

export type LinhaAnalise = {
  transacaoId: string;
  data: string; // AAAA-MM-DD
  valor: number;
  descricao: string;
  favorecido: string;
  conta: string;
  contaBancariaId: string;
  tipo: "PAGAR" | "RECEBER";
  acao: Acao;
  confianca: number;
  nivel: Nivel;
  motivos: string[];
  candidatos: Candidato[]; // o sugerido primeiro
  lancamentoId: string | null;
  categoriaId: string | null;
  centroCustoId: string | null;
  urgencia: Urgencia;
  pontosUrgencia: number;
  prazo: string; // texto curto do prazo que pesa ("vencida há 12 dias", "pendente há 40 dias")
  diasPendente: number;
};

// ---------- favorecido

// prefixos de operação que os bancos põem antes do nome (Inter: "Pix recebido - Fulano - Fulano")
const OPERACAO = /^(pix|ted|doc|tev|transferencia|pagamento|pagto|pgto|boleto|compra|debito|credito|deposito|recebimento|saque|estorno|tarifa|cobranca|liquidacao|envio|enviado|recebido|efetuado|de|cartao|no|na|do|da|em|via|conta|automatico|aut)(\s|$)/;

/** Nome de quem pagou/recebeu, tirado da descrição do extrato, normalizado (sem acento, minúsculo, sem números). */
export function favorecido(descricao: string): string {
  const partes = descricao.split(/\s+-\s+|\s*\|\s*/).map((p) => normalizar(p).replace(/\b\d+\b/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  // descarta partes que são só a operação ("pix recebido", "boleto de cobranca recebido")
  const nomes = partes.filter((p) => {
    let s = p;
    while (OPERACAO.test(s)) s = s.replace(OPERACAO, "").trim();
    return s.length >= 3;
  });
  const limpa = (p: string) => { let s = p; while (OPERACAO.test(s)) s = s.replace(OPERACAO, "").trim(); return s; };
  const escolhido = nomes.length ? limpa(nomes[0]) : partes.map(limpa).join(" ");
  return escolhido.split(" ").slice(0, 6).join(" ");
}

const PALAVRAS_VAZIAS = /^(ltda|eireli|epp|me|sa|s a|comercio|servicos|servico|transferencia|pagamento|recebido|enviado|boleto|compra|venda|ordem|cobranca|efetuado|pix|de|da|do|das|dos|e|em)$/;
const palavras = (s: string) => new Set(normalizar(s).split(" ").filter((p) => p.length >= 3 && !/^\d+$/.test(p) && !PALAVRAS_VAZIAS.test(p)));

/** Quantas palavras do nome da conta (pessoa + descrição) aparecem na descrição do extrato. */
export function palavrasEmComum(extrato: string, alvo: string) {
  const pt = palavras(extrato);
  let n = 0;
  for (const p of palavras(alvo)) if (pt.has(p)) n++;
  return n;
}

// ---------- histórico

export type Historico = {
  /** favorecido → contagens do que foi feito com ele antes */
  porFavorecido: Map<string, { n: number; categorias: Map<string, number>; centros: Map<string, number>; pessoas: Map<string, number>; avulsos: number }>;
  /** pessoa → centros de custo usados nas contas dela */
  centroPorPessoa: Map<string, Map<string, number>>;
  /** categoria → centro de custo mais usado */
  centroPorCategoria: Map<string, Map<string, number>>;
};

const somar = (m: Map<string, number>, k: string | null | undefined, n = 1) => { if (k) m.set(k, (m.get(k) ?? 0) + n); };
function maisUsado(m: Map<string, number> | undefined): { id: string; n: number; parte: number } | null {
  if (!m || !m.size) return null;
  let total = 0, melhor: [string, number] | null = null;
  for (const [k, v] of m) { total += v; if (!melhor || v > melhor[1]) melhor = [k, v]; }
  return melhor ? { id: melhor[0], n: melhor[1], parte: melhor[1] / total } : null;
}

export function montarHistorico(
  conciliadas: { descricao: string; lancamentos: { pessoaId: string | null; categoriaId: string; centroCustoId: string | null; avulso: boolean }[] }[],
  lancamentos: { pessoaId: string | null; categoriaId: string; centroCustoId: string | null }[],
): Historico {
  const h: Historico = { porFavorecido: new Map(), centroPorPessoa: new Map(), centroPorCategoria: new Map() };
  for (const t of conciliadas) {
    const f = favorecido(t.descricao);
    if (!f || !t.lancamentos.length) continue;
    const e = h.porFavorecido.get(f) ?? { n: 0, categorias: new Map(), centros: new Map(), pessoas: new Map(), avulsos: 0 };
    e.n++;
    for (const l of t.lancamentos) {
      somar(e.categorias, l.categoriaId);
      somar(e.centros, l.centroCustoId);
      somar(e.pessoas, l.pessoaId);
      if (l.avulso) e.avulsos++;
    }
    h.porFavorecido.set(f, e);
  }
  for (const l of lancamentos) {
    if (!l.centroCustoId) continue;
    if (l.pessoaId) { const m = h.centroPorPessoa.get(l.pessoaId) ?? new Map(); somar(m, l.centroCustoId); h.centroPorPessoa.set(l.pessoaId, m); }
    const m = h.centroPorCategoria.get(l.categoriaId) ?? new Map(); somar(m, l.centroCustoId); h.centroPorCategoria.set(l.categoriaId, m);
  }
  return h;
}

// ---------- regras por palavra (quando não há histórico)

const REGRAS: { re: RegExp; tipo: "PAGAR" | "RECEBER"; categoria: string }[] = [
  { re: /\b(tarifa|cesta|pacote de servicos|manutencao de conta|taxa de manutencao|anuidade)\b/, tipo: "PAGAR", categoria: "Tarifas bancárias e taxas de cartão" },
  { re: /\b(iof|juros|mora|encargos)\b/, tipo: "PAGAR", categoria: "Juros pagos" },
  { re: /\b(das|simples nacional|darf|icms|iss|issqn)\b/, tipo: "PAGAR", categoria: "Impostos sobre vendas (DAS/ICMS/ISS)" },
  { re: /\b(rendimento|remuneracao|rend pago|aplicacao|cdb|juros recebidos)\b/, tipo: "RECEBER", categoria: "Receitas financeiras" },
];

// ---------- análise

export type TransacaoAnalise = { id: string; data: Date; valor: number; descricao: string; conta: string; contaBancariaId: string };
export type AbertoAnalise = { id: string; tipo: "PAGAR" | "RECEBER"; valor: number; vencimento: Date; descricao: string; pessoa: string | null; pessoaId: string | null; categoriaId: string; centroCustoId: string | null };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const nivelDe = (c: number): Nivel => (c >= 80 ? "alta" : c >= 60 ? "media" : "baixa");

/** Pontua um par extrato × conta em aberto (0 a 99) e diz por quê. Null quando o valor não serve. */
export function pontuar(t: TransacaoAnalise, l: AbertoAnalise, h: Historico, f: string): { confianca: number; motivos: string[]; nome: boolean } | null {
  const tipo = t.valor < 0 ? "PAGAR" : "RECEBER";
  if (l.tipo !== tipo) return null;
  const v = Math.abs(t.valor);
  const dif = Math.abs(v - l.valor);
  const dias = Math.round((t.data.getTime() - l.vencimento.getTime()) / DIA); // positivo = pago depois do vencimento
  if (dias < -30 || dias > 90) return null;
  const motivos: string[] = [];
  let p = 0;
  if (dif <= 0.009) { p += 45; motivos.push("mesmo valor"); }
  else if (dif <= v * 0.02 + 0.01) { p += 30; motivos.push(`valor ${v > l.valor ? "com juros" : "com desconto"} de ${dif.toFixed(2).replace(".", ",")}`); }
  else if (dif <= v * 0.1 + 0.01) { p += 12; motivos.push("valor parecido (até 10%)"); }
  else return null;

  const comum = palavrasEmComum(t.descricao, `${l.pessoa ?? ""} ${l.descricao}`);
  const hist = h.porFavorecido.get(f);
  const pessoaHist = !!(l.pessoaId && hist?.pessoas.get(l.pessoaId));
  const nome = comum > 0 || pessoaHist;
  if (pessoaHist) { p += 35; motivos.push("favorecido já foi conciliado com esta pessoa"); }
  else if (comum >= 2) { p += 35; motivos.push("nome bate"); }
  else if (comum === 1) { p += 25; motivos.push("nome parecido"); }

  const ad = Math.abs(dias);
  if (ad <= 3) { p += 15; motivos.push(dias === 0 ? "no dia do vencimento" : `${ad} dia${ad > 1 ? "s" : ""} do vencimento`); }
  else if (ad <= 10) { p += 10; motivos.push(`${ad} dias do vencimento`); }
  else if (ad <= 30) { p += 5; motivos.push(`${ad} dias do vencimento`); }
  else motivos.push(`${ad} dias do vencimento`);

  // conta a receber: valor e data não dizem quem pagou
  if (tipo === "RECEBER" && !nome) { p = Math.min(p, 55); motivos.push("pagador não identificado: confira"); }
  return { confianca: Math.min(99, p), motivos, nome };
}

export function analisar(
  transacoes: TransacaoAnalise[],
  abertos: AbertoAnalise[],
  h: Historico,
  categorias: { id: string; nome: string; tipo: "PAGAR" | "RECEBER" }[],
  hoje: Date = diaSP(),
): LinhaAnalise[] {
  // 1) candidatos de cada linha
  const cands = new Map<string, Candidato[]>();
  const favs = new Map<string, string>();
  const pares: { t: string; l: string; c: number }[] = [];
  for (const t of transacoes) {
    const f = favorecido(t.descricao);
    favs.set(t.id, f);
    const lista: Candidato[] = [];
    for (const l of abertos) {
      const r = pontuar(t, l, h, f);
      if (!r) continue;
      lista.push({ lancamentoId: l.id, descricao: l.descricao, pessoa: l.pessoa, valor: l.valor, vencimento: iso(l.vencimento), confianca: r.confianca, motivos: r.motivos, centroCustoId: l.centroCustoId });
    }
    // único com o mesmo valor: mais um pouco de confiança
    const exatos = lista.filter((c) => Math.abs(c.valor - Math.abs(t.valor)) <= 0.009);
    if (exatos.length === 1 && exatos[0].confianca >= 50 && !exatos[0].motivos.some((m) => m.startsWith("pagador"))) { exatos[0].confianca = Math.min(99, exatos[0].confianca + 5); exatos[0].motivos.push("única conta com este valor"); }
    lista.sort((a, b) => b.confianca - a.confianca || a.vencimento.localeCompare(b.vencimento));
    cands.set(t.id, lista.slice(0, 12));
    for (const c of lista) pares.push({ t: t.id, l: c.lancamentoId, c: c.confianca });
  }
  // 2) cada conta é sugerida para uma linha só: as melhores combinações primeiro
  pares.sort((a, b) => b.c - a.c);
  const escolhido = new Map<string, string>();
  const usados = new Set<string>();
  for (const p of pares) {
    if (escolhido.has(p.t) || usados.has(p.l)) continue;
    escolhido.set(p.t, p.l);
    usados.add(p.l);
  }

  const abertoPor = new Map(abertos.map((l) => [l.id, l]));
  const catPorNome = new Map(categorias.map((c) => [`${c.tipo}|${c.nome}`, c.id]));
  const catTipo = new Map(categorias.map((c) => [c.id, c.tipo]));

  return transacoes.map((t) => {
    const tipo = t.valor < 0 ? "PAGAR" : "RECEBER";
    const f = favs.get(t.id)!;
    const hist = h.porFavorecido.get(f);
    const lista = cands.get(t.id) ?? [];
    const escolhidoId = escolhido.get(t.id);
    const melhor = escolhidoId ? lista.find((c) => c.lancamentoId === escolhidoId)! : null;
    const candidatos = melhor ? [melhor, ...lista.filter((c) => c !== melhor)] : lista;

    // sugestão de lançamento avulso: histórico do favorecido, senão palavras da descrição
    let avulso: { categoriaId: string; confianca: number; motivo: string } | null = null;
    const catHist = maisUsado(hist ? new Map([...hist.categorias].filter(([id]) => catTipo.get(id) === tipo)) : undefined);
    if (catHist) {
      const c = Math.round(Math.min(95, 50 + 15 * catHist.n) * (0.4 + 0.6 * catHist.parte));
      avulso = { categoriaId: catHist.id, confianca: c, motivo: `${catHist.n}× lançado nesta categoria antes` };
    } else {
      const d = normalizar(t.descricao);
      const r = REGRAS.find((x) => x.tipo === tipo && x.re.test(d));
      const id = r ? catPorNome.get(`${tipo}|${r.categoria}`) : undefined;
      if (r && id) avulso = { categoriaId: id, confianca: 70, motivo: "pela descrição do extrato" };
    }

    let acao: Acao = "REVISAR", confianca = 0, motivos: string[] = [], lancamentoId: string | null = null, categoriaId: string | null = null;
    // favorecido que sempre foi lançado avulso (tarifa, assinatura) não vira baixa de conta parecida por acaso
    const sempreAvulso = !!hist && hist.avulsos >= hist.n && hist.n >= 2;
    if (melhor && melhor.confianca >= 60 && !(sempreAvulso && avulso && avulso.confianca > melhor.confianca)) {
      acao = "BAIXAR"; confianca = melhor.confianca; motivos = melhor.motivos; lancamentoId = melhor.lancamentoId;
    } else if (avulso && avulso.confianca >= 50) {
      acao = "LANCAR"; confianca = avulso.confianca; motivos = [avulso.motivo]; categoriaId = avulso.categoriaId;
    } else if (melhor) {
      acao = "BAIXAR"; confianca = melhor.confianca; motivos = melhor.motivos; lancamentoId = melhor.lancamentoId;
    } else if (avulso) {
      acao = "LANCAR"; confianca = avulso.confianca; motivos = [avulso.motivo]; categoriaId = avulso.categoriaId;
    }
    if (!categoriaId && avulso) categoriaId = avulso.categoriaId; // já deixa a categoria escolhida se a pessoa trocar para "lançar"

    // centro de custo: o da conta > o que este favorecido usou > o da pessoa da conta > o mais usado na categoria
    const conta = lancamentoId ? abertoPor.get(lancamentoId) : null;
    const ccFav = maisUsado(hist?.centros);
    const ccPessoa = conta?.pessoaId ? maisUsado(h.centroPorPessoa.get(conta.pessoaId)) : null;
    const catFinal = conta?.categoriaId ?? categoriaId;
    // pela categoria só quando é um padrão claro (2 vezes ou mais e na maioria das contas dela)
    const ccCatBruto = catFinal ? maisUsado(h.centroPorCategoria.get(catFinal)) : null;
    const ccCat = ccCatBruto && ccCatBruto.n >= 2 && ccCatBruto.parte >= 0.6 ? ccCatBruto : null;
    const centroCustoId = conta?.centroCustoId ?? ccFav?.id ?? ccPessoa?.id ?? ccCat?.id ?? null;

    // urgência
    const diasPendente = Math.max(0, Math.round((hoje.getTime() - t.data.getTime()) / DIA));
    let pontos = 0;
    let prazo = diasPendente ? `pendente há ${diasPendente} dia${diasPendente > 1 ? "s" : ""}` : "de hoje";
    const avisos: string[] = [];
    // prazo da conta só pesa quando a sugestão é confiável (senão a conta pode nem ser desta linha)
    if (conta && acao === "BAIXAR" && confianca >= 60) {
      const atraso = Math.round((hoje.getTime() - conta.vencimento.getTime()) / DIA);
      if (atraso > 0) {
        pontos += tipo === "RECEBER" ? 50 : 40;
        prazo = `conta vencida há ${atraso} dia${atraso > 1 ? "s" : ""}`;
        avisos.push(tipo === "RECEBER" ? "a conta aparece vencida: o cliente pode receber cobrança de algo que já pagou" : "a conta aparece vencida e em aberto: risco de pagar de novo");
      } else if (atraso >= -7) {
        pontos += 30;
        prazo = atraso === 0 ? "conta vence hoje" : `conta vence em ${-atraso} dia${atraso < -1 ? "s" : ""}`;
        avisos.push(tipo === "PAGAR" ? "vence logo: baixe para não pagar de novo" : "vence logo: baixe para não sair aviso de cobrança");
      }
    }
    if (diasPendente >= 60) pontos += 35;
    else if (diasPendente >= 30) pontos += 25;
    else if (diasPendente >= 15) pontos += 10;
    const mesLinha = iso(t.data).slice(0, 7), mesHoje = iso(hoje).slice(0, 7);
    if (mesLinha < mesHoje && hoje.getUTCDate() >= 5) { pontos += 10; avisos.push(`mês ${mesLinha.slice(5)}/${mesLinha.slice(0, 4)} já fechou: DRE e contador ficam errados`); }
    const urgencia: Urgencia = pontos >= 60 ? "urgente" : pontos >= 30 ? "atencao" : "normal";

    return {
      transacaoId: t.id, data: iso(t.data), valor: t.valor, descricao: t.descricao, favorecido: f, conta: t.conta, contaBancariaId: t.contaBancariaId, tipo,
      acao, confianca, nivel: nivelDe(confianca), motivos: [...motivos, ...avisos], candidatos, lancamentoId, categoriaId, centroCustoId,
      urgencia, pontosUrgencia: pontos, prazo, diasPendente,
    };
  });
}

/** Carrega extrato pendente, contas em aberto e histórico e devolve a análise de cada linha. */
export async function analisarExtrato(filtro: { contaBancariaId?: string } = {}) {
  const ts = await prisma.transacaoBancaria.findMany({
    where: { situacao: "PENDENTE", ...(filtro.contaBancariaId ? { contaBancariaId: filtro.contaBancariaId } : {}) },
    include: { contaBancaria: { select: { nome: true } } },
    orderBy: [{ data: "asc" }, { createdAt: "asc" }],
    take: 2000,
  });
  if (!ts.length) return [];
  const min = new Date(ts[0].data.getTime() - 90 * DIA);
  const max = new Date(ts[ts.length - 1].data.getTime() + 30 * DIA);
  // a conta bancária é de todas as lojas: procura e aprende em todas
  const [abertos, conciliadas, comCentro, categorias] = await todasAsLojas(() => Promise.all([
    prisma.lancamento.findMany({ where: { pagoEm: null, transferenciaId: null, vencimento: { gte: min, lte: max } }, include: { pessoa: { select: { nome: true, fantasia: true } } } }),
    prisma.transacaoBancaria.findMany({
      where: { situacao: "CONCILIADA" }, orderBy: { data: "desc" }, take: 3000,
      select: { id: true, descricao: true, lancamentos: { select: { pessoaId: true, categoriaId: true, centroCustoId: true, idLegado: true } } },
    }),
    prisma.lancamento.findMany({ where: { centroCustoId: { not: null } }, orderBy: { vencimento: "desc" }, take: 5000, select: { pessoaId: true, categoriaId: true, centroCustoId: true } }),
    prisma.categoriaFinanceira.findMany({ where: { ativa: true }, select: { id: true, nome: true, tipo: true } }),
  ]));
  const h = montarHistorico(
    conciliadas.map((t) => ({ descricao: t.descricao, lancamentos: t.lancamentos.map((l) => ({ ...l, avulso: l.idLegado === `extrato:${t.id}` })) })),
    comCentro,
  );
  return analisar(
    ts.map((t) => ({ id: t.id, data: t.data, valor: Number(t.valor), descricao: t.descricao, conta: t.contaBancaria.nome, contaBancariaId: t.contaBancariaId })),
    abertos.map((l) => ({
      id: l.id, tipo: l.tipo, valor: Number(l.valor), vencimento: l.vencimento, descricao: l.descricao,
      pessoa: l.pessoa ? [l.pessoa.nome, l.pessoa.fantasia].filter(Boolean).join(" / ") : null, pessoaId: l.pessoaId, categoriaId: l.categoriaId, centroCustoId: l.centroCustoId,
    })),
    h, categorias,
  );
}
