-- Tela do técnico: equipes, item instalado e fotos de instalação
CREATE TABLE "Equipe" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "membros" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Equipe_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Equipe_nome_key" ON "Equipe"("nome");

ALTER TABLE "OrdemServico" ADD COLUMN "equipeId" TEXT;
CREATE INDEX "OrdemServico_equipeId_idx" ON "OrdemServico"("equipeId");
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OsItemProduto" ADD COLUMN "criadoPorId" TEXT,
  ADD COLUMN "instalado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "instaladoEm" TIMESTAMP(3),
  ADD COLUMN "instaladoPorId" TEXT;
ALTER TABLE "OsItemServico" ADD COLUMN "criadoPorId" TEXT,
  ADD COLUMN "instalado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "instaladoEm" TIMESTAMP(3),
  ADD COLUMN "instaladoPorId" TEXT;

ALTER TABLE "Anexo" ADD COLUMN "referencia" TEXT;
