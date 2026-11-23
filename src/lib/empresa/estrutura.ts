import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Espelho da estrutura: a empresa nova nasce com uma cópia do que a principal usa (plano de contas, centros de
 * custo, formas de pagamento, modelos de mensagem, situações, canais, campos extras e as configurações de OS,
 * vendas, orçamentos, estoque e contratos). Depois cada uma muda a sua sem mexer na outra.
 * Não copia: contas bancárias, regras e favorecidos da conciliação, integrações (Inter, WhatsApp, e-mail…),
 * porque são de cada CNPJ.
 */
type Remap = Record<string, string | null>; // coluna → tabela de mapeamento (temp) ou null (zera)

const TABELAS: { tabela: string; remap?: Remap }[] = [
  { tabela: "ModeloMensagem" },
  { tabela: "CategoriaFinanceira", remap: { paiId: "CategoriaFinanceira" } },
  { tabela: "CentroCusto" },
  { tabela: "FormaPagamento", remap: { contaBancariaId: null } },
  { tabela: "SituacaoOsConfig", remap: { modeloMensagemId: "ModeloMensagem" } },
  { tabela: "SituacaoVendaConfig", remap: { modeloMensagemId: "ModeloMensagem" } },
  { tabela: "SituacaoOrcamento", remap: { modeloMensagemId: "ModeloMensagem" } },
  { tabela: "SituacaoCompraConfig" },
  { tabela: "CanalVenda" },
  { tabela: "CampoExtra" },
];
/** Configurações copiadas (as das integrações ficam de fora). */
const CONFIGS = ["os", "venda", "orcamento", "estoque", "contratos"];
const SUFIXO = "#emp:";

const q = (s: string) => `"${s.replace(/"/g, "")}"`;

export async function espelharEstrutura(destino: string) {
  if (!destino) throw new Error("Empresa de destino não informada");
  const copiados: Record<string, number> = {};
  await prisma.$transaction(async (tx) => {
    const mapa = (t: string) => `mapa_${t.toLowerCase()}`;
    for (const { tabela, remap = {} } of TABELAS) {
      // já tem estrutura própria: não mexe
      const ja = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM ${q(tabela)} WHERE "empresaId" = $1`, destino);
      await tx.$executeRawUnsafe(`CREATE TEMP TABLE IF NOT EXISTS ${mapa(tabela)} (velho text PRIMARY KEY, novo text) ON COMMIT DROP`);
      if (Number(ja[0].n) > 0) continue;
      await tx.$executeRawUnsafe(
        `INSERT INTO ${mapa(tabela)} (velho, novo) SELECT id, 'e' || substr(md5(random()::text || id || clock_timestamp()::text), 1, 24) FROM ${q(tabela)} WHERE "empresaId" = ''`,
      );
      const cols = (await tx.$queryRawUnsafe<{ c: string }[]>(
        `SELECT column_name AS c FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, tabela,
      )).map((r) => r.c);
      const sel = cols.map((c) => {
        if (c === "id") return "m.novo";
        if (c === "empresaId") return "$1";
        if (c in remap) return remap[c] ? `(SELECT novo FROM ${mapa(remap[c]!)} WHERE velho = t.${q(c)})` : "NULL";
        return `t.${q(c)}`;
      });
      copiados[tabela] = await tx.$executeRawUnsafe(
        `INSERT INTO ${q(tabela)} (${cols.map(q).join(", ")}) SELECT ${sel.join(", ")} FROM ${q(tabela)} t JOIN ${mapa(tabela)} m ON m.velho = t.id`, destino,
      );
    }
    // configurações (a situação da venda dos contratos aponta para a cópia)
    for (const chave of CONFIGS) {
      const nova = `${chave}${SUFIXO}${destino}`;
      const [orig] = await tx.$queryRawUnsafe<{ valor: Prisma.JsonValue }[]>(`SELECT valor FROM "Configuracao" WHERE chave = $1`, chave);
      if (!orig) continue;
      let valor = orig.valor;
      if (chave === "contratos" && valor && typeof valor === "object" && !Array.isArray(valor)) {
        const v = valor as Record<string, unknown>;
        if (typeof v.situacaoVendaId === "string" && v.situacaoVendaId) {
          const [m] = await tx.$queryRawUnsafe<{ novo: string }[]>(`SELECT novo FROM mapa_situacaovendaconfig WHERE velho = $1`, v.situacaoVendaId);
          valor = { ...v, situacaoVendaId: m?.novo ?? "" };
        }
      }
      copiados[`config:${chave}`] = await tx.$executeRawUnsafe(
        `INSERT INTO "Configuracao" (chave, valor) VALUES ($1, $2::jsonb) ON CONFLICT (chave) DO NOTHING`, nova, JSON.stringify(valor),
      );
    }
  }, { timeout: 60000 });
  return copiados;
}
