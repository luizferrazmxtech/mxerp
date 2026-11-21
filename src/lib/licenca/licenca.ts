import { prisma } from "@/lib/db";

/**
 * Licença do sistema quando ele é de um cliente da revenda: plano, limites e situação da mensalidade vêm da
 * Central MXTECH (CENTRAL_URL + LICENCA_TOKEN no .env, criados pela VPS). Sem essas variáveis o sistema é livre
 * (a própria MXTECH, o PC de testes).
 *
 * A última resposta fica guardada (Configuracao "licenca"): se a Central sair do ar, vale a última situação
 * conhecida. Uma falha da MXTECH nunca bloqueia o cliente.
 */
export type SituacaoLicenca = "EM_DIA" | "AVISO" | "SO_LEITURA" | "BLOQUEADO";
export type Licenca = {
  situacao: SituacaoLicenca; diasAtraso: number; mensagem: string | null; maxEmpresas: number; maxUsuarios: number; plano: string;
  fatura: { competencia: string; vencimento: string; valor: number; linhaDigitavel: string | null; pixCopiaECola: string | null; link: string | null } | null;
  verificadoEm: string;
};

const CACHE_MS = 5 * 60_000;
let cache: { valor: Licenca | null; ate: number } | null = null;

export const licencaAtiva = () => !!(process.env.CENTRAL_URL && process.env.LICENCA_TOKEN);

/** Busca na Central (sem cache). Exportada para os testes, com fetch trocável. */
export async function consultarCentral(f: typeof fetch = fetch): Promise<Licenca> {
  const r = await f(`${process.env.CENTRAL_URL!.replace(/\/+$/, "")}/api/licenca`, {
    headers: { Authorization: `Bearer ${process.env.LICENCA_TOKEN}` }, cache: "no-store", signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`Central respondeu HTTP ${r.status}`);
  return (await r.json()) as Licenca;
}

/** Licença em vigor; null = sistema sem licença (livre). */
export async function licencaAtual(opts: { forcar?: boolean; fetch?: typeof fetch } = {}): Promise<Licenca | null> {
  if (!licencaAtiva()) return null;
  if (!opts.forcar && cache && cache.ate > Date.now()) return cache.valor;
  let valor: Licenca | null;
  try {
    valor = await consultarCentral(opts.fetch);
    await prisma.configuracao.upsert({ where: { chave: "licenca" }, create: { chave: "licenca", valor }, update: { valor } });
  } catch {
    const salvo = await prisma.configuracao.findUnique({ where: { chave: "licenca" } }).catch(() => null);
    valor = (salvo?.valor as Licenca | undefined) ?? null;
  }
  cache = { valor, ate: Date.now() + (valor ? CACHE_MS : 30_000) };
  return valor;
}

export const limparCacheLicenca = () => { cache = null; };

/** Cadastro de mais uma loja/CNPJ dentro do plano? */
export async function conferirLimiteEmpresas() {
  const l = await licencaAtual();
  if (!l) return;
  const n = await prisma.empresa.count();
  if (n >= l.maxEmpresas) throw new Error(`Seu plano (${l.plano}) permite ${l.maxEmpresas} CNPJ(s). Fale com a MXTECH para ampliar.`);
}

/** Mais um usuário com acesso ao sistema dentro do plano? (`exceto` = o próprio usuário sendo editado) */
export async function conferirLimiteUsuarios(exceto?: string) {
  const l = await licencaAtual();
  if (!l) return;
  const n = await prisma.usuario.count({ where: { ativo: true, acessoSistema: true, ...(exceto ? { id: { not: exceto } } : {}) } });
  if (n >= l.maxUsuarios) throw new Error(`Seu plano (${l.plano}) permite ${l.maxUsuarios} usuário(s) com acesso. Fale com a MXTECH para ampliar.`);
}
