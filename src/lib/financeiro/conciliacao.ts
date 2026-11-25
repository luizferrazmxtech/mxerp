import { LOJA_ATUAL } from "@/lib/empresa/loja";
import { prisma, type Tx } from "@/lib/db";
import { diaSP } from "@/lib/datas";
import { normalizar } from "@/lib/migracao/planilha";
import { CATEGORIAS_PESSOAL, garantirCategoriasPessoal, type TipoPagamentoPessoal } from "./padroes";

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
  hora: string | null; // HH:MM (Brasília), quando o banco manda
  /** chave de ordenação: data, hora e ordem de chegada */
  ordem: string;
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
  /** funcionário cadastrado que recebeu (saída) e o tipo do pagamento */
  funcionario: string | null;
  funcionarioId: string | null;
  tipoPessoal: string | null;
  /** regra de conciliação que decidiu a sugestão (aprendida ou cadastrada) */
  regraId: string | null;
  /** descrição e competência (AAAA-MM-DD) do lançamento avulso sugerido, quando diferem do padrão */
  descricaoLancamento: string | null;
  competencia: string | null;
  /** ramo de atividade do favorecido, quando conhecido ("6920-6/01 contabilidade / jurídico") */
  ramo: string | null;
  /** CNPJ/CPF do favorecido, quando conhecido */
  documentoFavorecido: string | null;
  prazo: string; // texto curto do prazo que pesa ("vencida há 12 dias", "pendente há 40 dias")
  diasPendente: number;
};

// ---------- favorecido

// prefixos de operação que os bancos põem antes do nome (Inter: "Pix recebido - Fulano - Fulano")
const OPERACAO = /^(pix|ted|doc|tev|transferencia|pagamento|pagto|pgto|titulo|devolvido|devolvida|boleto|compra|debito|credito|deposito|recebimento|saque|estorno|tarifa|cobranca|liquidacao|envio|enviado|recebido|efetuado|de|cartao|no|na|do|da|em|via|conta|automatico|aut)(\s|$)/;

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
const cachePalavras = new Map<string, Set<string>>();
/** Palavras próprias do texto (guardadas: o mesmo nome é comparado com centenas de linhas do extrato). */
const palavras = (s: string) => {
  let r = cachePalavras.get(s);
  if (r) return r;
  r = new Set(normalizar(s).split(" ").filter((p) => p.length >= 3 && !/^\d+$/.test(p) && !PALAVRAS_VAZIAS.test(p)));
  if (cachePalavras.size > 50000) cachePalavras.clear();
  cachePalavras.set(s, r);
  return r;
};

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

// ---------- regras de conciliação (aprendidas ao confirmar, ou cadastradas na tela de regras)

export type RegraAnalise = {
  id: string; texto: string; modo: "IGUAL" | "CONTEM" | string; tipo: "PAGAR" | "RECEBER";
  categoriaId: string; centroCustoId: string | null; descricao: string | null; origem: "APRENDIDA" | "MANUAL" | string; vezes: number;
};

/**
 * Regra que vale para a linha: a do favorecido igual ganha da de "contém"; entre as de "contém", o trecho mais longo;
 * empate, a cadastrada à mão ganha da aprendida.
 */
export function regraDaLinha(t: { descricao: string; valor: number }, f: string, regras: RegraAnalise[]): RegraAnalise | null {
  const tipo = t.valor < 0 ? "PAGAR" : "RECEBER";
  const d = normalizar(t.descricao);
  const servem = regras.filter((r) => r.tipo === tipo && r.texto && (r.modo === "CONTEM" ? d.includes(r.texto) : r.texto === f));
  servem.sort((a, b) => Number(b.modo !== "CONTEM") - Number(a.modo !== "CONTEM") || b.texto.length - a.texto.length || Number(b.origem === "MANUAL") - Number(a.origem === "MANUAL"));
  return servem[0] ?? null;
}

/** Confiança da sugestão feita por uma regra: cadastrada à mão 95; aprendida sobe com as confirmações (80 → 95). */
export const confiancaRegra = (r: RegraAnalise) => (r.origem === "MANUAL" ? 95 : Math.min(95, 80 + 3 * Math.max(0, r.vezes - 1)));

/**
 * Aprende com o lançamento avulso confirmado: o favorecido passa a ir direto para essa categoria e centro de custo.
 * Regra cadastrada à mão não é trocada (só conta a confirmação quando bate); aprendida que mudou de categoria recomeça.
 */
export async function aprenderRegra(tx: Tx, d: { descricao: string; valor: number; categoriaId: string; centroCustoId?: string | null }) {
  const texto = favorecido(d.descricao);
  if (texto.length < 3) return null;
  const tipo = d.valor < 0 ? "PAGAR" : "RECEBER";
  const atual = await tx.regraConciliacao.findUnique({ where: { empresaId_texto_modo_tipo: { empresaId: LOJA_ATUAL, texto, modo: "IGUAL", tipo } } });
  const agora = new Date();
  if (!atual) return tx.regraConciliacao.create({ data: { texto, modo: "IGUAL", tipo, categoriaId: d.categoriaId, centroCustoId: d.centroCustoId || null, vezes: 1, ultimaEm: agora } });
  if (atual.origem === "MANUAL") {
    return atual.categoriaId === d.categoriaId ? tx.regraConciliacao.update({ where: { id: atual.id }, data: { vezes: { increment: 1 }, ultimaEm: agora } }) : atual;
  }
  const mesma = atual.categoriaId === d.categoriaId;
  return tx.regraConciliacao.update({
    where: { id: atual.id },
    data: { categoriaId: d.categoriaId, centroCustoId: d.centroCustoId || (mesma ? atual.centroCustoId : null), vezes: mesma ? { increment: 1 } : 1, ultimaEm: agora },
  });
}

// ---------- pagamento a funcionários

export type FuncionarioAnalise = { id: string; nome: string; cpf: string | null; salarioRef: number | null };
export type PessoalAnalise = { funcionarios: FuncionarioAnalise[]; categorias: Record<TipoPagamentoPessoal, string> };

const LIGACOES = /^(de|da|do|das|dos|e)$/;
/**
 * Nome de pessoa física no extrato confere com o funcionário: todas as palavras do nome que o banco mostra (no mínimo
 * duas, sobrenomes inclusive) estão no nome completo do cadastro. "Joao Silva" confere com "João da Silva Santos";
 * "Joao Pereira" não.
 */
export function nomePessoaConfere(extrato: string, nomeCadastro: string) {
  const fav = favorecido(extrato).split(" ").filter((p) => p.length >= 2 && !LIGACOES.test(p));
  const cad = new Set(normalizar(nomeCadastro).split(" ").filter((p) => p.length >= 2 && !LIGACOES.test(p)));
  return fav.length >= 2 && fav.every((p) => cad.has(p));
}

export function funcionarioDaLinha(t: { descricao: string; documento?: string | null; contraparteDocumento?: string | null }, funcionarios: FuncionarioAnalise[]) {
  const docs = [...(t.contraparteDocumento ? [t.contraparteDocumento] : []), ...documentosNoTexto(t.descricao, t.documento)];
  for (const f of funcionarios) if (f.cpf && docs.includes(f.cpf)) return { funcionario: f, por: "CPF confere" };
  const porNome = funcionarios.filter((f) => nomePessoaConfere(t.descricao, f.nome));
  return porNome.length === 1 ? { funcionario: porNome[0], por: "nome confere" } : null;
}

const ROTULO_PESSOAL: Record<TipoPagamentoPessoal, string> = { SALARIO: "Salário", ADIANTAMENTO: "Adiantamento", FERIAS: "Férias", DECIMO: "13º salário", OUTROS: "Pagamento" };
const mesAno = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

/**
 * O que é o pagamento ao funcionário, pela descrição e pela data:
 *  - "férias", "13º", "adiantamento/vale", "rescisão" escritos no extrato mandam;
 *  - dia 1 a 10: salário do mês anterior (5º dia útil); dia 26 em diante: salário do próprio mês;
 *  - dia 11 a 25: adiantamento (até 70% do último salário, ou sem salário conhecido), férias quando passa de 125% do salário;
 *  - o resto: outros (confira).
 */
export function classificarPagamento(data: Date, valor: number, descricao: string, salarioRef: number | null): { tipo: TipoPagamentoPessoal; motivo: string; competencia: Date } {
  const d = normalizar(descricao);
  const dia = data.getUTCDate();
  const mesmo = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), 1));
  const anterior = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() - 1, 1));
  const v = Math.abs(valor);
  if (/\bferias\b/.test(d)) return { tipo: "FERIAS", motivo: "\"férias\" na descrição", competencia: mesmo };
  if (/\b(13|decimo|13o)\b/.test(d)) return { tipo: "DECIMO", motivo: "\"13º\" na descrição", competencia: mesmo };
  if (/\b(adiantamento|adiant|vale)\b/.test(d)) return { tipo: "ADIANTAMENTO", motivo: "\"adiantamento\" na descrição", competencia: mesmo };
  if (/\b(rescisao|rescisorio)\b/.test(d)) return { tipo: "OUTROS", motivo: "rescisão na descrição", competencia: mesmo };
  if (dia <= 10) return { tipo: "SALARIO", motivo: `pago dia ${dia}: salário de ${mesAno(anterior)}`, competencia: anterior };
  if (dia >= 26) return { tipo: "SALARIO", motivo: `pago dia ${dia}: salário de ${mesAno(mesmo)}`, competencia: mesmo };
  if (salarioRef && v >= salarioRef * 1.25) return { tipo: "FERIAS", motivo: `pago dia ${dia}, acima do salário (${salarioRef.toFixed(2).replace(".", ",")}): férias`, competencia: mesmo };
  if (!salarioRef || v <= salarioRef * 0.7) return { tipo: "ADIANTAMENTO", motivo: `pago dia ${dia}: adiantamento (vale)`, competencia: mesmo };
  return { tipo: "OUTROS", motivo: `pago dia ${dia}, fora das datas de salário e vale: confira (pode ser férias)`, competencia: mesmo };
}

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

// ---------- ramo pelo nome do favorecido (sem CNPJ e sem histórico)

/**
 * Ramo de atividade adivinhado pelo nome de quem recebeu ("Hapvida Assistencia Medica Sa" → plano de saúde), para
 * quando não há CNPJ nem histórico. `re` procura em qualquer parte do nome; `inicio` só vale como primeira palavra
 * (marcas curtas como Vivo, Claro, Tim, Shell, que também são nomes e sobrenomes de pessoas). `categorias` são trechos
 * procurados no nome das categorias do plano de contas, na ordem; sem nenhuma, vale a categoria `padrao`.
 * A ordem da lista importa: a primeira que bate ganha.
 */
export const RAMOS_NOME: { id: string; ramo: string; re?: RegExp; inicio?: RegExp; categorias: string[]; padrao: string; confianca?: number }[] = [
  // conhecidos (regras do Luiz, 22/11): valem mais que o histórico; `confianca` marca os conhecidos
  { id: "fgts", ramo: "FGTS (Cef Matriz)", re: /\b(cef matriz|fgts|fgts digital)\b/, categorias: ["fgts"], padrao: "FGTS", confianca: 85 },
  { id: "darf", ramo: "DARF (substituição tributária ou diferença de alíquota)", re: /\b(darf|icms st|substituicao tributaria|difal|diferencial de aliquota|diferenca de aliquota)\b/, categorias: ["icms st", "difal", "substituicao tributaria"], padrao: "ICMS ST e DIFAL", confianca: 80 },
  { id: "receita-federal", ramo: "Receita Federal (Simples Nacional ou INSS)", re: /\b(receita federal|secretaria da receita|rfb|simples nacional|documento de arrecadacao)\b/, categorias: ["simples nacional"], padrao: "Simples Nacional", confianca: 80 },
  { id: "exames", ramo: "exames de funcionários (medicina do trabalho)", confianca: 80, re: /\b(safety|seguranca do trabalho|medicina do trabalho|medicina ocupacional|saude ocupacional|ocupacional|sesmt|bessa|exames? (admissiona|periodic|demissiona)\w*)\b/, categorias: ["exames medicos", "exame", "medicina do trabalho"], padrao: "Exames médicos de funcionários" },
  { id: "plano-saude", ramo: "saúde dos funcionários (plano de saúde)", confianca: 85, re: /\b(assistencia medica|operadora de (planos? de )?saud\w*|personal care|plano de saude|planos de saude|hapvida|unimed|amil|notredame|intermedica|bradesco saude|sulamerica saude|sul america saude|golden cross|prevent senior|porto seguro saude|odontoprev|odonto\w*|medial saude|sami saude|cassi)\b/, categorias: ["saude dos funcionarios", "plano de saude", "assistencia medica", "convenio medico", "saude", "beneficio"], padrao: "Plano de saúde dos funcionários" },
  { id: "saude", ramo: "saúde (clínica, hospital, farmácia)", re: /\b(clinica|hospital|laboratorio|diagnostico|medicina|medico|medicos|farmacia|drogaria|droga raia|drogasil|pague menos|panvel|ultrafarma|odontologia|fisioterapia|exames?)\b/, categorias: ["saude", "medic", "farmacia"], padrao: "Outras despesas" },
  { id: "encargos", ramo: "INSS", re: /\b(inss|gps|esocial|previdencia social)\b/, categorias: ["inss"], padrao: "INSS", confianca: 80 },
  { id: "sindicato", ramo: "sindicato", re: /\b(sindicato|sind)\b/, categorias: ["sindic", "contribuicao"], padrao: "Salários e encargos", confianca: 70 },
  { id: "cartao", ramo: "fatura de cartão ou financiamento", re: /\b(pagamento fatura|fatura|nu pagamentos|nubank|banco c6|bradescard|portoseg|cloudwalk|credito financiamento|financiamento e investimento|cartoes|cartao de credito)\b/, categorias: ["cartao de credito", "fatura", "emprestimo", "financiamento"], padrao: "Fatura de cartão de crédito" },
  { id: "associacao", ramo: "associação comercial", re: /\b(associacao comercial|camara de dirigentes lojistas|cdl|acisc)\b/, categorias: ["associac", "mensalidade", "contribuicao"], padrao: "Outras despesas" },
  { id: "rh", ramo: "recursos humanos", re: /\b(recursos humanos|rh|recrutamento|selecao de pessoal)\b/, categorias: ["recursos humanos", "servicos de terceiros"], padrao: "Serviços de terceiros" },
  { id: "impostos", ramo: "impostos e taxas", re: /\b(dae|gare|gnre|dgfin|diretoria geral de financas|prefeitura|municipio de|secretaria (da|de) fazenda|sefaz|tesouro nacional|fazenda nacional)\b/, categorias: ["imposto", "tributo", "taxa"], padrao: "Impostos sobre vendas (DAS/ICMS/ISS)" },
  { id: "energia", ramo: "energia elétrica", re: /\b(energia|eletricidade|enel|cpfl|cemig|copel|celesc|coelba|celpe|cosern|coelce|equatorial|neoenergia|elektro|energisa|eletropaulo|amazonas energia)\b/, inicio: /^(light|edp|rge)\b/, categorias: ["energia", "luz"], padrao: "Energia, água, internet, telefone" },
  { id: "agua", ramo: "água e esgoto", re: /\b(saneamento|sabesp|copasa|sanepar|cedae|embasa|compesa|casan|corsan|caesb|cagece|saae|daae|semae|aguas de|agua e esgoto)\b/, categorias: ["agua", "saneamento"], padrao: "Energia, água, internet, telefone" },
  { id: "telecom", ramo: "telefone e internet", re: /\b(telecom\w*|telefonica|telecomunicacoes|internet|fibra|provedor|algar|embratel|starlink)\b/, inicio: /^(vivo|claro|tim|oi|net|sky|nextel)\b/, categorias: ["internet", "telefon", "telecom"], padrao: "Energia, água, internet, telefone" },
  { id: "combustivel", ramo: "posto de combustível", re: /\b(auto posto|posto de (gasolina|combustiveis?)|combustiveis?|ipiranga|petrobras|br mania|raizen|gasolina)\b/, inicio: /^(posto|shell|ale)\b/, categorias: ["combustivel", "veiculo"], padrao: "Combustível e veículos", confianca: 80 },
  { id: "veiculos", ramo: "veículos (peças, oficina, pedágio)", re: /\b(auto ?pecas|pneus?|borracharia|oficina|mecanica|funilaria|estacionamento|pedagio|sem parar|conectcar|veloe|move mais|detran|ipva|licenciamento)\b/, categorias: ["veiculo", "combustivel", "manutencao de veiculo"], padrao: "Combustível e veículos" },
  { id: "contabilidade", ramo: "contabilidade", re: /\b(contabil|contabeis|contabilidade|contadores|contador|escritorio contabil)\b/, categorias: ["contab", "honorario", "servicos de terceiros"], padrao: "Serviços de terceiros" },
  { id: "advocacia", ramo: "advocacia", re: /\b(advogados?|advocacia|sociedade de advogados|juridic\w*)\b/, categorias: ["juridic", "advoca", "honorario", "servicos de terceiros"], padrao: "Serviços de terceiros" },
  { id: "seguros", ramo: "seguros", re: /\b(seguros?|seguradora|tokio marine|mapfre|allianz|hdi|zurich|liberty)\b/, inicio: /^(porto)\b/, categorias: ["seguro"], padrao: "Seguros", confianca: 80 },
  { id: "aluguel", ramo: "aluguel e condomínio", re: /\b(aluguel|alugueis|imobiliaria|imoveis|condominio|administradora de (imoveis|condominios))\b/, categorias: ["aluguel", "condominio"], padrao: "Aluguel" },
  { id: "mercadoria", ramo: "fornecedor de mercadoria (eletrônicos, elétrica, informática)", re: /\b(eletronic\w*|eletrica|hidraulica|eletroeletronic\w*|baterias?|informatica|computer|computadores|componentes|distribuidora|distribuicao|atacadista|importadora)\b/, categorias: ["compra", "mercadoria"], padrao: "Compra de mercadorias (estoque)" },
  { id: "marketplace", ramo: "compra de mercadoria (marketplace, normalmente Mercado Livre)", confianca: 80, re: /\b(marketplace|pix marketplace|shpp|shopee|mercado ?livre|mercado ?pago|shopee|amazon servicos|amazon com|magazine luiza|magalu|aliexpress|kabum|americanas)\b/, categorias: ["compra", "mercadoria"], padrao: "Compra de mercadorias (estoque)" },
  { id: "software", ramo: "software e tecnologia", re: /\b(google|microsoft|adobe|amazon web services|aws|locaweb|hostgator|hostinger|godaddy|registro br|nic br|dropbox|zoom|canva|apple|totvs|omie|bling|tiny|conta azul|github|openai|anthropic|software|sistemas|tecnologia)\b/, categorias: ["software", "sistema", "tecnologia", "informatica", "servicos de terceiros"], padrao: "Serviços de terceiros" },
  { id: "frete", ramo: "frete e correios", re: /\b(correios|empresa brasileira de correios|jadlog|total express|loggi|sequoia|braspress|transportadora|transportes|logistica|melhor envio|frenet|kangu)\b/, categorias: ["frete", "correio", "transporte de mercadoria"], padrao: "Serviços de terceiros" },
  { id: "viagem", ramo: "viagem e deslocamento", re: /\b(uber|99 tecnologia|99pop|cabify|taxi|latam|gol linhas|azul linhas|passagens?|rodoviaria|buser|hotel|hoteis|pousada|booking|airbnb)\b/, categorias: ["viage", "deslocamento", "hosped", "transporte"], padrao: "Outras despesas" },
  { id: "alimentacao", ramo: "alimentação", re: /\b(restaurante|lanchonete|padaria|panificadora|ifood|pizzaria|churrascaria|alimentacao|refeicoes|cafes?|supermercados?|atacadao|assai|carrefour|hortifruti)\b/, categorias: ["alimenta", "refeic"], padrao: "Outras despesas" },
  { id: "educacao", ramo: "educação e treinamento", re: /\b(escola|colegio|faculdade|universidade|cursos?|treinamentos?|educacao|ensino|senai|senac|sebrae)\b/, categorias: ["educa", "treinamento", "curso"], padrao: "Outras despesas" },
  { id: "material", ramo: "material e manutenção", re: /\b(copias|copiadora|grafica|bordados|confeccoes|uniformes?|materiais? (de construcao|eletricos?)|ferragens|ferramentas|leroy merlin|telhanorte|madeireira|papelaria|kalunga|material de escritorio)\b/, categorias: ["material", "manutencao", "escritorio"], padrao: "Outras despesas" },
];

/** Ramo pelo nome do favorecido (já normalizado, como sai de `favorecido`). */
export function ramoDoNome(fav: string) {
  if (!fav) return null;
  return RAMOS_NOME.find((r) => r.re?.test(fav) || r.inicio?.test(fav)) ?? null;
}

/**
 * Ramo "conhecido" (regras do Luiz, com `confianca`) da linha: pelo favorecido e, se não achar, pela descrição
 * inteira ("Pagamento DARF", "Pix Marketplace" vêm na parte da operação, que o favorecido descarta).
 */
export function conhecidoDaLinha(descricao: string, fav = favorecido(descricao)) {
  const r = ramoDoNome(fav);
  if (r?.confianca) return r;
  const d = normalizar(descricao).replace(/\s+/g, " ");
  return RAMOS_NOME.find((x) => x.confianca && x.re?.test(d)) ?? null;
}

/** Categoria do plano de contas para o ramo: a primeira cujo nome tem um dos trechos do ramo; senão a padrão. */
export function categoriaDoRamo(r: (typeof RAMOS_NOME)[number], categorias: { id: string; nome: string; tipo: "PAGAR" | "RECEBER" }[]) {
  const pagar = categorias.filter((c) => c.tipo === "PAGAR").map((c) => ({ id: c.id, n: normalizar(c.nome) }));
  for (const k of r.categorias) {
    const c = pagar.find((x) => x.n.includes(k));
    if (c) return { id: c.id, doPlano: true };
  }
  const padrao = normalizar(r.padrao);
  const c = pagar.find((x) => x.n === padrao);
  return c ? { id: c.id, doPlano: false } : null;
}

export function ramoDoCnae(cnae: string) {
  const c = cnae.replace(/\D/g, "");
  if (!c) return null;
  return RAMOS.filter((r) => c.startsWith(r.prefixo)).sort((a, b) => b.prefixo.length - a.prefixo.length)[0] ?? null;
}

// ---------- análise

/** Forma de pagamento Pix (tPag 17 da NF-e, 20 = Pix estático, ou "pix" no nome). */
export function ehPix(f: { tPag: string; nome: string }) {
  return f.tPag === "17" || f.tPag === "20" || /\bpix\b/i.test(f.nome);
}

export type TransacaoAnalise = {
  id: string; data: Date; valor: number; descricao: string; documento?: string | null; conta: string; contaBancariaId: string;
  dataHora?: Date | null; contraparteDocumento?: string | null; criadaEm?: Date;
};
export type AbertoAnalise = {
  id: string; tipo: "PAGAR" | "RECEBER"; valor: number; vencimento: Date; descricao: string; pessoa: string | null; pessoaId: string | null; categoriaId: string; centroCustoId: string | null;
  /** nome e fantasia separados (cada um é comparado sozinho) */
  pessoaNomes?: string[];
  /** CPF/CNPJ só dígitos */
  pessoaDocumento?: string | null;
  /** nosso número e txid dos boletos da conta */
  boletos?: string[];
  /**
   * Momentos da venda/OS feita no sistema: lançamento da conta, cadastro e data da venda/OS. A conta é refeita
   * quando a venda é editada, por isso vale o mais perto do Pix.
   */
  momentos?: Date[];
  /** forma de pagamento da conta: true = Pix, false = outra forma, null = sem forma */
  formaPix?: boolean | null;
};

/** Diferença máxima entre o horário do Pix no extrato e o da venda para casar pelo horário. */
export const MINUTOS_PIX_VENDA = 30;

/** O momento da venda mais perto do Pix recebido e a distância em minutos (os dois precisam ter horário). */
export function momentoDaVenda(t: TransacaoAnalise, l: AbertoAnalise): { minutos: number; quando: Date } | null {
  if (!t.dataHora || !l.momentos?.length || t.valor <= 0 || l.tipo !== "RECEBER") return null;
  let melhor: { minutos: number; quando: Date } | null = null;
  for (const m of l.momentos) {
    const minutos = Math.abs(t.dataHora.getTime() - m.getTime()) / 60000;
    if (!melhor || minutos < melhor.minutos) melhor = { minutos, quando: m };
  }
  return melhor;
}
/** Ramo de atividade (CNAE) conhecido de cada favorecido, para sugerir a categoria das despesas. */
export type RamoFavorecido = { cnae: string; documento: string | null };

const iso = (d: Date) => d.toISOString().slice(0, 10);
// Brasília é UTC-3 o ano todo desde 2019 (sem horário de verão); toLocaleTimeString era o que mais pesava na análise
const horaSP = (d: Date | null | undefined) => (d ? new Date(d.getTime() - 3 * 3600000).toISOString().slice(11, 16) : null);
const nivelDe = (c: number): Nivel => (c >= 80 ? "alta" : c >= 60 ? "media" : "baixa");

/** Pontua um par extrato × conta em aberto (0 a 99) e diz por quê. Null quando o valor não serve. */
export function pontuar(t: TransacaoAnalise, l: AbertoAnalise, h: Historico, f: string): { confianca: number; motivos: string[]; nome: boolean; horario?: boolean } | null {
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
  const docs = [...(t.contraparteDocumento ? [t.contraparteDocumento] : []), ...documentosNoTexto(t.descricao, t.documento)];
  let ident: string | null = null;
  if (t.documento && l.boletos?.includes(t.documento.trim())) ident = "nosso número do boleto";
  else if (l.pessoaDocumento && docs.includes(l.pessoaDocumento)) ident = "CPF/CNPJ confere";
  else if (l.pessoaId && hist?.pessoas.get(l.pessoaId)) ident = "favorecido já foi conciliado com esta pessoa";
  else if ((l.pessoaNomes ?? (l.pessoa ? [l.pessoa] : [])).some((n) => nomeConfere(t.descricao, n))) ident = "nome confere";
  else if (!l.pessoaId && palavrasEmComum(t.descricao, l.descricao) >= 2) ident = "descrição confere";
  // venda no balcão/PDV paga no Pix: quem paga muitas vezes não é o cliente da venda (consumidor final, parente),
  // mas o Pix do mesmo valor minutos depois da venda identifica a conta
  const mv = !ident && dif <= 0.009 ? momentoDaVenda(t, l) : null;
  const horario = !!mv && mv.minutos <= MINUTOS_PIX_VENDA && l.formaPix !== false;
  if (horario) ident = `venda às ${horaSP(mv.quando)} (Pix às ${horaSP(t.dataHora)})`;
  // perto, mas fora da regra: mostra o porquê, para dar para conferir
  else if (mv && mv.minutos <= 24 * 60) motivos.push(`venda às ${horaSP(mv.quando)}${l.formaPix === false ? " em outra forma de pagamento" : `, ${Math.round(mv.minutos)} min do Pix`}`);
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
  return { confianca: Math.min(99, p), motivos, nome, horario };
}

/** Cliente/fornecedor cadastrado e as categorias das contas dele no sistema (compras, vendas, despesas lançadas). */
export type CategoriasDaPessoa = { nomes: string[]; tipo: "PAGAR" | "RECEBER"; categorias: Map<string, number> };

/** Pessoa cadastrada cujo nome confere com o favorecido do extrato (a com mais contas, quando mais de uma confere). */
export function pessoaDaLinha(descricao: string, tipo: "PAGAR" | "RECEBER", pessoas: CategoriasDaPessoa[]) {
  let melhor: CategoriasDaPessoa | null = null, n = 0;
  for (const p of pessoas) {
    if (p.tipo !== tipo || !p.nomes.some((x) => nomeConfere(descricao, x))) continue;
    const total = [...p.categorias.values()].reduce((a, b) => a + b, 0);
    if (total > n) { melhor = p; n = total; }
  }
  return melhor;
}

// nome de empresa (não de pessoa física)
const EMPRESA = /\b(ltda|ltd|s a|sa|eireli|epp|me|mei|cia|comercio|servicos|industria|distribuidora|instituicao|banco|financeira|pagamentos|associacao|sindicato|condominio|residencial|clinica|posto|auto|tech|informatica|computer|eletronica|eletrica|matriz|federal|municipio|marketplace|seguros|cafes|copias|bordados)\b/;

export function analisar(
  transacoes: TransacaoAnalise[],
  abertos: AbertoAnalise[],
  h: Historico,
  categorias: { id: string; nome: string; tipo: "PAGAR" | "RECEBER" }[],
  hoje: Date = diaSP(),
  ramos: Map<string, RamoFavorecido> = new Map(),
  pessoal: PessoalAnalise | null = null,
  regras: RegraAnalise[] = [],
  pessoas: CategoriasDaPessoa[] = [],
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
  // e o mesmo pelo ramo adivinhado pelo nome (Hapvida lançada em "Plano de saúde" ensina a Unimed)
  const porRamoNome = new Map<string, Map<string, number>>();
  for (const [fav, e] of h.porFavorecido) {
    const r = ramoDoNome(fav);
    if (!r) continue;
    const m = porRamoNome.get(r.id) ?? new Map<string, number>();
    for (const [id, n] of e.categorias) somar(m, id, n);
    porRamoNome.set(r.id, m);
  }
  // 1) candidatos de cada linha
  const cands = new Map<string, Candidato[]>();
  const favs = new Map<string, string>();
  const pares: { t: string; l: string; c: number }[] = [];
  for (const t of transacoes) {
    const f = favorecido(t.descricao);
    favs.set(t.id, f);
    const lista: Candidato[] = [];
    const peloHorario: Candidato[] = [];
    for (const l of abertos) {
      const r = pontuar(t, l, h, f);
      if (!r) continue;
      const c: Candidato = { lancamentoId: l.id, descricao: l.descricao, pessoa: l.pessoa, valor: l.valor, vencimento: iso(l.vencimento), confianca: r.confianca, motivos: r.motivos, centroCustoId: l.centroCustoId };
      lista.push(c);
      if (r.horario) peloHorario.push(c);
    }
    // duas vendas do mesmo valor perto do mesmo Pix: não dá para saber qual foi, fica para escolha manual
    if (peloHorario.length > 1) for (const c of peloHorario) { c.confianca = Math.min(c.confianca, 55); c.motivos.push("outra venda do mesmo valor no mesmo horário"); }
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

  // Receita Federal: no mesmo mês costumam vir dois pagamentos (dia 20); o maior é o Simples Nacional, os outros INSS
  const receitaPorMes = new Map<string, { id: string; v: number }[]>();
  for (const t of transacoes) {
    if (t.valor >= 0 || conhecidoDaLinha(t.descricao)?.id !== "receita-federal") continue;
    const m = iso(t.data).slice(0, 7);
    receitaPorMes.set(m, [...(receitaPorMes.get(m) ?? []), { id: t.id, v: Math.abs(t.valor) }]);
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
    // nomes conhecidos (FGTS, Receita Federal, plano de saúde, posto) valem mais que o histórico
    const conhecido = tipo === "PAGAR" ? conhecidoDaLinha(t.descricao, f) : null;
    if (conhecido?.confianca) {
      if (conhecido.id === "receita-federal") {
        const d = normalizar(t.descricao);
        const doMes = receitaPorMes.get(iso(t.data).slice(0, 7)) ?? [];
        const maior = Math.max(...doMes.map((x) => x.v));
        const inssNome = /\b(inss|gps|previdencia)\b/.test(d), simplesNome = /\b(simples|das)\b/.test(d);
        const ehSimples = simplesNome || (!inssNome && Math.abs(t.valor) >= maior);
        const alvo = ehSimples ? RAMOS_NOME.find((r) => r.id === "receita-federal")! : RAMOS_NOME.find((r) => r.id === "encargos")!;
        const cat = categoriaDoRamo(alvo, categorias);
        const motivo = inssNome || simplesNome ? `Receita Federal: ${ehSimples ? "Simples Nacional" : "INSS"} pela descrição`
          : doMes.length > 1 ? `Receita Federal: ${ehSimples ? "o maior pagamento do mês é o Simples Nacional" : "o menor pagamento do mês é o INSS"}`
            : "Receita Federal: único pagamento do mês, considerado Simples Nacional (confira)";
        const conf = inssNome || simplesNome ? 85 : doMes.length === 2 ? 85 : doMes.length > 2 ? 70 : 65;
        if (cat) avulso = { categoriaId: cat.id, confianca: conf, motivo: doMes.length > 2 && !inssNome && !simplesNome ? `${motivo} (${doMes.length} pagamentos à Receita no mês: confira)` : motivo };
      } else {
        const cat = categoriaDoRamo(conhecido, categorias);
        if (cat) avulso = { categoriaId: cat.id, confianca: conhecido.confianca, motivo: `pelo nome: ${conhecido.ramo}` };
      }
    }
    const catHist = maisUsado(hist ? new Map([...hist.categorias].filter(([id]) => catTipo.get(id) === tipo)) : undefined);
    if (avulso) {
      // já decidido pelo nome conhecido
    } else if (catHist) {
      const c = Math.round(Math.min(95, 50 + 15 * catHist.n) * (0.4 + 0.6 * catHist.parte));
      avulso = { categoriaId: catHist.id, confianca: c, motivo: `${catHist.n}× lançado nesta categoria antes` };
    }
    // cliente/fornecedor cadastrado: a categoria das contas dele no sistema (compras do fornecedor, vendas do cliente)
    const pessoa = !avulso && f ? pessoaDaLinha(f, tipo, pessoas) : null;
    const catPessoa = pessoa ? maisUsado(new Map([...pessoa.categorias].filter(([id]) => catTipo.get(id) === tipo))) : null;
    if (avulso) {
      // já decidido
    } else if (pessoa && catPessoa) {
      const c = Math.round(Math.min(80, 60 + 5 * catPessoa.n) * (0.6 + 0.4 * catPessoa.parte));
      avulso = { categoriaId: catPessoa.id, confianca: c, motivo: `${tipo === "PAGAR" ? "fornecedor" : "cliente"} cadastrado (${pessoa.nomes[0]}): ${catPessoa.n} conta${catPessoa.n > 1 ? "s" : ""} dele nesta categoria` };
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
      // sem CNPJ (ou CNAE sem regra): o ramo pelo próprio nome de quem recebeu
      if (!avulso && tipo === "PAGAR") {
        const rn = ramoDoNome(f);
        if (rn) {
          const aprendido = maisUsado(porRamoNome.get(rn.id) ? new Map([...porRamoNome.get(rn.id)!].filter(([cid]) => catTipo.get(cid) === "PAGAR")) : undefined);
          const cat = categoriaDoRamo(rn, categorias);
          if (aprendido) avulso = { categoriaId: aprendido.id, confianca: Math.min(80, 60 + 10 * aprendido.n), motivo: `pelo nome: ${rn.ramo}; outras empresas desse ramo foram lançadas aqui` };
          else if (cat) avulso = { categoriaId: cat.id, confianca: cat.doPlano ? 60 : 55, motivo: `pelo nome: ${rn.ramo}` };
        }
      }
    }

    // regra (aprendida ou cadastrada) vale mais que histórico, ramo e descrição
    const regra = regraDaLinha(t, f, regras);
    if (regra && catTipo.get(regra.categoriaId) === tipo) {
      avulso = { categoriaId: regra.categoriaId, confianca: confiancaRegra(regra), motivo: regra.origem === "MANUAL" ? `regra cadastrada: "${regra.texto}"` : `regra aprendida: ${regra.vezes}× confirmado nesta categoria` };
    }

    // pagamento a funcionário cadastrado: vale mais que histórico e ramo
    let func: { id: string; nome: string; tipo: TipoPagamentoPessoal; descricao: string; competencia: Date } | null = null;
    if (tipo === "PAGAR" && pessoal?.funcionarios.length) {
      const m = funcionarioDaLinha(t, pessoal.funcionarios);
      if (m) {
        const c = classificarPagamento(t.data, t.valor, t.descricao, m.funcionario.salarioRef);
        const nomeFunc = m.funcionario.nome.toUpperCase();
        func = { id: m.funcionario.id, nome: m.funcionario.nome, tipo: c.tipo, competencia: c.competencia, descricao: c.tipo === "OUTROS" ? `Pagamento a funcionário - ${nomeFunc}` : `${ROTULO_PESSOAL[c.tipo]} ${mesAno(c.competencia)} - ${nomeFunc}` };
        avulso = { categoriaId: pessoal.categorias[c.tipo], confianca: (m.por === "CPF confere" ? 95 : 85) - (c.tipo === "OUTROS" ? 20 : 0), motivo: `funcionário ${m.funcionario.nome} (${m.por}) · ${c.motivo}` };
      }
    }

    let acao: Acao = "REVISAR", confianca = 0, motivos: string[] = [], lancamentoId: string | null = null, categoriaId: string | null = null;
    // favorecido que sempre foi lançado avulso (tarifa, assinatura) não vira baixa de conta parecida por acaso
    const regraVale = !!regra && !func && avulso?.categoriaId === regra.categoriaId;
    const sempreAvulso = (!!hist && hist.avulsos >= hist.n && hist.n >= 2) || !!func || regraVale;
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
    const ccRegra = regraVale && acao === "LANCAR" ? regra!.centroCustoId : null;
    const centroCustoId = conta?.centroCustoId ?? ccRegra ?? ccFav?.id ?? ccPessoa?.id ?? ccCat?.id ?? null;

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
    if (!avulso && !melhor) {
      const d = normalizar(t.descricao);
      if (/\bdevolvid[oa]\b|\bestorno\b/.test(d)) {
        const orig = transacoes.find((x) => x.valor === -t.valor && x.data <= t.data && favorecido(x.descricao) === f);
        avisos.unshift(orig ? `devolução do Pix de ${iso(orig.data).slice(8, 10)}/${iso(orig.data).slice(5, 7)} (mesmo valor): não é receita, lance as duas na mesma categoria` : "devolução de pagamento: não é receita, use a categoria da compra que foi devolvida");
      } else if (tipo === "PAGAR" && f && !EMPRESA.test(f)) {
        const meses = new Set(transacoes.filter((x) => x.valor < 0 && favs.get(x.id) === f).map((x) => iso(x.data).slice(0, 7)));
        if (meses.size >= 2) avisos.unshift(`Pix para pessoa física em ${meses.size} meses: se for funcionário, cadastre com nome completo e CPF em Usuários que a conciliação reconhece`);
      }
    }

    return {
      transacaoId: t.id, data: iso(t.data), hora: horaSP(t.dataHora), ordem: `${iso(t.data)}|${horaSP(t.dataHora) ?? "00:00"}|${t.criadaEm?.toISOString() ?? ""}`, valor: t.valor, descricao: t.descricao, favorecido: f, conta: t.conta, contaBancariaId: t.contaBancariaId, tipo,
      funcionario: func?.nome ?? null, funcionarioId: func?.id ?? null, regraId: regraVale && acao === "LANCAR" ? regra!.id : null, tipoPessoal: func ? (func.tipo === "OUTROS" ? "Outros" : ROTULO_PESSOAL[func.tipo]) : null,
      descricaoLancamento: func && acao === "LANCAR" ? func.descricao : regraVale && acao === "LANCAR" ? regra!.descricao || null : null, competencia: func && acao === "LANCAR" ? iso(func.competencia) : null,
      ramo: ramos.get(f)?.cnae ? `${ramos.get(f)!.cnae.replace(/^(\d{4})(\d)(\d{2})$/, "$1-$2/$3")}${ramoDoCnae(ramos.get(f)!.cnae) ? ` ${ramoDoCnae(ramos.get(f)!.cnae)!.ramo}` : ""}` : ramoDoNome(f) ? `${ramoDoNome(f)!.ramo} (pelo nome)` : null,
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
export async function documentosDosFavorecidos(linhas: { descricao: string; documento?: string | null; contraparteDocumento?: string | null }[]) {
  const chaves = new Map<string, string | null>();
  for (const l of linhas) {
    const f = favorecido(l.descricao);
    if (!f) continue;
    const d = l.contraparteDocumento || documentosNoTexto(l.descricao, l.documento)[0] || null;
    if (!chaves.has(f) || (!chaves.get(f) && d)) chaves.set(f, d);
  }
  const lista = [...chaves.keys()];
  if (!lista.length) return new Map<string, { documento: string | null; cnae: string | null }>();
  const [salvos, pessoas, notas, conciliadas] = await (Promise.all([
    prisma.favorecidoExtrato.findMany({ where: { chave: { in: lista } } }),
    prisma.pessoa.findMany({ where: { documento: { not: null } }, select: { nome: true, fantasia: true, documento: true } }),
    prisma.notaRecebida.findMany({ select: { emitenteNome: true, emitenteDocumento: true }, distinct: ["emitenteDocumento"] }),
    // quem já foi conciliado: o favorecido ganha o CPF/CNPJ da pessoa da conta baixada
    prisma.transacaoBancaria.findMany({
      where: { situacao: "CONCILIADA", lancamentos: { some: { pessoa: { documento: { not: null } } } } }, orderBy: { data: "desc" }, take: 3000,
      select: { descricao: true, lancamentos: { select: { pessoa: { select: { documento: true } } } } },
    }),
  ]));
  const porHistorico = new Map<string, string>();
  for (const t of conciliadas) {
    const ds = [...new Set(t.lancamentos.map((l) => l.pessoa?.documento).filter((x): x is string => !!x))];
    if (ds.length === 1) porHistorico.set(favorecido(t.descricao), ds[0]);
  }
  const porNome = new Map<string, string>();
  for (const p of pessoas) for (const n of [p.nome, p.fantasia]) if (n && p.documento) porNome.set(favorecido(n) || normalizar(n), p.documento);
  for (const n of notas) if (!porNome.has(favorecido(n.emitenteNome))) porNome.set(favorecido(n.emitenteNome), n.emitenteDocumento.replace(/\D/g, ""));
  const salvo = new Map(salvos.map((x) => [x.chave, x]));
  const out = new Map<string, { documento: string | null; cnae: string | null }>();
  for (const f of lista) {
    const s = salvo.get(f);
    // nome do extrato costuma vir cortado: aceita o cadastro cujo nome começa igual
    let doc = s?.documento ?? chaves.get(f) ?? porNome.get(f) ?? porHistorico.get(f) ?? null;
    if (!doc && f.length >= 8) for (const [n, d] of porNome) if (n.startsWith(f) || f.startsWith(n)) { doc = d; break; }
    out.set(f, { documento: doc, cnae: s?.cnae ?? null });
  }
  return out;
}

/**
 * Análise pronta por empresa/conta: refeita só quando algo muda (contas, extrato, regras, funcionários) ou depois de
 * 10 minutos. Trocar de aba, filtro ou ordem não refaz a análise (antes cada clique levava vários segundos).
 */
const cacheAnalise = new Map<string, { marca: string; ate: number; linhas: LinhaAnalise[] }>();
const VALIDADE_ANALISE = 10 * 60000;

/** Esquece as análises guardadas (depois de confirmar, ignorar ou desfazer na conciliação). */
export function limparAnaliseConciliacao() {
  cacheAnalise.clear();
}

/** O que, se mudar, muda a análise: contas (inclui baixas e exclusões), linhas do extrato, regras, funcionários e o dia. */
async function marcaDaAnalise(contaBancariaId?: string) {
  const [l, t, r, u, f] = await Promise.all([
    prisma.lancamento.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.transacaoBancaria.groupBy({ by: ["situacao"], where: contaBancariaId ? { contaBancariaId } : {}, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.regraConciliacao.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.usuario.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
    prisma.cobrancaPix.aggregate({ _count: { _all: true }, _max: { updatedAt: true } }),
  ]);
  const ms = (d: Date | null | undefined) => d?.getTime() ?? 0;
  return [
    iso(diaSP()), l._count._all, ms(l._max.updatedAt), ...t.sort((a, b) => a.situacao.localeCompare(b.situacao)).map((x) => `${x.situacao}:${x._count._all}:${ms(x._max.createdAt)}`),
    r._count._all, ms(r._max.updatedAt), u._count._all, ms(u._max.updatedAt), f._count._all, ms(f._max.updatedAt),
  ].join("|");
}

export async function analisarExtrato(filtro: { contaBancariaId?: string } = {}) {
  const { lojaAtualId } = await import("@/lib/empresa/loja");
  const chave = `${(await lojaAtualId()) ?? ""}|${filtro.contaBancariaId ?? ""}`;
  const antes = await marcaDaAnalise(filtro.contaBancariaId);
  const guardada = cacheAnalise.get(chave);
  if (guardada && guardada.marca === antes && guardada.ate > Date.now()) return guardada.linhas;
  const linhas = await refazerAnalise(filtro);
  // a análise pode amarrar boletos/Pix do PDV (muda a marca): guarda com a marca de depois
  cacheAnalise.set(chave, { marca: await marcaDaAnalise(filtro.contaBancariaId), ate: Date.now() + VALIDADE_ANALISE, linhas });
  if (cacheAnalise.size > 50) cacheAnalise.delete(cacheAnalise.keys().next().value!);
  return linhas;
}

async function refazerAnalise(filtro: { contaBancariaId?: string }) {
  // FGTS, INSS, Simples Nacional e plano de saúde dos funcionários precisam existir para as sugestões pelo nome
  await prisma.$transaction((tx) => garantirCategoriasPessoal(tx));
  // boleto recebido não precisa de conciliação: amarra os do ERP e tira os outros da lista (regra do Luiz, 22/11)
  const { conciliarPorBoleto, tirarBoletosRecebidos } = await import("./extrato");
  const contas = await prisma.transacaoBancaria.findMany({ where: { situacao: "PENDENTE", valor: { gt: 0 }, documento: { not: null }, ...(filtro.contaBancariaId ? { contaBancariaId: filtro.contaBancariaId } : {}) }, distinct: ["contaBancariaId"], select: { contaBancariaId: true } });
  const { conciliarPixDoPdv } = await import("./pixInter");
  for (const c of contas) { await conciliarPorBoleto(c.contaBancariaId); await conciliarPixDoPdv(c.contaBancariaId); }
  await tirarBoletosRecebidos(filtro.contaBancariaId);
  const ts = await prisma.transacaoBancaria.findMany({
    where: { situacao: "PENDENTE", ...(filtro.contaBancariaId ? { contaBancariaId: filtro.contaBancariaId } : {}) },
    include: { contaBancaria: { select: { nome: true } } },
    orderBy: [{ data: "asc" }, { createdAt: "asc" }],
    take: 2000,
  });
  if (!ts.length) return [];
  const min = new Date(ts[0].data.getTime() - 90 * DIA);
  const max = new Date(ts[ts.length - 1].data.getTime() + 30 * DIA);
  // cada empresa tem as suas contas bancárias: procura e aprende nos lançamentos da empresa atual
  const [abertos, conciliadas, comCentro, categorias, pessoal, regras, contasPessoas] = await (Promise.all([
    prisma.lancamento.findMany({
      where: { pagoEm: null, transferenciaId: null, vencimento: { gte: min, lte: max } },
      include: { pessoa: { select: { nome: true, fantasia: true, documento: true } }, boletos: { select: { nossoNumero: true, txid: true } }, formaPagamento: { select: { tPag: true, nome: true } } },
    }),
    prisma.transacaoBancaria.findMany({
      where: { situacao: "CONCILIADA" }, orderBy: { data: "desc" }, take: 3000,
      select: { id: true, descricao: true, documento: true, contraparteDocumento: true, lancamentos: { select: { pessoaId: true, categoriaId: true, centroCustoId: true, idLegado: true } } },
    }),
    prisma.lancamento.findMany({ where: { centroCustoId: { not: null } }, orderBy: { vencimento: "desc" }, take: 5000, select: { pessoaId: true, categoriaId: true, centroCustoId: true } }),
    prisma.categoriaFinanceira.findMany({ where: { ativa: true }, select: { id: true, nome: true, tipo: true } }),
    carregarPessoal(),
    prisma.regraConciliacao.findMany({ where: { ativa: true } }),
    // categorias das contas de cada cliente/fornecedor (compras, vendas, despesas): ensinam a categoria do avulso
    prisma.lancamento.findMany({
      where: { pessoaId: { not: null }, transferenciaId: null }, orderBy: { vencimento: "desc" }, take: 8000,
      select: { pessoaId: true, tipo: true, categoriaId: true, pessoa: { select: { nome: true, fantasia: true } } },
    }),
  ]));
  const h = montarHistorico(
    conciliadas.map((t) => ({ descricao: t.descricao, lancamentos: t.lancamentos.map((l) => ({ ...l, avulso: l.idLegado === `extrato:${t.id}` })) })),
    comCentro,
  );
  const porPessoa = new Map<string, CategoriasDaPessoa>();
  for (const l of contasPessoas) {
    if (!l.pessoa) continue;
    const k = `${l.pessoaId}|${l.tipo}`;
    const e = porPessoa.get(k) ?? { nomes: [l.pessoa.nome, l.pessoa.fantasia].filter((x): x is string => !!x), tipo: l.tipo, categorias: new Map<string, number>() };
    somar(e.categorias, l.categoriaId);
    porPessoa.set(k, e);
  }
  // momento das vendas/OS feitas no MXERP (as importadas do Gestão Click têm a hora da importação, não servem)
  const idsDe = (tipo: string) => [...new Set(abertos.filter((l) => !l.idLegado && l.origemTipo === tipo && l.origemId).map((l) => l.origemId!))];
  const [docs, vendas, oss] = await Promise.all([
    documentosDosFavorecidos([...ts, ...conciliadas]),
    prisma.venda.findMany({ where: { id: { in: idsDe("VENDA") }, idLegado: null }, select: { id: true, createdAt: true, data: true } }),
    prisma.ordemServico.findMany({ where: { id: { in: idsDe("OS") }, idLegado: null }, select: { id: true, createdAt: true, saida: true } }),
  ]);
  const momentosDoc = new Map<string, Date[]>([
    ...vendas.map((v): [string, Date[]] => [`VENDA|${v.id}`, [v.createdAt, v.data]]),
    ...oss.map((o): [string, Date[]] => [`OS|${o.id}`, [o.createdAt, ...(o.saida ? [o.saida] : [])]]),
  ]);
  const ramos = new Map<string, RamoFavorecido>();
  for (const [f, d] of docs) if (d.documento || d.cnae) ramos.set(f, { cnae: d.cnae ?? "", documento: d.documento });
  return analisar(
    ts.map((t) => ({
      id: t.id, data: t.data, valor: Number(t.valor), descricao: t.descricao, documento: t.documento, conta: t.contaBancaria.nome, contaBancariaId: t.contaBancariaId,
      dataHora: t.dataHora, contraparteDocumento: t.contraparteDocumento, criadaEm: t.createdAt,
    })),
    abertos.map((l) => ({
      id: l.id, tipo: l.tipo, valor: Number(l.valor), vencimento: l.vencimento, descricao: l.descricao,
      pessoa: l.pessoa ? [l.pessoa.nome, l.pessoa.fantasia].filter(Boolean).join(" / ") : null, pessoaId: l.pessoaId, categoriaId: l.categoriaId, centroCustoId: l.centroCustoId,
      pessoaNomes: l.pessoa ? [l.pessoa.nome, l.pessoa.fantasia].filter((x): x is string => !!x) : [], pessoaDocumento: l.pessoa?.documento ?? null,
      boletos: l.boletos.flatMap((b) => [b.nossoNumero, b.txid]).filter((x): x is string => !!x),
      momentos: l.idLegado || !l.origemId ? [] : [l.createdAt, ...(momentosDoc.get(`${l.origemTipo}|${l.origemId}`) ?? [])],
      formaPix: l.formaPagamento ? ehPix(l.formaPagamento) : null,
    })),
    h, categorias, diaSP(), ramos, pessoal, regras, [...porPessoa.values()],
  );
}

/** Funcionários cadastrados (ativos) com o último salário lançado pela conciliação, e as categorias de pessoal. */
export async function carregarPessoal(): Promise<PessoalAnalise | null> {
  const funcs = await prisma.usuario.findMany({ where: { ativo: true }, select: { id: true, nome: true, cpf: true, salario: true } });
  if (!funcs.length) return null;
  const categorias = await prisma.$transaction((tx) => garantirCategoriasPessoal(tx));
  // salário de referência: o último "Salário MM/AAAA - NOME" lançado
  const salarios = await (prisma.lancamento.findMany({
    where: { categoriaId: categorias.SALARIO, descricao: { startsWith: `${CATEGORIAS_PESSOAL.SALARIO.nome.slice(0, 7)} ` } },
    orderBy: { competencia: "desc" }, take: 500, select: { descricao: true, valor: true },
  }));
  const ref = new Map<string, number>();
  for (const l of salarios) {
    const nome = l.descricao.split(" - ").slice(1).join(" - ").trim();
    if (nome && !ref.has(nome)) ref.set(nome, Number(l.valor));
  }
  return {
    categorias,
    funcionarios: funcs.map((f) => ({ id: f.id, nome: f.nome, cpf: f.cpf?.replace(/\D/g, "") || null, salarioRef: f.salario != null ? Number(f.salario) : ref.get(f.nome.toUpperCase()) ?? null })),
  };
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
    const ts = await prisma.transacaoBancaria.findMany({ where: { situacao: "PENDENTE", valor: { lt: 0 } }, select: { descricao: true, documento: true, contraparteDocumento: true } });
    const docs = await documentosDosFavorecidos(ts);
    const feitos = new Set((await prisma.favorecidoExtrato.findMany({ where: { chave: { in: [...docs.keys()] }, OR: [{ consultadoEm: { not: null }, erro: null }, { consultadoEm: { gt: new Date(Date.now() - 86400000) } }] }, select: { chave: true } })).map((x) => x.chave));
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
