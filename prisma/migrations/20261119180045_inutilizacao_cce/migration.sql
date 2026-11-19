-- AlterTable
ALTER TABLE "NotaEvento" ADD COLUMN     "texto" TEXT;

-- CreateTable
CREATE TABLE "InutilizacaoNumeracao" (
    "id" TEXT NOT NULL,
    "modelo" "ModeloNota" NOT NULL,
    "serie" INTEGER NOT NULL,
    "ambiente" "AmbienteFiscal" NOT NULL,
    "numeroInicial" INTEGER NOT NULL,
    "numeroFinal" INTEGER NOT NULL,
    "justificativa" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "protocolo" TEXT,
    "motivo" TEXT,
    "xml" TEXT,
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InutilizacaoNumeracao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InutilizacaoNumeracao_modelo_serie_ambiente_idx" ON "InutilizacaoNumeracao"("modelo", "serie", "ambiente");
