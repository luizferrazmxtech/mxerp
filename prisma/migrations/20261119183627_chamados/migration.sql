-- CreateEnum
CREATE TYPE "StatusChamado" AS ENUM ('ABERTO', 'EM_ATENDIMENTO', 'AGUARDANDO_CLIENTE', 'RESOLVIDO', 'FECHADO');

-- CreateEnum
CREATE TYPE "PrioridadeChamado" AS ENUM ('BAIXA', 'NORMAL', 'ALTA', 'URGENTE');

-- CreateTable
CREATE TABLE "Chamado" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "clienteId" TEXT,
    "contato" TEXT,
    "telefone" TEXT,
    "assunto" TEXT NOT NULL,
    "descricao" TEXT,
    "canal" TEXT NOT NULL DEFAULT 'TELEFONE',
    "categoria" TEXT,
    "prioridade" "PrioridadeChamado" NOT NULL DEFAULT 'NORMAL',
    "status" "StatusChamado" NOT NULL DEFAULT 'ABERTO',
    "responsavelId" TEXT,
    "abertoPorId" TEXT,
    "prazo" TIMESTAMP(3),
    "osId" TEXT,
    "primeiraRespostaEm" TIMESTAMP(3),
    "resolvidoEm" TIMESTAMP(3),
    "solucao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chamado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChamadoInteracao" (
    "id" TEXT NOT NULL,
    "chamadoId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "usuarioNome" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'COMENTARIO',
    "texto" TEXT NOT NULL,
    "interno" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChamadoInteracao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Chamado_numero_key" ON "Chamado"("numero");

-- CreateIndex
CREATE INDEX "Chamado_status_idx" ON "Chamado"("status");

-- CreateIndex
CREATE INDEX "Chamado_clienteId_idx" ON "Chamado"("clienteId");

-- CreateIndex
CREATE INDEX "Chamado_responsavelId_status_idx" ON "Chamado"("responsavelId", "status");

-- CreateIndex
CREATE INDEX "ChamadoInteracao_chamadoId_createdAt_idx" ON "ChamadoInteracao"("chamadoId", "createdAt");

-- AddForeignKey
ALTER TABLE "Chamado" ADD CONSTRAINT "Chamado_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chamado" ADD CONSTRAINT "Chamado_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chamado" ADD CONSTRAINT "Chamado_abertoPorId_fkey" FOREIGN KEY ("abertoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chamado" ADD CONSTRAINT "Chamado_osId_fkey" FOREIGN KEY ("osId") REFERENCES "OrdemServico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChamadoInteracao" ADD CONSTRAINT "ChamadoInteracao_chamadoId_fkey" FOREIGN KEY ("chamadoId") REFERENCES "Chamado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
