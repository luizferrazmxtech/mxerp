import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

/**
 * Auditoria automática ("quem alterou o quê"): toda criação, alteração e exclusão nos cadastros e documentos
 * listados em AUDITADOS vira um RegistroAuditoria, com o usuário logado (pelo cookie da requisição), o IP e,
 * nas alterações, os campos que mudaram (antes → depois). Senhas e segredos aparecem como "***".
 */
export const AUDITADOS: Record<string, { rotulo: string; titulo?: (r: Record<string, unknown>) => string }> = {
  Venda: { rotulo: "venda", titulo: (r) => `nº ${r.numero}` },
  OrdemServico: { rotulo: "OS", titulo: (r) => `nº ${r.numero}` },
  OsTrabalho: { rotulo: "tempo de mão de obra da OS", titulo: (r) => (r.inicio ? `trecho de ${new Date(r.inicio as string | Date).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "") },
  Orcamento: { rotulo: "orçamento", titulo: (r) => `nº ${r.numero}` },
  Compra: { rotulo: "compra", titulo: (r) => `nº ${r.numero}` },
  Contrato: { rotulo: "contrato", titulo: (r) => `nº ${r.numero}` },
  Devolucao: { rotulo: "devolução", titulo: (r) => `nº ${r.numero}` },
  Lancamento: { rotulo: "lançamento financeiro", titulo: (r) => String(r.descricao ?? "") },
  NotaFiscal: { rotulo: "nota fiscal", titulo: (r) => `${r.modelo} ${r.serie}/${r.numero}` },
  NotaRecebida: { rotulo: "nota recebida", titulo: (r) => `${r.emitenteNome ?? ""}` },
  InutilizacaoNumeracao: { rotulo: "inutilização", titulo: (r) => `${r.modelo} ${r.numeroInicial}–${r.numeroFinal}` },
  Pessoa: { rotulo: "cadastro de pessoa", titulo: (r) => String(r.nome ?? "") },
  Produto: { rotulo: "produto", titulo: (r) => `${r.codigo ?? ""} ${r.nome ?? ""}`.trim() },
  Servico: { rotulo: "serviço", titulo: (r) => `${r.codigo ?? ""} ${r.nome ?? ""}`.trim() },
  Usuario: { rotulo: "usuário/funcionário", titulo: (r) => String(r.nome ?? "") },
  ContaBancaria: { rotulo: "conta bancária", titulo: (r) => String(r.nome ?? "") },
  CategoriaFinanceira: { rotulo: "plano de contas", titulo: (r) => String(r.nome ?? "") },
  CentroCusto: { rotulo: "centro de custo", titulo: (r) => String(r.nome ?? "") },
  FormaPagamento: { rotulo: "forma de pagamento", titulo: (r) => String(r.nome ?? "") },
  Empresa: { rotulo: "dados da empresa", titulo: (r) => String(r.razaoSocial ?? "") },
  IntegracaoInter: { rotulo: "integração Banco Inter" },
  Configuracao: { rotulo: "configuração", titulo: (r) => String(r.chave ?? "") },
  SituacaoVendaConfig: { rotulo: "situação de venda", titulo: (r) => String(r.nome ?? "") },
  SituacaoOsConfig: { rotulo: "situação de OS", titulo: (r) => String(r.nome ?? "") },
  CaixaPdv: { rotulo: "caixa do PDV" },
  MovimentoCaixa: { rotulo: "sangria/suprimento", titulo: (r) => `${r.tipo ?? ""} ${r.valor ?? ""}` },
  AjusteEstoque: { rotulo: "ajuste de estoque", titulo: (r) => `nº ${r.numero}` },
  TransferenciaEstoque: { rotulo: "transferência de estoque", titulo: (r) => `nº ${r.numero}` },
  Inventario: { rotulo: "inventário", titulo: (r) => `nº ${r.numero}` },
  ValeCompra: { rotulo: "vale-compra" },
  PermissaoPapel: { rotulo: "permissão", titulo: (r) => `${r.papel ?? ""} ${r.acao ?? ""}` },
  Chamado: { rotulo: "chamado", titulo: (r) => `nº ${r.numero}` },
};

const IGNORAR = new Set(["updatedAt", "createdAt", "foto", "fotoTipo", "preferencias", "xml", "bytes"]);
const SECRETO = /senha|secret|cifrad|token|csc|chavePix|pfx|hash/i;

export type Contexto = { usuarioId: string | null; usuarioNome: string | null; ip: string | null };
const contexto = new AsyncLocalStorage<{ desligado?: boolean; usuario?: Contexto }>();

/** Roda sem auditoria (importação em massa da migração: um registro-resumo é gravado à parte). */
// `await` dentro do run: consultas do Prisma só executam no then, que precisa acontecer dentro do contexto
export const semAuditoria = <T>(fn: () => Promise<T>) => contexto.run({ desligado: true }, async () => await fn());
/** Define o usuário para scripts e testes (fora de uma requisição web). */
export const comUsuario = <T>(usuario: Contexto, fn: () => Promise<T>) => contexto.run({ usuario }, async () => await fn());

const cache = new Map<string, { u: Contexto; ate: number }>();

/** Usuário da requisição atual pelo cookie de sessão (sem passar por lib/auth, que depende do prisma estendido). */
async function usuarioDaRequisicao(base: PrismaClient): Promise<Contexto> {
  const ctx = contexto.getStore();
  if (ctx?.usuario) return ctx.usuario;
  try {
    const { cookies, headers } = await import("next/headers");
    const token = (await cookies()).get("mxerp_sessao")?.value;
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
    if (!token) return { usuarioId: null, usuarioNome: null, ip };
    const chave = createHash("sha256").update(token).digest("hex");
    const c = cache.get(chave);
    if (c && c.ate > Date.now()) return { ...c.u, ip };
    const s = await base.sessao.findUnique({ where: { tokenHash: chave }, select: { usuario: { select: { id: true, nome: true } } } });
    const u = { usuarioId: s?.usuario.id ?? null, usuarioNome: s?.usuario.nome ?? null, ip };
    cache.set(chave, { u, ate: Date.now() + 60_000 });
    return u;
  } catch {
    return { usuarioId: null, usuarioNome: null, ip: null }; // fora de requisição (agendador, scripts, testes)
  }
}

const valor = (k: string, v: unknown) => {
  if (SECRETO.test(k)) return v == null || v === "" ? v : "***";
  if (v instanceof Date) return v.toISOString();
  // Decimal e número comparados como texto (10 enviado = Decimal 10 gravado)
  if (typeof v === "number" || (v && typeof v === "object" && "toFixed" in (v as object))) return String(v);
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return "[arquivo]";
  return v;
};

/** Campos que mudaram entre dois registros. */
export function diferencas(antes: Record<string, unknown> | null, depois: Record<string, unknown> | null) {
  const out: Record<string, [unknown, unknown]> = {};
  const chaves = new Set([...Object.keys(antes ?? {}), ...Object.keys(depois ?? {})]);
  for (const k of chaves) {
    if (IGNORAR.has(k)) continue;
    // compara o valor real (senha trocada aparece como alteração), mas grava mascarado
    const cru = (v: unknown) => JSON.stringify(valor("", v));
    if (cru(antes?.[k]) !== cru(depois?.[k])) {
      const a = valor(k, antes?.[k]), d = valor(k, depois?.[k]);
      out[k] = [a ?? null, SECRETO.test(k) && d != null && d !== "" ? "*** (alterado)" : d ?? null];
    }
  }
  return out;
}

function descrever(modelo: string, acao: string, r: Record<string, unknown> | null, campos?: Record<string, [unknown, unknown]>) {
  const cfg = AUDITADOS[modelo];
  const titulo = r && cfg?.titulo ? cfg.titulo(r).trim() : "";
  const verbo = acao === "CRIAR" ? "Cadastrou" : acao === "EXCLUIR" ? "Excluiu" : "Alterou";
  let d = `${verbo} ${cfg?.rotulo ?? modelo}${titulo ? ` ${titulo}` : ""}`;
  if (acao === "ALTERAR" && campos) {
    const nomes = Object.keys(campos);
    if (campos.situacao) d += `: situação de ${campos.situacao[0] ?? "—"} para ${campos.situacao[1] ?? "—"}`;
    else if (nomes.length) d += `: ${nomes.slice(0, 5).join(", ")}${nomes.length > 5 ? "…" : ""}`;
  }
  return d.slice(0, 500);
}

/** Só os campos simples (texto, número, data, decimal); relações e operações como { increment } ficam de fora. */
function escalares(o: unknown): Record<string, unknown> {
  if (!o || typeof o !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined) continue;
    if (v === null || typeof v !== "object" || v instanceof Date || Buffer.isBuffer(v) || (typeof (v as { toFixed?: unknown }).toFixed === "function")) out[k] = v;
  }
  return out;
}

const OPERACOES = new Set(["create", "update", "upsert", "delete", "updateMany", "deleteMany", "createMany"]);

/** Extensão do Prisma que grava a auditoria. `base` é o cliente sem extensão (para ler o "antes" e gravar o registro). */
export function extensaoAuditoria(base: PrismaClient) {
  const gravar = async (dados: { entidade: string; entidadeId: string | null; acao: string; descricao: string; campos?: object | null }) => {
    const u = await usuarioDaRequisicao(base);
    try {
      await base.registroAuditoria.create({ data: { ...dados, campos: (dados.campos ?? undefined) as object | undefined, usuarioId: u.usuarioId, usuarioNome: u.usuarioNome, ip: u.ip } });
    } catch { /* auditoria nunca derruba a operação */ }
  };
  return {
    name: "auditoria",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: { model?: string; operation: string; args: unknown; query: (a: unknown) => Promise<unknown> }) {
          if (!model || !AUDITADOS[model] || !OPERACOES.has(operation) || contexto.getStore()?.desligado) return query(args);
          const delegate = (base as unknown as Record<string, { findUnique: (a: unknown) => Promise<Record<string, unknown> | null>; findMany: (a: unknown) => Promise<{ id: string }[]> }>)[model[0].toLowerCase() + model.slice(1)];
          const a = args as { where?: unknown; data?: unknown };
          if (operation === "createMany") {
            const r = await query(args) as { count: number };
            await gravar({ entidade: model, entidadeId: null, acao: "CRIAR", descricao: `Cadastrou ${r.count} ${AUDITADOS[model].rotulo}(s)` });
            return r;
          }
          if (operation === "updateMany" || operation === "deleteMany") {
            const pk = model === "Configuracao" ? "chave" : "id";
            const ids = (await delegate.findMany({ where: a.where, select: { [pk]: true }, take: 50 }).catch(() => [])).map((x) => (x as Record<string, string>)[pk]);
            const r = await query(args) as { count: number };
            if (r.count) await gravar({ entidade: model, entidadeId: ids.length === 1 ? ids[0] : null, acao: operation === "deleteMany" ? "EXCLUIR" : "ALTERAR",
              descricao: `${operation === "deleteMany" ? "Excluiu" : "Alterou"} ${r.count} ${AUDITADOS[model].rotulo}(s)`, campos: { ids, ...(operation === "updateMany" ? { dados: diferencas(null, a.data as Record<string, unknown>) } : {}) } });
            return r;
          }
          // "antes" é lido fora da transação (estado gravado); "depois" = antes + dados enviados + o que o banco devolveu
          const antes = operation === "create" ? null : await delegate.findUnique({ where: a.where }).catch(() => null);
          const r = await query(args) as Record<string, unknown>;
          const id = (r?.id as string) ?? (antes?.id as string) ?? (r?.chave as string) ?? null;
          const depois = operation === "delete" ? null : { ...(antes ?? {}), ...escalares(operation === "upsert" ? (antes ? (a as { update?: unknown }).update : (a as { create?: unknown }).create) : a.data), ...escalares(r) };
          const acao = operation === "delete" ? "EXCLUIR" : operation === "update" || (operation === "upsert" && antes) ? "ALTERAR" : "CRIAR";
          const campos = acao === "ALTERAR" ? diferencas(antes, depois) : acao === "EXCLUIR" ? diferencas(antes, null) : null;
          if (acao === "ALTERAR" && !Object.keys(campos ?? {}).length) return r;
          await gravar({ entidade: model, entidadeId: id, acao, descricao: descrever(model, acao, depois ?? antes, campos ?? undefined), campos });
          return r;
        },
      },
    },
  };
}

/** Registro manual (eventos que não são gravação de um cadastro: login, importação, exportação…). */
export async function registrarAuditoria(usuario: { id: string; nome: string } | null, d: { entidade: string; entidadeId?: string | null; acao: string; descricao: string; campos?: object }) {
  const { prisma } = await import("@/lib/db");
  try {
    await prisma.registroAuditoria.create({ data: { entidade: d.entidade, entidadeId: d.entidadeId ?? null, acao: d.acao, descricao: d.descricao.slice(0, 500), campos: d.campos, usuarioId: usuario?.id ?? null, usuarioNome: usuario?.nome ?? null } });
  } catch { /* não derruba a operação */ }
}
