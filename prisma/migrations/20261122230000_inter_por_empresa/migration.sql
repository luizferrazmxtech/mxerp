-- Banco Inter por empresa: cada CNPJ com a sua conta, extrato, conciliação e boletos
ALTER TABLE "IntegracaoInter" ADD COLUMN "empresaId" TEXT;
CREATE UNIQUE INDEX "IntegracaoInter_empresaId_key" ON "IntegracaoInter"("empresaId");
-- a configuração que já existe é da primeira empresa cadastrada
UPDATE "IntegracaoInter" SET "empresaId" = (SELECT id FROM "Empresa" ORDER BY "createdAt" LIMIT 1) WHERE id = 'inter';
ALTER TABLE "Boleto" ADD COLUMN "interId" TEXT;
CREATE INDEX "Boleto_interId_idx" ON "Boleto"("interId");
