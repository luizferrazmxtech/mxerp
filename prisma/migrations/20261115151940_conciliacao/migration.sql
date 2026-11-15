-- CreateEnum
CREATE TYPE "SituacaoConciliacao" AS ENUM ('PENDENTE', 'CONCILIADA', 'IGNORADA');

-- AlterTable
ALTER TABLE "Lancamento" ADD COLUMN     "transacaoId" TEXT;

-- CreateTable
CREATE TABLE "TransacaoBancaria" (
    "id" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "descricao" TEXT NOT NULL,
    "documento" TEXT,
    "chave" TEXT NOT NULL,
    "situacao" "SituacaoConciliacao" NOT NULL DEFAULT 'PENDENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransacaoBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransacaoBancaria_situacao_idx" ON "TransacaoBancaria"("situacao");

-- CreateIndex
CREATE UNIQUE INDEX "TransacaoBancaria_contaBancariaId_chave_key" ON "TransacaoBancaria"("contaBancariaId", "chave");

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_transacaoId_fkey" FOREIGN KEY ("transacaoId") REFERENCES "TransacaoBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransacaoBancaria" ADD CONSTRAINT "TransacaoBancaria_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
