import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

/**
 * Multiempresa ("lojas", como no Gestão Click): cada CNPJ é uma Empresa.
 *
 *  - Compartilhado entre as lojas: clientes, fornecedores, produtos, serviços, plano de contas, formas de pagamento,
 *    contas bancárias e usuários (cada usuário escolhe em quais lojas entra, em Usuario.lojas; vazio = todas).
 *  - Separado por loja (coluna empresaId): vendas, OS, orçamentos, compras, financeiro, caixa do PDV, notas fiscais,
 *    contratos, chamados, estoque (depósitos) e os documentos de estoque.
 *
 * A loja atual fica no cookie mxerp_loja (trocada no cartão da empresa, no topo do menu). A extensão do Prisma abaixo
 * grava a loja atual em todo registro novo desses modelos e filtra as listagens por ela. Registros antigos sem loja
 * (empresaId nulo) aparecem em todas. Consultas por um registro específico (id, origemId, número, chave…) não são
 * filtradas, para que um link para a venda de outra loja continue abrindo.
 */
export const COOKIE_LOJA = "mxerp_loja";

export const MODELOS_POR_LOJA = new Set([
  "Venda", "OrdemServico", "Orcamento", "Compra", "Lancamento", "CaixaPdv", "NotaFiscal", "NotaRecebida",
  "InutilizacaoNumeracao", "Contrato", "Deposito", "AjusteEstoque", "Inventario", "Devolucao", "Cotacao", "Chamado",
  "TransferenciaEstoque",
]);

/** Campos que apontam para um registro específico: com eles a consulta não é filtrada pela loja. */
const REFERENCIAS = new Set([
  "id", "origemId", "chave", "numero", "token", "osId", "vendaId", "compraId", "contratoId", "lancamentoId", "notaId",
  "caixaId", "contaBancariaId", "depositoId", "localId", "transacaoId", "transferenciaId", "devolucaoId", "orcamentoId",
  "cotacaoId", "chamadoId", "inventarioId", "ajusteId", "boletoId", "empresaId", "idLegado", "chaveNfe",
  // cadastros do grupo (Pessoa, Produto, Serviço): achar pelo documento ou código mesmo se for só de outra empresa
  "documento", "codigo", "codigoCliente", "codigoFornecedor", "codigoTransportadora", "codigoBarras",
]);

/**
 * Estrutura separada por empresa (coluna empresaId, "" = a principal, a primeira cadastrada): cada CNPJ tem o seu
 * plano de contas, centros de custo, formas de pagamento, contas bancárias, regras da conciliação, modelos de
 * mensagem, situações, canais e campos extras. A empresa nova nasce com uma cópia da principal (estrutura.ts).
 * Para achar pelo nome, use `{ empresaId_nome: { empresaId: LOJA_ATUAL, nome } }`: a extensão troca pela empresa atual.
 */
export const MODELOS_ESTRUTURA = new Set([
  "CategoriaFinanceira", "CentroCusto", "FormaPagamento", "ContaBancaria", "RegraConciliacao", "ModeloMensagem",
  "SituacaoOsConfig", "SituacaoVendaConfig", "SituacaoCompraConfig", "SituacaoOrcamento", "CanalVenda", "CampoExtra",
]);
/** Guardados por chave: a da principal com a chave pura; a das outras empresas, "chave#emp:<id>". */
const MODELOS_CHAVE = new Set(["Configuracao", "FavorecidoExtrato"]);
/** Cadastros do grupo: aparecem nas empresas marcadas no cadastro (lojas; vazio = todas). */
export const MODELOS_GRUPO = new Set(["Pessoa", "Produto", "Servico"]);
/** Marcador trocado pela empresa da estrutura atual ("" na principal). */
export const LOJA_ATUAL = "\u0000empresa-atual";
const SUFIXO = "#emp:";

type Ctx = { loja?: string | null; todas?: boolean; estrutura?: string | null };
const contexto = new AsyncLocalStorage<Ctx>();

/** Roda com uma loja definida (agendador, scripts, processamento de contratos). */
export const naLoja = <T>(lojaId: string | null, fn: () => Promise<T>) => contexto.run({ loja: lojaId }, async () => await fn());
/** Roda sem filtro de loja (relatórios consolidados, conciliação bancária, migração). */
export const todasAsLojas = async <T>(fn: () => Promise<T>) => {
  // a estrutura (plano de contas, contas bancárias…) continua a da empresa de quem está usando
  const { prisma } = await import("@/lib/db");
  const estrutura = await lojaReal(prisma as unknown as PrismaClient);
  return contexto.run({ todas: true, estrutura }, async () => await fn());
};

type EmpresaResumo = { id: string; ativa: boolean };
let cacheEmpresas: { lista: EmpresaResumo[]; ate: number } | null = null;
const cacheUsuario = new Map<string, { lojas: string[]; ate: number }>();

/** Esquece o cache (depois de cadastrar/alterar empresa ou usuário). */
export function limparCacheLojas() {
  cacheEmpresas = null;
  cacheUsuario.clear();
}

async function empresas(base: PrismaClient): Promise<EmpresaResumo[]> {
  if (cacheEmpresas && cacheEmpresas.ate > Date.now()) return cacheEmpresas.lista;
  const lista = await base.empresa.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, ativa: true } });
  cacheEmpresas = { lista, ate: Date.now() + 30_000 };
  return lista;
}

/** Lojas que o usuário pode usar (vazio no cadastro = todas as ativas). */
export function lojasPermitidas(todas: EmpresaResumo[], doUsuario: string[]) {
  const ativas = todas.filter((e) => e.ativa);
  const lista = doUsuario.length ? ativas.filter((e) => doUsuario.includes(e.id)) : ativas;
  return lista.length ? lista : ativas;
}

/** Escolhe a loja: a do cookie, se o usuário tem acesso; senão a primeira permitida. */
export function escolherLoja(permitidas: { id: string }[], doCookie: string | null | undefined) {
  if (doCookie && permitidas.some((e) => e.id === doCookie)) return doCookie;
  return permitidas[0]?.id ?? null;
}

/**
 * Loja da requisição atual. null = sem filtro (nenhuma empresa cadastrada, agendador, scripts, ou todasAsLojas).
 * Usa o cliente sem extensão (base) para não entrar em laço.
 */
export async function lojaDoContexto(base: PrismaClient): Promise<string | null> {
  if (contexto.getStore()?.todas) return null;
  return lojaReal(base);
}

/** Loja de quem está usando, mesmo dentro de todasAsLojas. */
async function lojaReal(base: PrismaClient): Promise<string | null> {
  const ctx = contexto.getStore();
  if (ctx?.todas) return ctx.estrutura ?? null;
  if (ctx && "loja" in ctx) return ctx.loja ?? null;
  let sessao: string | undefined, cookieLoja: string | undefined;
  try {
    const { cookies } = await import("next/headers");
    const c = await cookies();
    sessao = c.get("mxerp_sessao")?.value;
    cookieLoja = c.get(COOKIE_LOJA)?.value;
  } catch {
    return null; // fora de uma requisição web
  }
  if (!sessao) return null; // agendador e rotas públicas: sem loja
  const todas = await empresas(base);
  if (!todas.length) return null;
  const chave = createHash("sha256").update(sessao).digest("hex");
  let u = cacheUsuario.get(chave);
  if (!u || u.ate < Date.now()) {
    const s = await base.sessao.findUnique({ where: { tokenHash: chave }, select: { usuario: { select: { lojas: true } } } });
    u = { lojas: s?.usuario.lojas ?? [], ate: Date.now() + 30_000 };
    cacheUsuario.set(chave, u);
  }
  return escolherLoja(lojasPermitidas(todas, u.lojas), cookieLoja);
}

const LEITURAS = new Set(["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy"]);

/** true quando o where aponta para um registro específico (não é uma listagem). */
export function consultaPorReferencia(where: unknown): boolean {
  if (!where || typeof where !== "object") return false;
  const w = where as Record<string, unknown>;
  for (const [k, v] of Object.entries(w)) {
    if (REFERENCIAS.has(k) && v !== undefined && v !== null) return true; // "campo: null" é filtro, não referência
    if (k === "AND") {
      const lista = Array.isArray(v) ? v : [v];
      if (lista.some(consultaPorReferencia)) return true;
    }
    // OR em que todas as opções apontam para um registro (ex.: idLegado ou número)
    if (k === "OR" && Array.isArray(v) && v.length && v.every(consultaPorReferencia)) return true;
  }
  return false;
}

/** Acrescenta o filtro da loja (registros da loja ou sem loja). */
export function filtrarPorLoja(where: unknown, loja: string) {
  const f = { OR: [{ empresaId: loja }, { empresaId: null }] };
  return where && Object.keys(where as object).length ? { AND: [where, f] } : f;
}

const comLoja = (data: unknown, loja: string) => {
  if (!data || typeof data !== "object") return data;
  const d = data as Record<string, unknown>;
  return d.empresaId === undefined ? { ...d, empresaId: loja } : d;
};

/** Empresa da estrutura atual: "" para a principal (ou sem empresa no contexto), senão o id. */
export async function empresaDaEstrutura(base: PrismaClient): Promise<string> {
  const loja = await lojaReal(base);
  if (!loja) return "";
  return (await empresas(base))[0]?.id === loja ? "" : loja;
}

/** Troca o marcador LOJA_ATUAL pela empresa (em where/data, em qualquer nível). */
function trocarMarcador(v: unknown, emp: string): unknown {
  if (v === LOJA_ATUAL) return emp;
  if (Array.isArray(v)) return v.map((x) => trocarMarcador(x, emp));
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, trocarMarcador(x, emp)]));
  }
  return v;
}
const temMarcador = (v: unknown): boolean =>
  v === LOJA_ATUAL || (Array.isArray(v) ? v.some(temMarcador) : !!v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype && Object.values(v).some(temMarcador));

const comEmpresa = (data: unknown, emp: string) => {
  if (!data || typeof data !== "object") return data;
  const d = data as Record<string, unknown>;
  return d.empresaId === undefined ? { ...d, empresaId: emp } : d;
};
const GRAVA_LISTA = new Set(["updateMany", "deleteMany", "updateManyAndReturn"]);

async function estrutura(base: PrismaClient, operation: string, a: Record<string, unknown>, query: (a: unknown) => Promise<unknown>) {
  const emp = await empresaDaEstrutura(base);
  let x = temMarcador(a) ? (trocarMarcador(a, emp) as Record<string, unknown>) : a;
  if (operation === "create") x = { ...x, data: comEmpresa(x.data, emp) };
  else if (operation === "createMany" || operation === "createManyAndReturn") x = { ...x, data: Array.isArray(x.data) ? x.data.map((d) => comEmpresa(d, emp)) : comEmpresa(x.data, emp) };
  else if (operation === "upsert") x = { ...x, create: comEmpresa(x.create, emp) };
  else if ((LEITURAS.has(operation) || GRAVA_LISTA.has(operation)) && !consultaPorReferencia(x.where)) {
    const f = { empresaId: emp };
    x = { ...x, where: x.where && Object.keys(x.where as object).length ? { AND: [x.where, f] } : f };
  }
  return query(x);
}

/** Configuração/favorecido: a chave ganha o sufixo da empresa (menos na principal), e o resultado volta sem ele. */
async function porChave(base: PrismaClient, operation: string, a: Record<string, unknown>, query: (a: unknown) => Promise<unknown>) {
  const emp = await empresaDaEstrutura(base);
  if (!emp) {
    if (LEITURAS.has(operation) || GRAVA_LISTA.has(operation)) {
      const f = { NOT: { chave: { contains: SUFIXO } } };
      return query({ ...a, where: a.where && Object.keys(a.where as object).length ? { AND: [a.where, f] } : f });
    }
    return query(a);
  }
  const suf = `${SUFIXO}${emp}`;
  const comSufixo = (w: unknown) => {
    if (!w || typeof w !== "object") return w;
    const o = w as Record<string, unknown>;
    if (typeof o.chave === "string") return { ...o, chave: o.chave + suf };
    if (o.chave && typeof o.chave === "object") {
      const c = o.chave as Record<string, unknown>;
      return { ...o, chave: { ...c, ...(Array.isArray(c.in) ? { in: c.in.map((k) => `${k}${suf}`) } : {}), ...(typeof c.equals === "string" ? { equals: c.equals + suf } : {}) } };
    }
    return o;
  };
  const tirar = (r: unknown): unknown => {
    if (Array.isArray(r)) return r.map(tirar);
    if (r && typeof r === "object" && typeof (r as { chave?: unknown }).chave === "string") {
      const o = r as { chave: string };
      return o.chave.endsWith(suf) ? { ...o, chave: o.chave.slice(0, -suf.length) } : o;
    }
    return r;
  };
  const x: Record<string, unknown> = { ...a };
  if (x.where) x.where = comSufixo(x.where);
  if (operation === "create") x.data = comSufixo(x.data);
  if (operation === "createMany" || operation === "createManyAndReturn") x.data = Array.isArray(x.data) ? x.data.map(comSufixo) : comSufixo(x.data);
  if (operation === "upsert") x.create = comSufixo(x.create);
  if ((LEITURAS.has(operation) || GRAVA_LISTA.has(operation)) && !(x.where && typeof (x.where as { chave?: unknown }).chave === "string")) {
    const f = { chave: { endsWith: suf } };
    x.where = x.where && Object.keys(x.where as object).length ? { AND: [x.where, f] } : f;
  }
  return tirar(await query(x));
}

/** Clientes, produtos e serviços: do grupo, e aparecem só nas empresas marcadas em "lojas" (vazio = em todas). */
async function doGrupo(base: PrismaClient, operation: string, a: Record<string, unknown>, query: (a: unknown) => Promise<unknown>) {
  if (!LEITURAS.has(operation) || consultaPorReferencia(a.where)) return query(a);
  const loja = await lojaDoContexto(base);
  if (!loja) return query(a);
  const f = { OR: [{ lojas: { has: loja } }, { lojas: { isEmpty: true } }] };
  return query({ ...a, where: a.where && Object.keys(a.where as object).length ? { AND: [a.where, f] } : f });
}

/** Extensão do Prisma: grava a loja nos registros novos e filtra as listagens. `base` = cliente sem extensões. */
export function extensaoLoja(base: PrismaClient) {
  return {
    name: "loja",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: { model?: string; operation: string; args: unknown; query: (a: unknown) => Promise<unknown> }) {
          if (!model) return query(args);
          if (MODELOS_ESTRUTURA.has(model)) return estrutura(base, operation, (args ?? {}) as Record<string, unknown>, query);
          if (MODELOS_CHAVE.has(model)) return porChave(base, operation, (args ?? {}) as Record<string, unknown>, query);
          if (MODELOS_GRUPO.has(model)) return doGrupo(base, operation, (args ?? {}) as Record<string, unknown>, query);
          if (!MODELOS_POR_LOJA.has(model)) return query(args);
          const a = (args ?? {}) as Record<string, unknown>;
          if (operation === "create" || operation === "createMany" || operation === "upsert" || LEITURAS.has(operation)) {
            if (LEITURAS.has(operation) && consultaPorReferencia(a.where)) return query(args);
            const loja = await lojaDoContexto(base);
            if (!loja) return query(args);
            if (operation === "create") return query({ ...a, data: comLoja(a.data, loja) });
            if (operation === "createMany") return query({ ...a, data: Array.isArray(a.data) ? a.data.map((d) => comLoja(d, loja)) : comLoja(a.data, loja) });
            if (operation === "upsert") return query({ ...a, create: comLoja(a.create, loja) });
            return query({ ...a, where: filtrarPorLoja(a.where, loja) });
          }
          return query(args);
        },
      },
    },
  };
}

/** Loja atual usando o cliente da aplicação (para consultas em SQL puro, que não passam pela extensão). */
export async function lojaAtualId(): Promise<string | null> {
  const { prisma } = await import("@/lib/db");
  return lojaDoContexto(prisma as unknown as PrismaClient);
}

/**
 * Trecho SQL "AND (coluna da loja é a atual ou vazia)" para relatórios em SQL puro.
 * Vazio quando não há loja no contexto (agendador, todasAsLojas).
 */
export async function sqlDaLoja(coluna: string) {
  const loja = await lojaAtualId();
  return loja ? Prisma.sql` AND (${Prisma.raw(coluna)} IS NULL OR ${Prisma.raw(coluna)} = ${loja})` : Prisma.empty;
}

/** Trecho SQL "AND (cadastro marcado para a loja atual ou para todas)" para as buscas em SQL puro de clientes e itens. */
export async function sqlDoGrupo(coluna: string) {
  const loja = await lojaAtualId();
  return loja ? Prisma.sql` AND (coalesce(cardinality(${Prisma.raw(coluna)}), 0) = 0 OR ${loja} = ANY(${Prisma.raw(coluna)}))` : Prisma.empty;
}
