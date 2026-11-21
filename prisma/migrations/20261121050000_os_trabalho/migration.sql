-- Tempo de mão de obra da OS (Iniciar / Pausar / Finalizar na tela do técnico)
ALTER TABLE "OrdemServico" ADD COLUMN "trabalhoFinalizadoEm" TIMESTAMP(3);

CREATE TABLE "OsTrabalho" (
    "id" TEXT NOT NULL,
    "osId" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fim" TIMESTAMP(3),
    "motivo" TEXT,
    "iniciadoPor" TEXT NOT NULL,
    "iniciadoPorId" TEXT,
    "encerradoPor" TEXT,
    CONSTRAINT "OsTrabalho_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OsTrabalho_osId_idx" ON "OsTrabalho"("osId");
-- no máximo um trecho aberto por OS
CREATE UNIQUE INDEX "OsTrabalho_aberto_key" ON "OsTrabalho"("osId") WHERE "fim" IS NULL;

ALTER TABLE "OsTrabalho" ADD CONSTRAINT "OsTrabalho_osId_fkey" FOREIGN KEY ("osId") REFERENCES "OrdemServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;
