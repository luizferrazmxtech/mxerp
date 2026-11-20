-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "logo" BYTEA,
ADD COLUMN     "logoTipo" TEXT;

-- AlterTable
ALTER TABLE "NotaFiscal" ADD COLUMN     "consultadaEm" TIMESTAMP(3);
