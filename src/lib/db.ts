import { Prisma, PrismaClient } from "@prisma/client";
import { extensaoAuditoria } from "@/lib/auditoria/registro";
import { extensaoLoja } from "@/lib/empresa/loja";

const GRAVACOES = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"]);
// login (sessão) e a licença guardada continuam gravando no modo só leitura
const LIVRES_SO_LEITURA = new Set(["Sessao", "SessaoCliente", "Configuracao"]);

/** Mensalidade da revenda muito atrasada (licença "só leitura" vinda da Central): nada grava. */
const extensaoLicenca = Prisma.defineExtension({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (process.env.LICENCA_TOKEN && GRAVACOES.has(operation) && !LIVRES_SO_LEITURA.has(model)) {
          const { licencaAtual } = await import("@/lib/licenca/licenca");
          const l = await licencaAtual();
          if (l?.situacao === "SO_LEITURA" || l?.situacao === "BLOQUEADO") throw new Error(`Sistema em modo só consulta: ${l.mensagem ?? "mensalidade em atraso"}. Fale com a MXTECH.`);
        }
        return query(args);
      },
    },
  },
});

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function criar() {
  const base = new PrismaClient();
  // auditoria automática de cadastros e documentos (src/lib/auditoria/registro.ts); o tipo continua o do PrismaClient
  // e a separação por loja/CNPJ (src/lib/empresa/loja.ts): grava a loja nos registros novos e filtra as listagens
  return base.$extends(extensaoAuditoria(base)).$extends(extensaoLoja(base)).$extends(extensaoLicenca) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? criar();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
