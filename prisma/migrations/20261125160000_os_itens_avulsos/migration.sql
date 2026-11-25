-- Itens avulsos na OS (orçamento de conclusão): a linha guarda a descrição digitada e aponta para o
-- produto de sistema ITEM-AVULSO. A OS não pode ser concluída/faturada enquanto tiver item avulso.
ALTER TABLE "OsItemProduto" ADD COLUMN "descricao" TEXT;

-- OS geradas de orçamento com item avulso (antes a descrição ia para os detalhes da peça "Item avulso")
UPDATE "OsItemProduto" i SET "descricao" = COALESCE(NULLIF(TRIM(i."detalhes"), ''), 'Item avulso'), "detalhes" = NULL
FROM "Produto" p WHERE p."id" = i."produtoId" AND p."codigo" = 'ITEM-AVULSO' AND i."descricao" IS NULL;
