-- CreateEnum
CREATE TYPE "SituacaoContrato" AS ENUM ('EM_ABERTO', 'ATIVO', 'PAUSADO', 'FINALIZADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "Periodicidade" AS ENUM ('MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL');

-- CreateTable
CREATE TABLE "Contrato" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "clienteId" TEXT NOT NULL,
    "vendedorId" TEXT,
    "situacao" "SituacaoContrato" NOT NULL DEFAULT 'ATIVO',
    "canal" TEXT NOT NULL DEFAULT 'Presencial',
    "centroCusto" TEXT,
    "dataInicio" DATE NOT NULL,
    "periodicidade" "Periodicidade" NOT NULL DEFAULT 'MENSAL',
    "diaVencimento" INTEGER NOT NULL,
    "proximoVencimento" DATE NOT NULL,
    "termino" TEXT NOT NULL DEFAULT 'SEM',
    "dataFim" DATE,
    "totalCobrancas" INTEGER,
    "cobrancasGeradas" INTEGER NOT NULL DEFAULT 0,
    "totalServicos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "descontoPercentual" DECIMAL(7,4),
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "formaPagamentoId" TEXT,
    "diasAntecedencia" INTEGER NOT NULL DEFAULT 10,
    "enviarBoleto" BOOLEAN NOT NULL DEFAULT true,
    "diasLembrete" INTEGER,
    "emitirNota" BOOLEAN NOT NULL DEFAULT false,
    "emailCobranca" TEXT,
    "observacoes" TEXT,
    "observacaoInterna" TEXT,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContratoServico" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "servicoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "detalhes" TEXT,
    "quantidade" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "valorUnit" DECIMAL(14,2) NOT NULL,
    "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "ContratoServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContratoCobranca" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "vencimento" DATE NOT NULL,
    "referencia" TEXT NOT NULL,
    "situacao" TEXT NOT NULL DEFAULT 'PENDENTE',
    "erro" TEXT,
    "vendaId" TEXT,
    "notaMsg" TEXT,
    "notaTentadaEm" TIMESTAMP(3),
    "boletoEnviadoEm" TIMESTAMP(3),
    "lembreteEnviadoEm" TIMESTAMP(3),
    "envioErro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContratoCobranca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContratoHistorico" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "usuarioNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContratoHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contrato_numero_key" ON "Contrato"("numero");

-- CreateIndex
CREATE INDEX "Contrato_situacao_proximoVencimento_idx" ON "Contrato"("situacao", "proximoVencimento");

-- CreateIndex
CREATE UNIQUE INDEX "ContratoCobranca_vendaId_key" ON "ContratoCobranca"("vendaId");

-- CreateIndex
CREATE INDEX "ContratoCobranca_situacao_idx" ON "ContratoCobranca"("situacao");

-- CreateIndex
CREATE UNIQUE INDEX "ContratoCobranca_contratoId_vencimento_key" ON "ContratoCobranca"("contratoId", "vencimento");

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_formaPagamentoId_fkey" FOREIGN KEY ("formaPagamentoId") REFERENCES "FormaPagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContratoServico" ADD CONSTRAINT "ContratoServico_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContratoServico" ADD CONSTRAINT "ContratoServico_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "Servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContratoCobranca" ADD CONSTRAINT "ContratoCobranca_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContratoHistorico" ADD CONSTRAINT "ContratoHistorico_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
