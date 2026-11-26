-- Vendas trazidas do Gestão Click entraram com a data à meia-noite UTC, que em São Paulo é 21h do dia anterior:
-- a venda de 25/11 aparecia como 24/11. Passa para meio-dia de São Paulo (15h UTC), como a tela grava.
UPDATE "Venda" SET "data" = "data" + interval '15 hours'
WHERE "idLegado" IS NOT NULL AND "data"::time = '00:00:00';

-- Mesma coisa na previsão de entrega das OS trazidas do Gestão Click.
UPDATE "OrdemServico" SET "previsao" = "previsao" + interval '15 hours'
WHERE "idLegado" IS NOT NULL AND "previsao" IS NOT NULL AND "previsao"::time = '00:00:00';
