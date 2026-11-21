-- AlterTable
ALTER TABLE "Equipe" ADD COLUMN     "googleAgendaId" TEXT;

-- AlterTable
ALTER TABLE "OrdemServico" ADD COLUMN     "agendaDuracaoMin" INTEGER,
ADD COLUMN     "agendaInicio" TIMESTAMP(3),
ADD COLUMN     "googleAgendaId" TEXT,
ADD COLUMN     "googleErro" TEXT,
ADD COLUMN     "googleEventoId" TEXT,
ADD COLUMN     "googlePendente" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "googleSincEm" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "OrdemServico_agendaInicio_idx" ON "OrdemServico"("agendaInicio");

