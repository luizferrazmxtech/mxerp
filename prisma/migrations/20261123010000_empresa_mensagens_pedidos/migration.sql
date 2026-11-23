-- Mensagens do WhatsApp e pedidos dos marketplaces passam a ser de uma empresa (nenhuma tela mostra os da outra)
ALTER TABLE "MensagemWhatsapp" ADD COLUMN "empresaId" TEXT;
ALTER TABLE "PedidoMarketplace" ADD COLUMN "empresaId" TEXT;
UPDATE "MensagemWhatsapp" m SET "empresaId" = o."empresaId" FROM "OrdemServico" o WHERE m.entidade = 'OS' AND m."entidadeId" = o.id;
UPDATE "MensagemWhatsapp" m SET "empresaId" = c."empresaId" FROM "Contrato" c WHERE m.entidade = 'CONTRATO' AND m."entidadeId" = c.id;
UPDATE "PedidoMarketplace" p SET "empresaId" = v."empresaId" FROM "Venda" v WHERE p."vendaId" = v.id;
CREATE INDEX "MensagemWhatsapp_empresaId_idx" ON "MensagemWhatsapp"("empresaId");
CREATE INDEX "PedidoMarketplace_empresaId_idx" ON "PedidoMarketplace"("empresaId");
