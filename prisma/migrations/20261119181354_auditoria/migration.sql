-- CreateTable
CREATE TABLE "RegistroAuditoria" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT,
    "usuarioNome" TEXT,
    "ip" TEXT,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT,
    "acao" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "campos" JSONB,

    CONSTRAINT "RegistroAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistroAuditoria_entidade_entidadeId_idx" ON "RegistroAuditoria"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "RegistroAuditoria_createdAt_idx" ON "RegistroAuditoria"("createdAt");

-- CreateIndex
CREATE INDEX "RegistroAuditoria_usuarioId_createdAt_idx" ON "RegistroAuditoria"("usuarioId", "createdAt");
