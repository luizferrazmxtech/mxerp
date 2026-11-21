-- PagSeguro: PIX dinâmico no PDV e conciliação da maquininha pelo EDI (taxa real e data do repasse).
ALTER TABLE "FormaPagamento" ADD COLUMN "pagseguro" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FormaPagamento" ADD COLUMN "contaBancariaId" TEXT;

CREATE TABLE "CobrancaPix" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "qrId" TEXT,
    "texto" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "situacao" TEXT NOT NULL DEFAULT 'PENDENTE',
    "vendaId" TEXT,
    "caixaId" TEXT,
    "usuarioId" TEXT,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "pagaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CobrancaPix_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CobrancaPix_pedidoId_key" ON "CobrancaPix"("pedidoId");
CREATE UNIQUE INDEX "CobrancaPix_vendaId_key" ON "CobrancaPix"("vendaId");

CREATE TABLE "TransacaoPagSeguro" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "parcela" INTEGER NOT NULL DEFAULT 1,
    "totalParcelas" INTEGER NOT NULL DEFAULT 1,
    "dataVenda" TIMESTAMP(3) NOT NULL,
    "meio" TEXT NOT NULL,
    "valorBruto" DECIMAL(14,2) NOT NULL,
    "taxa" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valorLiquido" DECIMAL(14,2) NOT NULL,
    "dataPrevista" DATE,
    "pagaEm" DATE,
    "nsu" TEXT,
    "cartao" TEXT,
    "situacao" TEXT NOT NULL DEFAULT 'SEM_CONTA',
    "lancamentoId" TEXT,
    "taxaLancamentoId" TEXT,
    "dados" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TransacaoPagSeguro_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TransacaoPagSeguro_lancamentoId_key" ON "TransacaoPagSeguro"("lancamentoId");
CREATE UNIQUE INDEX "TransacaoPagSeguro_codigo_parcela_key" ON "TransacaoPagSeguro"("codigo", "parcela");
CREATE INDEX "TransacaoPagSeguro_situacao_idx" ON "TransacaoPagSeguro"("situacao");
CREATE INDEX "TransacaoPagSeguro_dataVenda_idx" ON "TransacaoPagSeguro"("dataVenda");
