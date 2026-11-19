import { PrismaClient } from "@prisma/client";
import { extensaoAuditoria } from "@/lib/auditoria/registro";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function criar() {
  const base = new PrismaClient();
  // auditoria automática de cadastros e documentos (src/lib/auditoria/registro.ts); o tipo continua o do PrismaClient
  return base.$extends(extensaoAuditoria(base)) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? criar();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
