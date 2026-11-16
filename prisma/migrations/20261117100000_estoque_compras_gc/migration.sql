-- AlterTable
ALTER TABLE "Compra" ADD COLUMN     "camposExtras" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "centroCusto" TEXT,
ADD COLUMN     "condicao" TEXT NOT NULL DEFAULT 'AVISTA',
ADD COLUMN     "cotacaoId" TEXT,
ADD COLUMN     "criadoPorId" TEXT,
ADD COLUMN     "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "descontoPercentual" DECIMAL(7,4),
ADD COLUMN     "formaPagamentoId" TEXT,
ADD COLUMN     "frete" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "freteNoTotal" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "idLegado" TEXT,
ADD COLUMN     "impostos" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "impostosNoTotal" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "intervaloDias" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "numeroNfe" TEXT,
ADD COLUMN     "observacaoInterna" TEXT,
ADD COLUMN     "observacoes" TEXT,
ADD COLUMN     "situacaoId" TEXT,
ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'PRODUTO',
ADD COLUMN     "token" TEXT,
ADD COLUMN     "totalProdutos" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalServicos" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "transportadoraId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "data" SET DATA TYPE DATE;

-- AlterTable
ALTER TABLE "CompraItem" ADD COLUMN     "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "detalhes" TEXT,
ADD COLUMN     "ordem" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CompraItemServico" (
    "id" TEXT NOT NULL,
    "compraId" TEXT NOT NULL,
    "servicoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "detalhes" TEXT,
    "quantidade" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "valorUnit" DECIMAL(14,2) NOT NULL,
    "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "CompraItemServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompraParcela" (
    "id" TEXT NOT NULL,
    "compraId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "vencimento" DATE NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "formaPagamentoId" TEXT,
    "observacao" TEXT,

    CONSTRAINT "CompraParcela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompraHistorico" (
    "id" TEXT NOT NULL,
    "compraId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "situacao" TEXT,
    "usuarioNome" TEXT,
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompraHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SituacaoCompraConfig" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT NOT NULL DEFAULT 'cinza',
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "exibir" BOOLEAN NOT NULL DEFAULT true,
    "lancamento" TEXT NOT NULL DEFAULT 'NAO',
    "permiteEdicao" BOOLEAN NOT NULL DEFAULT true,
    "bloqueados" TEXT[],
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SituacaoCompraConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AjusteEstoque" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "tipo" "TipoMovimento" NOT NULL,
    "frete" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "inventarioId" TEXT,
    "idLegado" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AjusteEstoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AjusteEstoqueItem" (
    "id" TEXT NOT NULL,
    "ajusteId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "localId" TEXT,
    "quantidade" DECIMAL(14,4) NOT NULL,
    "custoUnit" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AjusteEstoqueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferenciaEstoque" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "origemDepositoId" TEXT NOT NULL,
    "destinoDepositoId" TEXT NOT NULL,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferenciaEstoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferenciaEstoqueItem" (
    "id" TEXT NOT NULL,
    "transferenciaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" DECIMAL(14,4) NOT NULL,
    "custoUnit" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TransferenciaEstoqueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventario" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "responsavelId" TEXT,
    "responsavelNome" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "motivo" TEXT,
    "escopo" TEXT NOT NULL DEFAULT 'TODOS',
    "filtroIds" TEXT[],
    "contagemCega" BOOLEAN NOT NULL DEFAULT false,
    "somarLeituras" BOOLEAN NOT NULL DEFAULT true,
    "considerarMovimento" BOOLEAN NOT NULL DEFAULT true,
    "situacao" TEXT NOT NULL DEFAULT 'CONTANDO',
    "concluidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventarioItem" (
    "id" TEXT NOT NULL,
    "inventarioId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "saldoInicial" DECIMAL(14,4) NOT NULL,
    "contado" DECIMAL(14,4),
    "custoUnit" DECIMAL(14,4) NOT NULL DEFAULT 0,

    CONSTRAINT "InventarioItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cotacao" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "prazo" DATE,
    "observacoes" TEXT,
    "observacaoInterna" TEXT,
    "situacao" TEXT NOT NULL DEFAULT 'ABERTA',
    "compraId" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cotacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotacaoFornecedor" (
    "id" TEXT NOT NULL,
    "cotacaoId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "celular" TEXT,
    "token" TEXT NOT NULL,
    "respondidoEm" TIMESTAMP(3),
    "frete" DECIMAL(14,2),
    "prazoEntrega" TEXT,
    "condicao" TEXT,
    "observacao" TEXT,

    CONSTRAINT "CotacaoFornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotacaoItem" (
    "id" TEXT NOT NULL,
    "cotacaoId" TEXT NOT NULL,
    "produtoId" TEXT,
    "servicoId" TEXT,
    "nome" TEXT NOT NULL,
    "detalhes" TEXT,
    "quantidade" DECIMAL(14,4) NOT NULL,
    "unidade" TEXT NOT NULL DEFAULT 'UN',
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CotacaoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotacaoResposta" (
    "id" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "valorUnit" DECIMAL(14,4),
    "observacao" TEXT,

    CONSTRAINT "CotacaoResposta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompraParcela_compraId_idx" ON "CompraParcela"("compraId");

-- CreateIndex
CREATE UNIQUE INDEX "AjusteEstoque_numero_key" ON "AjusteEstoque"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "AjusteEstoque_idLegado_key" ON "AjusteEstoque"("idLegado");

-- CreateIndex
CREATE UNIQUE INDEX "TransferenciaEstoque_numero_key" ON "TransferenciaEstoque"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Inventario_numero_key" ON "Inventario"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "InventarioItem_inventarioId_produtoId_key" ON "InventarioItem"("inventarioId", "produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "Cotacao_numero_key" ON "Cotacao"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "CotacaoFornecedor_token_key" ON "CotacaoFornecedor"("token");

-- CreateIndex
CREATE UNIQUE INDEX "CotacaoResposta_fornecedorId_itemId_key" ON "CotacaoResposta"("fornecedorId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Compra_token_key" ON "Compra"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Compra_idLegado_key" ON "Compra"("idLegado");

-- CreateIndex
CREATE INDEX "Compra_data_idx" ON "Compra"("data");

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_situacaoId_fkey" FOREIGN KEY ("situacaoId") REFERENCES "SituacaoCompraConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_transportadoraId_fkey" FOREIGN KEY ("transportadoraId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_formaPagamentoId_fkey" FOREIGN KEY ("formaPagamentoId") REFERENCES "FormaPagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraItemServico" ADD CONSTRAINT "CompraItemServico_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraItemServico" ADD CONSTRAINT "CompraItemServico_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "Servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraParcela" ADD CONSTRAINT "CompraParcela_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraParcela" ADD CONSTRAINT "CompraParcela_formaPagamentoId_fkey" FOREIGN KEY ("formaPagamentoId") REFERENCES "FormaPagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraHistorico" ADD CONSTRAINT "CompraHistorico_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteEstoqueItem" ADD CONSTRAINT "AjusteEstoqueItem_ajusteId_fkey" FOREIGN KEY ("ajusteId") REFERENCES "AjusteEstoque"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AjusteEstoqueItem" ADD CONSTRAINT "AjusteEstoqueItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaEstoqueItem" ADD CONSTRAINT "TransferenciaEstoqueItem_transferenciaId_fkey" FOREIGN KEY ("transferenciaId") REFERENCES "TransferenciaEstoque"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaEstoqueItem" ADD CONSTRAINT "TransferenciaEstoqueItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioItem" ADD CONSTRAINT "InventarioItem_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "Inventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioItem" ADD CONSTRAINT "InventarioItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoFornecedor" ADD CONSTRAINT "CotacaoFornecedor_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "Cotacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoFornecedor" ADD CONSTRAINT "CotacaoFornecedor_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoItem" ADD CONSTRAINT "CotacaoItem_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "Cotacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoResposta" ADD CONSTRAINT "CotacaoResposta_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "CotacaoFornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoResposta" ADD CONSTRAINT "CotacaoResposta_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CotacaoItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Dados: situações de compra do Gestão Click e as compras que já existiam
INSERT INTO "SituacaoCompraConfig" (id, nome, cor, padrao, exibir, lancamento, "permiteEdicao", bloqueados, ordem) VALUES
  ('sc_aberto', 'Em aberto', 'cinza', false, true, 'NAO', true, '{}', 1),
  ('sc_andamento', 'Em andamento', 'amarelo', false, true, 'NAO', true, '{}', 2),
  ('sc_confirmada', 'Confirmada', 'verde', true, true, 'AMBOS', true, '{}', 3),
  ('sc_cancelada', 'Cancelada', 'vermelho', false, false, 'NAO', true, '{}', 4)
ON CONFLICT (id) DO NOTHING;

UPDATE "Compra" SET token = md5(id || random()::text) WHERE token IS NULL;
ALTER TABLE "Compra" ALTER COLUMN "token" SET NOT NULL;
UPDATE "Compra" SET "situacaoId" = CASE WHEN recebida THEN 'sc_confirmada' ELSE 'sc_aberto' END WHERE "situacaoId" IS NULL;
UPDATE "Compra" SET "totalProdutos" = total WHERE "totalProdutos" = 0;
UPDATE "CompraItem" SET subtotal = round(quantidade * "custoUnit", 2) WHERE subtotal = 0;

INSERT INTO "ModeloMensagem" (id, tipo, assunto, email, padrao) VALUES
('mm_compra', 'COMPRA', 'Pedido de compra [numero]', 'Olá [nome_fornecedor],

Segue o pedido de compra nº [numero], no valor de [valor_total].

Acompanhe pelo link: [link]

Atenciosamente,
[nome_empresa]', true),
('mm_cotacao', 'COTACAO', 'Cotação de preços [numero]', 'Olá [nome_fornecedor],

Pedimos a gentileza de informar os preços dos itens da cotação nº [numero] pelo link abaixo:

[link]

Atenciosamente,
[nome_empresa]', true)
ON CONFLICT DO NOTHING;
