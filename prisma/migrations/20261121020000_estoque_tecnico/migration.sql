-- Estoque do técnico (carro) e itens da OS que saem do estoque do técnico
ALTER TABLE "Deposito" ADD COLUMN "tecnicoId" TEXT;
CREATE UNIQUE INDEX "Deposito_tecnicoId_key" ON "Deposito"("tecnicoId");
ALTER TABLE "Deposito" ADD CONSTRAINT "Deposito_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OsItemProduto" ADD COLUMN "localOrigemId" TEXT;
ALTER TABLE "OsItemProduto" ADD CONSTRAINT "OsItemProduto_localOrigemId_fkey" FOREIGN KEY ("localOrigemId") REFERENCES "Local"("id") ON DELETE SET NULL ON UPDATE CASCADE;
