-- Contador: pacote mensal de XMLs enviado por e-mail (histórico e link de download).
CREATE TABLE "EnvioContador" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "situacao" TEXT NOT NULL,
    "destinatarios" TEXT NOT NULL,
    "arquivos" INTEGER NOT NULL DEFAULT 0,
    "tamanho" INTEGER NOT NULL DEFAULT 0,
    "token" TEXT NOT NULL,
    "erro" TEXT,
    "automatico" BOOLEAN NOT NULL DEFAULT false,
    "usuarioNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnvioContador_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EnvioContador_token_key" ON "EnvioContador"("token");
CREATE INDEX "EnvioContador_empresaId_competencia_idx" ON "EnvioContador"("empresaId", "competencia");
