-- Compra: estoque (depósito) onde as peças entram, escolhido no formulário (padrão nas configurações de estoque)
ALTER TABLE "Compra" ADD COLUMN "depositoId" TEXT;
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "Deposito"("id") ON DELETE SET NULL ON UPDATE CASCADE;
