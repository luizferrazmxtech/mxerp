-- Marketplaces: conta conectada (Mercado Livre), pedidos importados e vínculo anúncio → produto.
-- CreateTable
CREATE TABLE "IntegracaoMarketplace" (
    "id" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "clientId" TEXT NOT NULL,
    "clientSecretCifrado" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "accessTokenCifrado" TEXT,
    "refreshTokenCifrado" TEXT,
    "tokenExpiraEm" TIMESTAMP(3),
    "estadoOauth" TEXT,
    "contaId" TEXT,
    "contaNome" TEXT,
    "empresaId" TEXT,
    "contaBancariaId" TEXT,
    "situacaoVendaId" TEXT,
    "formaPagamentoId" TEXT,
    "canalVenda" TEXT NOT NULL DEFAULT 'Mercado Livre',
    "importarDesde" TIMESTAMP(3),
    "cancelarAuto" BOOLEAN NOT NULL DEFAULT true,
    "sincronizarAuto" BOOLEAN NOT NULL DEFAULT true,
    "webhookToken" TEXT,
    "ultimaSincEm" TIMESTAMP(3),
    "ultimaSincMsg" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegracaoMarketplace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoMarketplace" (
    "id" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "externoId" TEXT NOT NULL,
    "pacoteId" TEXT,
    "situacaoExterna" TEXT NOT NULL,
    "etapa" TEXT NOT NULL,
    "dataPedido" TIMESTAMP(3) NOT NULL,
    "compradorNome" TEXT,
    "compradorApelido" TEXT,
    "compradorDocumento" TEXT,
    "total" DECIMAL(14,2) NOT NULL,
    "bruto" DECIMAL(14,2),
    "liquido" DECIMAL(14,2),
    "tarifa" DECIMAL(14,2),
    "pagamentos" JSONB NOT NULL DEFAULT '[]',
    "liberacaoPrevista" TIMESTAMP(3),
    "liberadoEm" TIMESTAMP(3),
    "vendaId" TEXT,
    "lancamentoTarifaId" TEXT,
    "erro" TEXT,
    "dados" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PedidoMarketplace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnuncioMarketplace" (
    "id" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "anuncioId" TEXT NOT NULL,
    "variacaoId" TEXT NOT NULL DEFAULT '',
    "titulo" TEXT NOT NULL,
    "sku" TEXT,
    "produtoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnuncioMarketplace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PedidoMarketplace_vendaId_key" ON "PedidoMarketplace"("vendaId");

-- CreateIndex
CREATE INDEX "PedidoMarketplace_etapa_idx" ON "PedidoMarketplace"("etapa");

-- CreateIndex
CREATE INDEX "PedidoMarketplace_dataPedido_idx" ON "PedidoMarketplace"("dataPedido");

-- CreateIndex
CREATE UNIQUE INDEX "PedidoMarketplace_canal_externoId_key" ON "PedidoMarketplace"("canal", "externoId");

-- CreateIndex
CREATE UNIQUE INDEX "AnuncioMarketplace_canal_anuncioId_variacaoId_key" ON "AnuncioMarketplace"("canal", "anuncioId", "variacaoId");

-- AddForeignKey
ALTER TABLE "AnuncioMarketplace" ADD CONSTRAINT "AnuncioMarketplace_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

