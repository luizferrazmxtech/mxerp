-- contrato trazido do sistema anterior (serviços recorrentes do Gestão Click)
ALTER TABLE "Contrato" ADD COLUMN "idLegado" TEXT;
CREATE UNIQUE INDEX "Contrato_idLegado_key" ON "Contrato"("idLegado");
