-- o número da nota é de cada CNPJ: duas lojas podem ter a NF-e nº 100 da série 1
DROP INDEX "NotaFiscal_modelo_serie_numero_ambiente_key";
CREATE UNIQUE INDEX "NotaFiscal_empresaId_modelo_serie_numero_ambiente_key" ON "NotaFiscal"("empresaId", "modelo", "serie", "numero", "ambiente");
