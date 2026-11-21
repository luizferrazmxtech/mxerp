-- CreateEnum
CREATE TYPE "SituacaoCliente" AS ENUM ('CRIANDO', 'ATIVO', 'SUSPENSO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "SituacaoFatura" AS ENUM ('ABERTA', 'PAGA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "SituacaoTarefa" AS ENUM ('PENDENTE', 'EXECUTANDO', 'OK', 'ERRO');

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sessao" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "expira" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sessao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plano" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "valorMensal" DECIMAL(12,2) NOT NULL,
    "maxEmpresas" INTEGER NOT NULL DEFAULT 1,
    "maxUsuarios" INTEGER NOT NULL DEFAULT 3,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plano_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "cep" TEXT,
    "dominio" TEXT NOT NULL,
    "planoId" TEXT NOT NULL,
    "valorMensal" DECIMAL(12,2),
    "maxEmpresas" INTEGER,
    "maxUsuarios" INTEGER,
    "diaVencimento" INTEGER NOT NULL DEFAULT 10,
    "inicioCobranca" DATE NOT NULL,
    "situacao" "SituacaoCliente" NOT NULL DEFAULT 'CRIANDO',
    "liberadoAte" DATE,
    "licencaToken" TEXT NOT NULL,
    "backupHorarios" TEXT NOT NULL DEFAULT '0300,1230,1930',
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fatura" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "vencimento" DATE NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "situacao" "SituacaoFatura" NOT NULL DEFAULT 'ABERTA',
    "pagaEm" DATE,
    "valorPago" DECIMAL(12,2),
    "formaPagamento" TEXT,
    "seuNumero" TEXT,
    "codigoSolicitacao" TEXT,
    "boletoSituacao" TEXT,
    "boletoErro" TEXT,
    "linhaDigitavel" TEXT,
    "pixCopiaECola" TEXT,
    "emailEnviadoEm" TIMESTAMP(3),
    "lembreteEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tarefa" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "clienteId" TEXT,
    "parametros" JSONB NOT NULL DEFAULT '{}',
    "situacao" "SituacaoTarefa" NOT NULL DEFAULT 'PENDENTE',
    "saida" TEXT,
    "pedidoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciadoEm" TIMESTAMP(3),
    "fimEm" TIMESTAMP(3),

    CONSTRAINT "Tarefa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuracao" (
    "chave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Configuracao_pkey" PRIMARY KEY ("chave")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Sessao_tokenHash_key" ON "Sessao"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Plano_nome_key" ON "Plano"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_slug_key" ON "Cliente"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_licencaToken_key" ON "Cliente"("licencaToken");

-- CreateIndex
CREATE UNIQUE INDEX "Fatura_seuNumero_key" ON "Fatura"("seuNumero");

-- CreateIndex
CREATE UNIQUE INDEX "Fatura_codigoSolicitacao_key" ON "Fatura"("codigoSolicitacao");

-- CreateIndex
CREATE UNIQUE INDEX "Fatura_clienteId_competencia_key" ON "Fatura"("clienteId", "competencia");

-- CreateIndex
CREATE INDEX "Tarefa_situacao_createdAt_idx" ON "Tarefa"("situacao", "createdAt");

-- AddForeignKey
ALTER TABLE "Sessao" ADD CONSTRAINT "Sessao_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_planoId_fkey" FOREIGN KEY ("planoId") REFERENCES "Plano"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fatura" ADD CONSTRAINT "Fatura_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tarefa" ADD CONSTRAINT "Tarefa_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
