-- Tipo de atendimento da OS: visita técnica no local ou equipamento para manutenção (as OS existentes ficam como manutenção)
ALTER TABLE "OrdemServico" ADD COLUMN "tipoAtendimento" TEXT NOT NULL DEFAULT 'MANUTENCAO';
ALTER TABLE "OrdemServico" ADD COLUMN "descricaoVisita" TEXT;
CREATE INDEX "OrdemServico_tipoAtendimento_idx" ON "OrdemServico"("tipoAtendimento");
