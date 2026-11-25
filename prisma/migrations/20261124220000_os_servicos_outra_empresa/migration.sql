-- OS com os serviços faturados por outra empresa do grupo (ex.: peças pela MXTECH, serviços pela VFX):
-- a NFS-e e a conta a receber dos serviços saem pela empresa escolhida.
ALTER TABLE "OrdemServico" ADD COLUMN "empresaServicosId" TEXT;
CREATE INDEX "OrdemServico_empresaServicosId_idx" ON "OrdemServico"("empresaServicosId");
