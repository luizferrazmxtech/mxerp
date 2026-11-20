import { PrismaClient } from "@prisma/client";
import { extensaoAuditoria } from "@/lib/auditoria/registro";
import { extensaoLoja } from "@/lib/empresa/loja";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function criar() {
  const base = new PrismaClient();
  // auditoria automática de cadastros e documentos (src/lib/auditoria/registro.ts); o tipo continua o do PrismaClient
  // e a separação por loja/CNPJ (src/lib/empresa/loja.ts): grava a loja nos registros novos e filtra as listagens
  return base.$extends(extensaoAuditoria(base)).$extends(extensaoLoja(base)) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? criar();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
