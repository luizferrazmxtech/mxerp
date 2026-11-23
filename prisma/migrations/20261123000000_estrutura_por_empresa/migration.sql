-- Cada empresa (CNPJ) com a sua estrutura: plano de contas, centros de custo, formas de pagamento, contas bancárias,
-- regras da conciliação, modelos de mensagem, situações, canais e campos extras. "" = a empresa principal (a primeira
-- cadastrada), então o que já existe continua dela. Clientes, produtos e serviços são do grupo: "lojas" diz em quais
-- empresas o cadastro aparece (vazio = em todas).
-- DropIndex
DROP INDEX "CanalVenda_nome_key";

-- DropIndex
DROP INDEX "CategoriaFinanceira_nome_tipo_key";

-- DropIndex
DROP INDEX "CentroCusto_nome_key";

-- DropIndex
DROP INDEX "ContaBancaria_nome_key";

-- DropIndex
DROP INDEX "FormaPagamento_nome_key";

-- DropIndex
DROP INDEX "RegraConciliacao_texto_modo_tipo_key";

-- DropIndex
DROP INDEX "SituacaoOrcamento_nome_key";

-- DropIndex
DROP INDEX "SituacaoOsConfig_nome_key";

-- DropIndex
DROP INDEX "SituacaoVendaConfig_nome_key";

-- AlterTable
ALTER TABLE "CampoExtra" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "CanalVenda" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "CategoriaFinanceira" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "CentroCusto" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ContaBancaria" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "FormaPagamento" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ModeloMensagem" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Pessoa" ADD COLUMN     "lojas" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Produto" ALTER COLUMN "lojas" SET DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "RegraConciliacao" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Servico" ALTER COLUMN "lojas" SET DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "SituacaoCompraConfig" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "SituacaoOrcamento" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "SituacaoOsConfig" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "SituacaoVendaConfig" ADD COLUMN     "empresaId" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "CampoExtra_empresaId_idx" ON "CampoExtra"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "CanalVenda_empresaId_nome_key" ON "CanalVenda"("empresaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaFinanceira_empresaId_nome_tipo_key" ON "CategoriaFinanceira"("empresaId", "nome", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "CentroCusto_empresaId_nome_key" ON "CentroCusto"("empresaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "ContaBancaria_empresaId_nome_key" ON "ContaBancaria"("empresaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "FormaPagamento_empresaId_nome_key" ON "FormaPagamento"("empresaId", "nome");

-- CreateIndex
CREATE INDEX "ModeloMensagem_empresaId_idx" ON "ModeloMensagem"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "RegraConciliacao_empresaId_texto_modo_tipo_key" ON "RegraConciliacao"("empresaId", "texto", "modo", "tipo");

-- CreateIndex
CREATE INDEX "SituacaoCompraConfig_empresaId_idx" ON "SituacaoCompraConfig"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "SituacaoOrcamento_empresaId_nome_key" ON "SituacaoOrcamento"("empresaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "SituacaoOsConfig_empresaId_nome_key" ON "SituacaoOsConfig"("empresaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "SituacaoVendaConfig_empresaId_nome_key" ON "SituacaoVendaConfig"("empresaId", "nome");

-- clientes que já existem: do grupo todo (lista vazia = todas as empresas)
UPDATE "Pessoa" SET "lojas" = '{}' WHERE "lojas" IS NULL;
UPDATE "Produto" SET "lojas" = '{}' WHERE "lojas" IS NULL;
UPDATE "Servico" SET "lojas" = '{}' WHERE "lojas" IS NULL;
