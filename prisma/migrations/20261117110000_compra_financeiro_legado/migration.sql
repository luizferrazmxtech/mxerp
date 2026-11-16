-- AlterTable
ALTER TABLE "Compra" ADD COLUMN     "financeiroNoLegado" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Compra" SET "financeiroNoLegado" = true WHERE "idLegado" IS NOT NULL;
