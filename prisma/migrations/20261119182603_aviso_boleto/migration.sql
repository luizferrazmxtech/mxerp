-- CreateTable
CREATE TABLE "AvisoBoleto" (
    "id" TEXT NOT NULL,
    "codigoSolicitacao" TEXT NOT NULL,
    "boletoId" TEXT,
    "motivo" TEXT NOT NULL,
    "seuNumero" TEXT,
    "nossoNumero" TEXT,
    "pagadorNome" TEXT,
    "pagadorDocumento" TEXT,
    "valor" DECIMAL(14,2),
    "valorRecebido" DECIMAL(14,2),
    "pagoEm" DATE,
    "origemRecebimento" TEXT,
    "lancamentoId" TEXT,
    "resolvidoEm" TIMESTAMP(3),
    "resolvidoPor" TEXT,
    "resolucao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvisoBoleto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AvisoBoleto_codigoSolicitacao_key" ON "AvisoBoleto"("codigoSolicitacao");

-- CreateIndex
CREATE INDEX "AvisoBoleto_resolvidoEm_idx" ON "AvisoBoleto"("resolvidoEm");

-- AddForeignKey
ALTER TABLE "AvisoBoleto" ADD CONSTRAINT "AvisoBoleto_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "Lancamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
