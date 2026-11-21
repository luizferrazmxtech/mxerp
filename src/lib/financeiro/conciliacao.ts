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
  /** ramo de atividade do favorecido, quando conhecido ("6920-6/01 contabilidade / jurídico") */
  ramo: string | null;
  /** CNPJ/CPF do favorecido, quando conhecido */
  documentoFavorecido: string | null;
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

// palavras que aparecem em nome de muita empresa e não identificam ninguém sozinhas
const PALAVRAS_VAZIAS = /^(ltda|eireli|epp|me|mei|sa|s a|cia|comercio|comercial|servicos|servico|transferencia|pagamento|recebido|enviado|boleto|compra|venda|ordem|cobranca|efetuado|pix|de|da|do|das|dos|e|em|organizacao|organizacoes|contabil|contabilidade|industria|industrial|solucoes|tecnologia|brasil|brasileira|grupo|empresa|empresas|associacao|condominio|residencial|residence|edificio|transportes|transporte|distribuidora|sistemas|consultoria|engenharia|administracao|administradora|servicos|holding|participacoes|representacoes|importacao|exportacao|nacional|sociedade|filho|junior|neto|sobrinho|santos|silva|souza|oliveira|pereira|costa|ferreira|rodrigues|almeida|lima|gomes|ribeiro|carvalho|martins)$/;
const palavras = (s: string) => new Set(normalizar(s).split(" ").filter((p) => p.length >= 3 && !/^\d+$/.test(p) && !PALAVRAS_VAZIAS.test(p)));

/**
 * O nome do cliente/fornecedor está no extrato? Precisa de duas palavras próprias em comum (sobrenome comum e
 * palavras de razão social como "organização", "contábil", "ltda" não contam), ou de uma quando o nome só tem uma.
 */
export function nomeConfere(extrato: string, nome: string | null | undefined): boolean {
  if (!nome) return false;
  const alvo = palavras(nome);
  if (!alvo.size) return false;
  const pt = palavras(extrato);
  const comuns = [...alvo].filter((p) => pt.has(p));
  if (comuns.length >= 2) return true;
  if (comuns.length !== 1) return false;
  // uma palavra só: vale quando o nome tem uma palavra própria, ou quando o extrato traz só essa palavra
  // (descrição cortada, "BOLETO PASSALACQUA") e ela é longa o bastante para não ser um nome comum
  const doExtrato = favorecido(extrato).split(" ").filter(Boolean);
  return (alvo.size === 1 && comuns[0].length >= 4) || (doExtrato.length === 1 && doExtrato[0] === comuns[0] && comuns[0].length >= 6);
}

/** CPFs/CNPJs (só dígitos) escritos na descrição ou no documento do extrato. */
export function documentosNoTexto(...textos: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const t of textos) {
    if (!t) continue;
    for (const m of t.matchAll(/\d[\d./-]{9,19}\d/g)) {
      const d = m[0].replace(/\D/g, "");
      if (d.length === 11 || d.length === 14) out.add(d);
    }
  }
  return [...out];
}

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

// ---------- ramo de atividade (CNAE) → categoria de despesa

/**
 * Categoria padrão para despesa paga a uma empresa de cada ramo (pelos 2 a 4 primeiros dígitos do CNAE, o mais
 * específico ganha). Nomes das categorias padrão do sistema (padroes.ts); se a categoria não existir, a regra é pulada.
 */
export const RAMOS: { prefixo: string; ramo: string; categoria: string }[] = [
  { prefixo: "4731", ramo: "posto de combustível", categoria: "Combustível e veículos" },
  { prefixo: "4732", ramo: "lubrificantes", categoria: "Combustível e veículos" },
  { prefixo: "45", ramo: "veículos e peças", categoria: "Combustível e veículos" },
  { prefixo: "4930", ramo: "transporte de carga", categoria: "Serviços de terceiros" },
  { prefixo: "52", ramo: "armazenagem e logística", categoria: "Serviços de terceiros" },
  { prefixo: "53", ramo: "correios e entregas", categoria: "Serviços de terceiros" },
  { prefixo: "46", ramo: "comércio atacadista", categoria: "Compra de mercadorias (estoque)" },
  { prefixo: "47", ramo: "comércio varejista", categoria: "Compra de mercadorias (estoque)" },
  { prefixo: "1", ramo: "indústria", categoria: "Compra de mercadorias (estoque)" },
  { prefixo: "2", ramo: "indústria", categoria: "Compra de mercadorias (estoque)" },
  { prefixo: "3", ramo: "indústria", categoria: "Compra de mercadorias (estoque)" },
  { prefixo: "35", ramo: "energia elétrica e gás", categoria: "Energia, água, internet, telefone" },
  { prefixo: "36", ramo: "água", categoria: "Energia, água, internet, telefone" },
  { prefixo: "37", ramo: "esgoto", categoria: "Energia, água, internet, telefone" },
  { prefixo: "61", ramo: "telecomunicações e internet", categoria: "Energia, água, internet, telefone" },
  { prefixo: "68", ramo: "imobiliária / aluguel", categoria: "Aluguel" },
  { prefixo: "64", ramo: "banco / financeira", categoria: "Tarifas bancárias e taxas de cartão" },
  { prefixo: "66", ramo: "serviços financeiros", categoria: "Tarifas bancárias e taxas de cartão" },
  { prefixo: "6550", ramo: "plano de saúde", categoria: "Salários e encargos" },
  { prefixo: "65", ramo: "seguros", categoria: "Outras despesas" },
  { prefixo: "9420", ramo: "sindicato", categoria: "Salários e encargos" },
  { prefixo: "84", ramo: "órgão público", categoria: "Impostos sobre vendas (DAS/ICMS/ISS)" },
  { prefixo: "62", ramo: "software e TI", categoria: "Serviços de terceiros" },
  { prefixo: "63", ramo: "serviços de informação", categoria: "Serviços de terceiros" },
  { prefixo: "69", ramo: "contabilidade / jurídico", categoria: "Serviços de terceiros" },
  { prefixo: "70", ramo: "consultoria", categoria: "Serviços de terceiros" },
  { prefixo: "71", ramo: "engenharia", categoria: "Serviços de terceiros" },
  { prefixo: "73", ramo: "publicidade", categoria: "Serviços de terceiros" },
  { prefixo: "74", ramo: "serviços técnicos", categoria: "Serviços de terceiros" },
  { prefixo: "77", ramo: "locação de equipamentos", categoria: "Serviços de terceiros" },
  { prefixo: "78", ramo: "mão de obra", categoria: "Serviços de terceiros" },
  { prefixo: "80", ramo: "vigilância e segurança", categoria: "Serviços de terceiros" },
  { prefixo: "81", ramo: "limpeza e manutenção predial", categoria: "Serviços de terceiros" },
  { prefixo: "82", ramo: "serviços administrativos", categoria: "Serviços de terceiros" },
  { prefixo: "95", ramo: "manutenção e reparos", categoria: "Serviços de terceiros" },
  { prefixo: "43", ramo: "obras e instalações", categoria: "Serviços de terceiros" },
  { prefixo: "85", ramo: "educação / treinamento", categoria: "Outras despesas" },
  { prefixo: "86", ramo: "saúde", categoria: "Outras despesas" },
  { prefixo: "56", ramo: "alimentação", categoria: "Outras despesas" },
  { prefixo: "55", ramo: "hospedagem", categoria: "Outras despesas" },
];

export function ramoDoCnae(cnae: string) {
  const c = cnae.replace(/\D/g, "");
  if (!c) return null;
  return RAMOS.filter((r) => c.startsWith(r.prefixo)).sort((a, b) => b.prefixo.length - a.prefixo.length)[0] ?? null;
}

// ---------- análise

export type TransacaoAnalise = { id: string; data: Date; valor: number; descricao: string; documento?: string | null; conta: string; contaBancariaId: string };
export type AbertoAnalise = {
  id: string; tipo: "PAGAR" | "RECEBER"; valor: number; vencimento: Date; descricao: string; pessoa: string | null; pessoaId: string | null; categoriaId: string; centroCustoId: string | null;
  /** nome e fantasia separados (cada um é comparado sozinho) */
  pessoaNomes?: string[];
  /** CPF/CNPJ só dígitos */
  pessoaDocumento?: string | null;
  /** nosso número e txid dos boletos da conta */
  boletos?: string[];
};
/** Ramo de atividade (CNAE) conhecido de cada favorecido, para sugerir a categoria das despesas. */
export type RamoFavorecido = { cnae: string; documento: string | null };

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

  // quem é: o valor sozinho nunca basta. Precisa de algo que ligue a linha do extrato a esta conta.
  const hist = h.porFavorecido.get(f);
  const docs = documentosNoTexto(t.descricao, t.documento);
  let ident: string | null = null;
  if (t.documento && l.boletos?.includes(t.documento.trim())) ident = "nosso número do boleto";
  else if (l.pessoaDocumento && docs.includes(l.pessoaDocumento)) ident = "CPF/CNPJ confere";
  else if (l.pessoaId && hist?.pessoas.get(l.pessoaId)) ident = "favorecido já foi conciliado com esta pessoa";
  else if ((l.pessoaNomes ?? (l.pessoa ? [l.pessoa] : [])).some((n) => nomeConfere(t.descricao, n))) ident = "nome confere";
  else if (!l.pessoaId && palavrasEmComum(t.descricao, l.descricao) >= 2) ident = "descrição confere";
  const nome = !!ident;
  if (ident === "nosso número do boleto" || ident === "CPF/CNPJ confere") p += 45;
  else if (ident) p += 35;

  const ad = Math.abs(dias);
  if (ad <= 3) { p += 15; motivos.push(dias === 0 ? "no dia do vencimento" : `${ad} dia${ad > 1 ? "s" : ""} do vencimento`); }
  else if (ad <= 10) { p += 10; motivos.push(`${ad} dias do vencimento`); }
  else if (ad <= 30) { p += 5; motivos.push(`${ad} dias do vencimento`); }
  else motivos.push(`${ad} dias do vencimento`);
  if (ident) motivos.unshift(ident);

  // sem identificar quem pagou/recebeu, a conta só aparece na lista para escolha manual, nunca como sugestão
  if (!ident) { p = Math.min(p, 30); motivos.push(tipo === "RECEBER" ? "pagador não confere com o cliente" : "favorecido não confere com o fornecedor"); }
  return { confianca: Math.min(99, p), motivos, nome };
}

export function analisar(
  transacoes: TransacaoAnalise[],
  abertos: AbertoAnalise[],
  h: Historico,
  categorias: { id: string; nome: string; tipo: "PAGAR" | "RECEBER" }[],
  hoje: Date = diaSP(),
  ramos: Map<string, RamoFavorecido> = new Map(),
): LinhaAnalise[] {
  // o que já foi lançado para empresas de cada ramo (classe CNAE de 4 dígitos) ensina mais que a tabela fixa
  const porCnae = new Map<string, Map<string, number>>();
  for (const [fav, e] of h.porFavorecido) {
    const r = ramos.get(fav);
    if (!r?.cnae) continue;
    const m = porCnae.get(r.cnae.slice(0, 4)) ?? new Map<string, number>();
    for (const [id, n] of e.categorias) somar(m, id, n);
    porCnae.set(r.cnae.slice(0, 4), m);
  }
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
    lista.sort((a, b) => b.confianca - a.confianca || a.vencimento.localeCompare(b.vencimento));
    cands.set(t.id, lista.slice(0, 12));
    for (const c of lista) if (c.confianca >= 60) pares.push({ t: t.id, l: c.lancamentoId, c: c.confianca });
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
      const ramo = ramos.get(f);
      if (r && id) avulso = { categoriaId: id, confianca: 70, motivo: "pela descrição do extrato" };
      else if (ramo?.cnae && tipo === "PAGAR") {
        const fixo = ramoDoCnae(ramo.cnae);
        const aprendido = maisUsado(porCnae.get(ramo.cnae.slice(0, 4)) ? new Map([...porCnae.get(ramo.cnae.slice(0, 4))!].filter(([cid]) => catTipo.get(cid) === "PAGAR")) : undefined);
        const cnaeFmt = ramo.cnae.replace(/^(\d{4})(\d)(\d{2})$/, "$1-$2/$3");
        if (aprendido) avulso = { categoriaId: aprendido.id, confianca: Math.min(80, 55 + 10 * aprendido.n), motivo: `ramo ${cnaeFmt}${fixo ? ` (${fixo.ramo})` : ""}: outras empresas do ramo foram lançadas aqui` };
        else if (fixo && catPorNome.get(`PAGAR|${fixo.categoria}`)) avulso = { categoriaId: catPorNome.get(`PAGAR|${fixo.categoria}`)!, confianca: 60, motivo: `ramo de atividade: ${fixo.ramo} (CNAE ${cnaeFmt})` };
      }
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
      ramo: ramos.get(f)?.cnae ? `${ramos.get(f)!.cnae.replace(/^(\d{4})(\d)(\d{2})$/, "$1-$2/$3")}${ramoDoCnae(ramos.get(f)!.cnae) ? ` ${ramoDoCnae(ramos.get(f)!.cnae)!.ramo}` : ""}` : null,
      documentoFavorecido: ramos.get(f)?.documento ?? null,
      acao, confianca, nivel: nivelDe(confianca), motivos: [...motivos, ...avisos], candidatos, lancamentoId, categoriaId, centroCustoId,
      urgencia, pontosUrgencia: pontos, prazo, diasPendente,
    };
  });
}

/** Carrega extrato pendente, contas em aberto e histórico e devolve a análise de cada linha. */
/**
 * CNPJ de cada favorecido do extrato, sem consultar nada de fora: o que já foi gravado (FavorecidoExtrato), o CNPJ
 * escrito na própria linha, o cadastro de pessoas com o mesmo nome (razão social ou fantasia) e as notas de compra
 * recebidas do mesmo emitente.
 */
export async function documentosDosFavorecidos(linhas: { descricao: string; documento?: string | null }[]) {
  const chaves = new Map<string, string | null>();
  for (const l of linhas) {
    const f = favorecido(l.descricao);
    if (!f) continue;
    const d = documentosNoTexto(l.descricao, l.documento)[0] ?? null;
    if (!chaves.has(f) || (!chaves.get(f) && d)) chaves.set(f, d);
  }
  const lista = [...chaves.keys()];
  if (!lista.length) return new Map<string, { documento: string | null; cnae: string | null }>();
  const [salvos, pessoas, notas] = await todasAsLojas(() => Promise.all([
    prisma.favorecidoExtrato.findMany({ where: { chave: { in: lista } } }),
    prisma.pessoa.findMany({ where: { documento: { not: null } }, select: { nome: true, fantasia: true, documento: true } }),
    prisma.notaRecebida.findMany({ select: { emitenteNome: true, emitenteDocumento: true }, distinct: ["emitenteDocumento"] }),
  ]));
  const porNome = new Map<string, string>();
  for (const p of pessoas) for (const n of [p.nome, p.fantasia]) if (n && p.documento) porNome.set(favorecido(n) || normalizar(n), p.documento);
  for (const n of notas) if (!porNome.has(favorecido(n.emitenteNome))) porNome.set(favorecido(n.emitenteNome), n.emitenteDocumento.replace(/\D/g, ""));
  const salvo = new Map(salvos.map((x) => [x.chave, x]));
  const out = new Map<string, { documento: string | null; cnae: string | null }>();
  for (const f of lista) {
    const s = salvo.get(f);
    // nome do extrato costuma vir cortado: aceita o cadastro cujo nome começa igual
    let doc = s?.documento ?? chaves.get(f) ?? porNome.get(f) ?? null;
    if (!doc && f.length >= 8) for (const [n, d] of porNome) if (n.startsWith(f) || f.startsWith(n)) { doc = d; break; }
    out.set(f, { documento: doc, cnae: s?.cnae ?? null });
  }
  return out;
}

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
    prisma.lancamento.findMany({
      where: { pagoEm: null, transferenciaId: null, vencimento: { gte: min, lte: max } },
      include: { pessoa: { select: { nome: true, fantasia: true, documento: true } }, boletos: { select: { nossoNumero: true, txid: true } } },
    }),
    prisma.transacaoBancaria.findMany({
      where: { situacao: "CONCILIADA" }, orderBy: { data: "desc" }, take: 3000,
      select: { id: true, descricao: true, documento: true, lancamentos: { select: { pessoaId: true, categoriaId: true, centroCustoId: true, idLegado: true } } },
    }),
    prisma.lancamento.findMany({ where: { centroCustoId: { not: null } }, orderBy: { vencimento: "desc" }, take: 5000, select: { pessoaId: true, categoriaId: true, centroCustoId: true } }),
    prisma.categoriaFinanceira.findMany({ where: { ativa: true }, select: { id: true, nome: true, tipo: true } }),
  ]));
  const h = montarHistorico(
    conciliadas.map((t) => ({ descricao: t.descricao, lancamentos: t.lancamentos.map((l) => ({ ...l, avulso: l.idLegado === `extrato:${t.id}` })) })),
    comCentro,
  );
  const docs = await documentosDosFavorecidos([...ts, ...conciliadas]);
  const ramos = new Map<string, RamoFavorecido>();
  for (const [f, d] of docs) if (d.documento || d.cnae) ramos.set(f, { cnae: d.cnae ?? "", documento: d.documento });
  return analisar(
    ts.map((t) => ({ id: t.id, data: t.data, valor: Number(t.valor), descricao: t.descricao, documento: t.documento, conta: t.contaBancaria.nome, contaBancariaId: t.contaBancariaId })),
    abertos.map((l) => ({
      id: l.id, tipo: l.tipo, valor: Number(l.valor), vencimento: l.vencimento, descricao: l.descricao,
      pessoa: l.pessoa ? [l.pessoa.nome, l.pessoa.fantasia].filter(Boolean).join(" / ") : null, pessoaId: l.pessoaId, categoriaId: l.categoriaId, centroCustoId: l.centroCustoId,
      pessoaNomes: l.pessoa ? [l.pessoa.nome, l.pessoa.fantasia].filter((x): x is string => !!x) : [], pessoaDocumento: l.pessoa?.documento ?? null,
      boletos: l.boletos.flatMap((b) => [b.nossoNumero, b.txid]).filter((x): x is string => !!x),
    })),
    h, categorias, diaSP(), ramos,
  );
}

/**
 * Busca o ramo de atividade (CNAE) dos favorecidos de despesas pendentes que têm CNPJ conhecido e ainda não foram
 * consultados (no máximo `limite` por vez, para não travar a tela). Com `chave` + `documento`, grava o CNPJ que a
 * pessoa digitou para aquele favorecido e consulta só ele.
 */
export async function buscarRamos(opts: { limite?: number; chave?: string; documento?: string; consultar?: (cnpj: string) => Promise<{ cnae: string; razaoSocial: string }> } = {}) {
  const consultar = opts.consultar ?? (async (cnpj: string) => {
    const { buscarDadosCnpj } = await import("@/lib/cadastros/consultaCnpj");
    const d = await buscarDadosCnpj(cnpj, { cert: null, limite: 6000 });
    return { cnae: d.cnae, razaoSocial: d.razaoSocial };
  });
  let alvos: { chave: string; documento: string }[];
  if (opts.chave) {
    const doc = (opts.documento ?? "").replace(/\D/g, "");
    if (doc.length !== 14) throw new Error("Informe o CNPJ do favorecido (14 dígitos)");
    alvos = [{ chave: opts.chave, documento: doc }];
  } else {
    const ts = await prisma.transacaoBancaria.findMany({ where: { situacao: "PENDENTE", valor: { lt: 0 } }, select: { descricao: true, documento: true } });
    const docs = await documentosDosFavorecidos(ts);
    const feitos = new Set((await prisma.favorecidoExtrato.findMany({ where: { chave: { in: [...docs.keys()] }, consultadoEm: { not: null } }, select: { chave: true } })).map((x) => x.chave));
    alvos = [...docs].filter(([f, d]) => d.documento?.length === 14 && !feitos.has(f)).map(([chave, d]) => ({ chave, documento: d.documento! })).slice(0, opts.limite ?? 20);
  }
  let achados = 0;
  const erros: string[] = [];
  for (const a of alvos) {
    try {
      const r = await consultar(a.documento);
      await prisma.favorecidoExtrato.upsert({
        where: { chave: a.chave },
        create: { chave: a.chave, documento: a.documento, cnae: r.cnae || null, razaoSocial: r.razaoSocial || null, consultadoEm: new Date() },
        update: { documento: a.documento, cnae: r.cnae || null, razaoSocial: r.razaoSocial || null, consultadoEm: new Date(), erro: null },
      });
      if (r.cnae) achados++;
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      erros.push(m);
      await prisma.favorecidoExtrato.upsert({
        where: { chave: a.chave }, create: { chave: a.chave, documento: a.documento, erro: m, consultadoEm: new Date() }, update: { documento: a.documento, erro: m, consultadoEm: new Date() },
      });
    }
  }
  return { consultados: alvos.length, achados, erros };
}
