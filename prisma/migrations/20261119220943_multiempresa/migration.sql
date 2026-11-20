-- AlterTable
ALTER TABLE "AjusteEstoque" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "CaixaPdv" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "Chamado" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "Compra" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "Contrato" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "Cotacao" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "Deposito" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "Devolucao" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "ambienteNfse" "AmbienteFiscal" NOT NULL DEFAULT 'HOMOLOGACAO',
ADD COLUMN     "ativa" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "certificadoPfx" TEXT,
ADD COLUMN     "certificadoSenha" TEXT,
ADD COLUMN     "certificadoTitular" TEXT,
ADD COLUMN     "certificadoValidade" TIMESTAMP(3),
ADD COLUMN     "infCplNfe" TEXT,
ADD COLUMN     "infCplNfse" TEXT,
ADD COLUMN     "regimeEspecialNfse" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "serieDps" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "InutilizacaoNumeracao" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "Inventario" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "Lancamento" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "NotaFiscal" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "NotaRecebida" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "OrdemServico" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "TransferenciaEstoque" ADD COLUMN     "empresaId" TEXT;

-- AlterTable
ALTER TABLE "Venda" ADD COLUMN     "empresaId" TEXT;

-- CreateIndex
CREATE INDEX "AjusteEstoque_empresaId_idx" ON "AjusteEstoque"("empresaId");

-- CreateIndex
CREATE INDEX "CaixaPdv_empresaId_idx" ON "CaixaPdv"("empresaId");

-- CreateIndex
CREATE INDEX "Chamado_empresaId_idx" ON "Chamado"("empresaId");

-- CreateIndex
CREATE INDEX "Compra_empresaId_idx" ON "Compra"("empresaId");

-- CreateIndex
CREATE INDEX "Contrato_empresaId_idx" ON "Contrato"("empresaId");

-- CreateIndex
CREATE INDEX "Cotacao_empresaId_idx" ON "Cotacao"("empresaId");

-- CreateIndex
CREATE INDEX "Deposito_empresaId_idx" ON "Deposito"("empresaId");

-- CreateIndex
CREATE INDEX "Devolucao_empresaId_idx" ON "Devolucao"("empresaId");

-- CreateIndex
CREATE INDEX "InutilizacaoNumeracao_empresaId_idx" ON "InutilizacaoNumeracao"("empresaId");

-- CreateIndex
CREATE INDEX "Inventario_empresaId_idx" ON "Inventario"("empresaId");

-- CreateIndex
CREATE INDEX "Lancamento_empresaId_idx" ON "Lancamento"("empresaId");

-- CreateIndex
CREATE INDEX "NotaFiscal_empresaId_idx" ON "NotaFiscal"("empresaId");

-- CreateIndex
CREATE INDEX "NotaRecebida_empresaId_idx" ON "NotaRecebida"("empresaId");

-- CreateIndex
CREATE INDEX "Orcamento_empresaId_idx" ON "Orcamento"("empresaId");

-- CreateIndex
CREATE INDEX "OrdemServico_empresaId_idx" ON "OrdemServico"("empresaId");

-- CreateIndex
CREATE INDEX "TransferenciaEstoque_empresaId_idx" ON "TransferenciaEstoque"("empresaId");

-- CreateIndex
CREATE INDEX "Venda_empresaId_idx" ON "Venda"("empresaId");
