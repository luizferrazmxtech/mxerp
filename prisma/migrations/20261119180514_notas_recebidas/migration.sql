-- CreateTable
CREATE TABLE "NotaRecebida" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "nsu" TEXT,
    "emitenteDocumento" TEXT NOT NULL,
    "emitenteNome" TEXT NOT NULL,
    "emitenteIe" TEXT,
    "emissao" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "tipoNf" INTEGER NOT NULL DEFAULT 1,
    "situacao" TEXT NOT NULL DEFAULT 'AUTORIZADA',
    "protocolo" TEXT,
    "xml" TEXT,
    "manifestacao" TEXT,
    "manifestadaEm" TIMESTAMP(3),
    "protocoloManifesto" TEXT,
    "justificativa" TEXT,
    "compraId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotaRecebida_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotaRecebida_chave_key" ON "NotaRecebida"("chave");

-- CreateIndex
CREATE INDEX "NotaRecebida_emissao_idx" ON "NotaRecebida"("emissao");
