-- CreateTable
CREATE TABLE "LancamentoRateio" (
    "id" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "fracao" DECIMAL(9,8) NOT NULL,

    CONSTRAINT "LancamentoRateio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LancamentoRateio_lancamentoId_idx" ON "LancamentoRateio"("lancamentoId");

-- AddForeignKey
ALTER TABLE "LancamentoRateio" ADD CONSTRAINT "LancamentoRateio_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "Lancamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoRateio" ADD CONSTRAINT "LancamentoRateio_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaFinanceira"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

