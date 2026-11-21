-- Notas recebidas: novo pedido automático do XML completo depois da ciência
ALTER TABLE "NotaRecebida" ADD COLUMN "xmlTentativas" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "NotaRecebida" ADD COLUMN "xmlTentadoEm" TIMESTAMP(3);
