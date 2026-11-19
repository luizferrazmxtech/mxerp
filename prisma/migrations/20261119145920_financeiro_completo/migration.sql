-- AlterTable
ALTER TABLE "CategoriaFinanceira" ADD COLUMN     "ativa" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "codigo" TEXT;

-- AlterTable
ALTER TABLE "Lancamento" ADD COLUMN     "centroCustoId" TEXT,
ADD COLUMN     "observacao" TEXT,
ADD COLUMN     "transferenciaId" TEXT;

-- CreateTable
CREATE TABLE "CentroCusto" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CentroCusto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CentroCusto_nome_key" ON "CentroCusto"("nome");

-- CreateIndex
CREATE INDEX "Lancamento_transferenciaId_idx" ON "Lancamento"("transferenciaId");

-- CreateIndex
CREATE INDEX "Lancamento_pagoEm_idx" ON "Lancamento"("pagoEm");

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
