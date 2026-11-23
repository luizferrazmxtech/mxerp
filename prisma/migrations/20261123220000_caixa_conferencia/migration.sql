-- Controle de caixa do PDV: número, conferência por forma de pagamento, quem fechou e lançamento da diferença
ALTER TABLE "CaixaPdv" ADD COLUMN "numero" INTEGER;
ALTER TABLE "CaixaPdv" ADD COLUMN "valorEsperado" DECIMAL(14,2);
ALTER TABLE "CaixaPdv" ADD COLUMN "conferencia" JSONB;
ALTER TABLE "CaixaPdv" ADD COLUMN "fechadoPorId" TEXT;
ALTER TABLE "CaixaPdv" ADD COLUMN "lancamentoDiferencaId" TEXT;

ALTER TABLE "CaixaPdv" ADD CONSTRAINT "CaixaPdv_fechadoPorId_fkey" FOREIGN KEY ("fechadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CaixaPdv_abertoEm_idx" ON "CaixaPdv"("abertoEm");

-- numera os caixas que já existem, na ordem de abertura, e acerta o contador
UPDATE "CaixaPdv" c SET "numero" = n.rn
FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY "abertoEm", id) AS rn FROM "CaixaPdv") n
WHERE c.id = n.id;
INSERT INTO "Sequencia" (chave, valor) SELECT 'CAIXA', COALESCE(MAX("numero"), 0) FROM "CaixaPdv"
ON CONFLICT (chave) DO UPDATE SET valor = GREATEST("Sequencia".valor, EXCLUDED.valor);
