-- Conversão de unidade na compra: a linha guarda a unidade da nota e quantas unidades do produto vêm em cada uma
ALTER TABLE "CompraItem" ADD COLUMN "unidadeCompra" TEXT,
ADD COLUMN "fator" DECIMAL(14,4) NOT NULL DEFAULT 1;
