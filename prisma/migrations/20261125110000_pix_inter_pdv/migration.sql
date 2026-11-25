-- Pix do Banco Inter no PDV
ALTER TABLE "IntegracaoInter" ADD COLUMN "pixPdv" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "IntegracaoInter" ADD COLUMN "chavePix" TEXT;
ALTER TABLE "CobrancaPix" ADD COLUMN "provedor" TEXT NOT NULL DEFAULT 'PAGSEGURO';
ALTER TABLE "CobrancaPix" ADD COLUMN "interId" TEXT;
ALTER TABLE "CobrancaPix" ADD COLUMN "e2eId" TEXT;
CREATE INDEX "CobrancaPix_e2eId_idx" ON "CobrancaPix"("e2eId");
