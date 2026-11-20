-- AlterTable
ALTER TABLE "NotaFiscal" ADD COLUMN     "cnae" TEXT;

-- CreateTable
CREATE TABLE "AliquotaSimples" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "cnae" TEXT NOT NULL,
    "descricao" TEXT,
    "aliquota" DECIMAL(7,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AliquotaSimples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AliquotaSimples_empresaId_competencia_cnae_key" ON "AliquotaSimples"("empresaId", "competencia", "cnae");
