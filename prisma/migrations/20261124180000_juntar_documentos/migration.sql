-- Juntar vendas/OS do mesmo cliente (a original cancelada aponta para a nova) e agrupar contas a receber
-- num único título (LancamentoAgrupado guarda cada conta original e o documento que a gerou).

-- AlterEnum
ALTER TYPE "OrigemDocumento" ADD VALUE 'AGRUPAMENTO';

-- AlterTable
ALTER TABLE "OrdemServico" ADD COLUMN     "juntadaEmId" TEXT;

-- AlterTable
ALTER TABLE "Venda" ADD COLUMN     "juntadaEmId" TEXT;

-- CreateTable
CREATE TABLE "LancamentoAgrupado" (
    "id" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "origemTipo" "OrigemDocumento",
    "origemId" TEXT,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "vencimento" DATE NOT NULL,
    "competencia" DATE NOT NULL,
    "parcela" INTEGER NOT NULL DEFAULT 1,
    "totalParcelas" INTEGER NOT NULL DEFAULT 1,
    "categoriaId" TEXT NOT NULL,
    "centroCustoId" TEXT,
    "formaPagamentoId" TEXT,
    "observacao" TEXT,
    "idLegado" TEXT,
    "rateio" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LancamentoAgrupado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LancamentoAgrupado_lancamentoId_idx" ON "LancamentoAgrupado"("lancamentoId");

-- CreateIndex
CREATE INDEX "LancamentoAgrupado_origemTipo_origemId_idx" ON "LancamentoAgrupado"("origemTipo", "origemId");

-- AddForeignKey
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_juntadaEmId_fkey" FOREIGN KEY ("juntadaEmId") REFERENCES "OrdemServico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venda" ADD CONSTRAINT "Venda_juntadaEmId_fkey" FOREIGN KEY ("juntadaEmId") REFERENCES "Venda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoAgrupado" ADD CONSTRAINT "LancamentoAgrupado_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "Lancamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

