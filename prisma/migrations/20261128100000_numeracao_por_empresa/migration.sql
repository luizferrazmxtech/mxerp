-- Numeração por empresa: o número de vendas, OS, orçamentos, compras e demais documentos é único dentro da
-- empresa (cada uma tem a sua sequência, "VENDA" na principal e "VENDA#emp:<id>" nas outras).
DROP INDEX IF EXISTS "OrdemServico_numero_key";
CREATE UNIQUE INDEX "OrdemServico_empresaId_numero_key" ON "OrdemServico"("empresaId", "numero") NULLS NOT DISTINCT;
DROP INDEX IF EXISTS "Venda_numero_key";
CREATE UNIQUE INDEX "Venda_empresaId_numero_key" ON "Venda"("empresaId", "numero") NULLS NOT DISTINCT;
DROP INDEX IF EXISTS "Devolucao_numero_key";
CREATE UNIQUE INDEX "Devolucao_empresaId_numero_key" ON "Devolucao"("empresaId", "numero") NULLS NOT DISTINCT;
DROP INDEX IF EXISTS "Compra_numero_key";
CREATE UNIQUE INDEX "Compra_empresaId_numero_key" ON "Compra"("empresaId", "numero") NULLS NOT DISTINCT;
DROP INDEX IF EXISTS "AjusteEstoque_numero_key";
CREATE UNIQUE INDEX "AjusteEstoque_empresaId_numero_key" ON "AjusteEstoque"("empresaId", "numero") NULLS NOT DISTINCT;
DROP INDEX IF EXISTS "TransferenciaEstoque_numero_key";
CREATE UNIQUE INDEX "TransferenciaEstoque_empresaId_numero_key" ON "TransferenciaEstoque"("empresaId", "numero") NULLS NOT DISTINCT;
DROP INDEX IF EXISTS "Inventario_numero_key";
CREATE UNIQUE INDEX "Inventario_empresaId_numero_key" ON "Inventario"("empresaId", "numero") NULLS NOT DISTINCT;
DROP INDEX IF EXISTS "Cotacao_numero_key";
CREATE UNIQUE INDEX "Cotacao_empresaId_numero_key" ON "Cotacao"("empresaId", "numero") NULLS NOT DISTINCT;
DROP INDEX IF EXISTS "Orcamento_numero_key";
CREATE UNIQUE INDEX "Orcamento_empresaId_numero_key" ON "Orcamento"("empresaId", "numero") NULLS NOT DISTINCT;
DROP INDEX IF EXISTS "Contrato_numero_key";
CREATE UNIQUE INDEX "Contrato_empresaId_numero_key" ON "Contrato"("empresaId", "numero") NULLS NOT DISTINCT;
DROP INDEX IF EXISTS "Chamado_numero_key";
CREATE UNIQUE INDEX "Chamado_empresaId_numero_key" ON "Chamado"("empresaId", "numero") NULLS NOT DISTINCT;
