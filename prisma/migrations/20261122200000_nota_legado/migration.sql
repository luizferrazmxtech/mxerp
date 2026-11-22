-- notas emitidas no sistema anterior (Gestão Click), trazidas para consulta: sem XML, com o destinatário em texto
ALTER TABLE "NotaFiscal" ADD COLUMN "destinatarioNome" TEXT;
ALTER TABLE "NotaFiscal" ADD COLUMN "idLegado" TEXT;
CREATE UNIQUE INDEX "NotaFiscal_idLegado_key" ON "NotaFiscal"("idLegado");
