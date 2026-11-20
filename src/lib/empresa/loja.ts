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
]);

type Ctx = { loja?: string | null; todas?: boolean };
const contexto = new AsyncLocalStorage<Ctx>();

/** Roda com uma loja definida (agendador, scripts, processamento de contratos). */
export const naLoja = <T>(lojaId: string | null, fn: () => Promise<T>) => contexto.run({ loja: lojaId }, async () => await fn());
/** Roda sem filtro de loja (relatórios consolidados, conciliação bancária, migração). */
export const todasAsLojas = <T>(fn: () => Promise<T>) => contexto.run({ todas: true }, async () => await fn());

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
  const ctx = contexto.getStore();
  if (ctx?.todas) return null;
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

/** Extensão do Prisma: grava a loja nos registros novos e filtra as listagens. `base` = cliente sem extensões. */
export function extensaoLoja(base: PrismaClient) {
  return {
    name: "loja",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: { model?: string; operation: string; args: unknown; query: (a: unknown) => Promise<unknown> }) {
          if (!model || !MODELOS_POR_LOJA.has(model)) return query(args);
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
