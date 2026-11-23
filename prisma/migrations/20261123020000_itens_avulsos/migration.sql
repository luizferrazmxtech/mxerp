-- Itens avulsos em orçamentos e vendas: a linha guarda a descrição digitada e aponta para o
-- produto de sistema ITEM-AVULSO (não movimenta estoque, inativo, fora das listas e buscas).
ALTER TABLE "VendaItem" ADD COLUMN "descricao" TEXT;
ALTER TABLE "OrcamentoItem" ADD COLUMN "descricao" TEXT;

INSERT INTO "Produto" ("id", "codigo", "nome", "unidade", "controlaEstoque", "vendePdv", "ativo", "updatedAt")
VALUES ('produto-item-avulso', 'ITEM-AVULSO', 'Item avulso', 'UN', false, false, false, NOW())
ON CONFLICT ("codigo") DO NOTHING;
