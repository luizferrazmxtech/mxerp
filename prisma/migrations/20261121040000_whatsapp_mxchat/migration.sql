-- WhatsApp pelo MXChat: texto próprio nos modelos de mensagem, canais da cobrança dos contratos e histórico de envios.
ALTER TABLE "ModeloMensagem" ADD COLUMN "whatsapp" TEXT;

ALTER TABLE "Contrato" ADD COLUMN "canalEmail" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Contrato" ADD COLUMN "canalWhatsapp" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contrato" ADD COLUMN "whatsappCobranca" TEXT;

ALTER TABLE "ContratoCobranca" ADD COLUMN "boletoWhatsEm" TIMESTAMP(3);
ALTER TABLE "ContratoCobranca" ADD COLUMN "lembreteWhatsEm" TIMESTAMP(3);

CREATE TABLE "MensagemWhatsapp" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "arquivoNome" TEXT,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT,
    "pessoaId" TEXT,
    "situacao" TEXT NOT NULL,
    "erro" TEXT,
    "automatica" BOOLEAN NOT NULL DEFAULT false,
    "usuarioNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MensagemWhatsapp_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MensagemWhatsapp_entidade_entidadeId_idx" ON "MensagemWhatsapp"("entidade", "entidadeId");
CREATE INDEX "MensagemWhatsapp_createdAt_idx" ON "MensagemWhatsapp"("createdAt");
