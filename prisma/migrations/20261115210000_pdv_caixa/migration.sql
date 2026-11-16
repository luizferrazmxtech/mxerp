-- AlterTable
ALTER TABLE "Venda" ADD COLUMN     "caixaId" TEXT;

-- CreateTable
CREATE TABLE "CaixaPdv" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "abertoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valorAbertura" DECIMAL(14,2) NOT NULL,
    "fechadoEm" TIMESTAMP(3),
    "valorFechamento" DECIMAL(14,2),
    "observacao" TEXT,

    CONSTRAINT "CaixaPdv_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaixaPdv_usuarioId_fechadoEm_idx" ON "CaixaPdv"("usuarioId", "fechadoEm");

-- AddForeignKey
ALTER TABLE "CaixaPdv" ADD CONSTRAINT "CaixaPdv_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venda" ADD CONSTRAINT "Venda_caixaId_fkey" FOREIGN KEY ("caixaId") REFERENCES "CaixaPdv"("id") ON DELETE SET NULL ON UPDATE CASCADE;

