-- AlterTable
ALTER TABLE "FormaPagamento" ADD COLUMN     "boletoInter" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "IntegracaoInter" ADD COLUMN     "boletosDesde" TIMESTAMP(3),
ADD COLUMN     "diasBaixa" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "emitirBoletos" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "jurosMesPct" DECIMAL(5,2) NOT NULL DEFAULT 1,
ADD COLUMN     "mensagemBoleto" TEXT,
ADD COLUMN     "multaPct" DECIMAL(5,2) NOT NULL DEFAULT 2,
ADD COLUMN     "ultimaSincBoletosEm" TIMESTAMP(3),
ADD COLUMN     "ultimaSincBoletosMsg" TEXT,
ADD COLUMN     "urlPublica" TEXT,
ADD COLUMN     "webhookMsg" TEXT,
ADD COLUMN     "webhookToken" TEXT,
ALTER COLUMN "escopos" SET DEFAULT 'extrato.read boleto-cobranca.read boleto-cobranca.write';

-- CreateTable
CREATE TABLE "Boleto" (
    "id" TEXT NOT NULL,
    "lancamentoId" TEXT,
    "token" TEXT NOT NULL,
    "seuNumero" TEXT NOT NULL,
    "codigoSolicitacao" TEXT,
    "situacao" TEXT NOT NULL DEFAULT 'EMITINDO',
    "valor" DECIMAL(14,2) NOT NULL,
    "vencimento" DATE NOT NULL,
    "nossoNumero" TEXT,
    "linhaDigitavel" TEXT,
    "codigoBarras" TEXT,
    "txid" TEXT,
    "pixCopiaECola" TEXT,
    "pdf" BYTEA,
    "erro" TEXT,
    "pagoEm" DATE,
    "valorRecebido" DECIMAL(14,2),
    "origemRecebimento" TEXT,
    "ambiente" TEXT NOT NULL DEFAULT 'producao',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Boleto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Boleto_token_key" ON "Boleto"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Boleto_codigoSolicitacao_key" ON "Boleto"("codigoSolicitacao");

-- CreateIndex
CREATE INDEX "Boleto_lancamentoId_idx" ON "Boleto"("lancamentoId");

-- CreateIndex
CREATE INDEX "Boleto_situacao_idx" ON "Boleto"("situacao");

-- CreateIndex
CREATE INDEX "Boleto_nossoNumero_idx" ON "Boleto"("nossoNumero");

-- CreateIndex
CREATE INDEX "Boleto_txid_idx" ON "Boleto"("txid");

-- AddForeignKey
ALTER TABLE "Boleto" ADD CONSTRAINT "Boleto_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "Lancamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Formas "boleto" (tPag 15 na NF-e) passam a registrar o boleto no Inter
UPDATE "FormaPagamento" SET "boletoInter" = true WHERE "tPag" = '15';

-- Integração já salva: pede também os escopos de cobrança (o token do extrato continua separado)
-- e só emite boleto para parcelas lançadas daqui para frente.
UPDATE "IntegracaoInter" SET "escopos" = trim("escopos" || ' boleto-cobranca.read boleto-cobranca.write')
 WHERE "escopos" NOT LIKE '%boleto-cobranca%';
UPDATE "IntegracaoInter" SET "boletosDesde" = CURRENT_TIMESTAMP WHERE "boletosDesde" IS NULL;
