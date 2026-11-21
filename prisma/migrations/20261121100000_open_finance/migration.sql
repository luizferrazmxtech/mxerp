-- CreateTable
CREATE TABLE "ConexaoOpenFinance" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "logo" TEXT,
    "situacao" TEXT NOT NULL,
    "consentimentoAte" TIMESTAMP(3),
    "ultimaSincEm" TIMESTAMP(3),
    "ultimaSincMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConexaoOpenFinance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaOpenFinance" (
    "id" TEXT NOT NULL,
    "conexaoId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "numero" TEXT,
    "tipo" TEXT NOT NULL,
    "saldo" DECIMAL(14,2),
    "contaBancariaId" TEXT,
    "importarDesde" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContaOpenFinance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConexaoOpenFinance_itemId_key" ON "ConexaoOpenFinance"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ContaOpenFinance_accountId_key" ON "ContaOpenFinance"("accountId");

-- AddForeignKey
ALTER TABLE "ContaOpenFinance" ADD CONSTRAINT "ContaOpenFinance_conexaoId_fkey" FOREIGN KEY ("conexaoId") REFERENCES "ConexaoOpenFinance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaOpenFinance" ADD CONSTRAINT "ContaOpenFinance_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

