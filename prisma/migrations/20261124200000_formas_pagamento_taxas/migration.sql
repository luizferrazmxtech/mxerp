-- Formas de pagamento com taxas: tabela por bandeira e nº de vezes (cartão), plano de contas da taxa,
-- bandeira/vezes nas parcelas de venda e OS e no pagamento do PDV, e a taxa ligada à conta a receber.

-- AlterTable
ALTER TABLE "FormaPagamento" ADD COLUMN "taxas" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "categoriaTaxaId" TEXT;

-- AlterTable
ALTER TABLE "OsParcela" ADD COLUMN "bandeira" TEXT,
ADD COLUMN "vezes" INTEGER;

-- AlterTable
ALTER TABLE "VendaParcela" ADD COLUMN "bandeira" TEXT,
ADD COLUMN "vezes" INTEGER;

-- AlterTable
ALTER TABLE "VendaPagamento" ADD COLUMN "bandeira" TEXT;

-- AlterTable
ALTER TABLE "Lancamento" ADD COLUMN "taxaDeId" TEXT;

-- CreateIndex
CREATE INDEX "Lancamento_taxaDeId_idx" ON "Lancamento"("taxaDeId");

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_taxaDeId_fkey" FOREIGN KEY ("taxaDeId") REFERENCES "Lancamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Taxas da PagSeguro já cadastradas (como o simulador da maquininha: intermediação do plano + parcelamento, que é a
-- antecipação a 1,71% ao mês paga pelo lojista) nas formas de cartão (crédito 03 e débito 04) de todas as empresas.
-- Ficam editáveis em Financeiro › Opções auxiliares › Formas de pagamento.
UPDATE "FormaPagamento" SET "taxas" = '{"grupos":[{"nome":"Visa e Mastercard (na hora)","bandeiras":["Visa","Mastercard"],"prazoCredito":0,"prazoDebito":0,"debito":1.55,"intermediacao":[3.05,2.75,2.75,2.75,2.75,2.75,2.85,2.85,2.85,2.85,2.85,2.85],"parcelamento":[0,2.51,3.33,4.13,4.93,5.72,6.51,7.28,8.04,8.8,9.54,10.28]},{"nome":"Diners (30 dias)","bandeiras":["Diners"],"prazoCredito":30,"prazoDebito":1,"debito":null,"intermediacao":[3.19,3.79,3.79,3.79,3.79,3.79,3.79,3.79,3.79,3.79,3.79,3.79],"parcelamento":[0,2.51,3.33,4.13,4.93,5.72,6.51,7.28,8.04,8.8,9.54,10.28]},{"nome":"Demais bandeiras (na hora)","bandeiras":["Elo","Hipercard","American Express","Aura","Brasilcard","Verdcard","Cabal","Sorocred","Banescard","Outras"],"prazoCredito":0,"prazoDebito":0,"debito":null,"intermediacao":[4.75,4.25,4.25,4.25,4.25,4.25,4.35,4.35,4.35,4.35,4.35,4.35],"parcelamento":[0,2.51,3.33,4.13,4.93,5.72,6.51,7.28,8.04,8.8,9.54,10.28]}],"acrescimoMes":1.71}'::jsonb
 WHERE "tPag" IN ('03', '04') AND "taxas" = '{}'::jsonb;

-- Cartão sem conta de destino passa a cair na conta "PagSeguro" da mesma empresa, quando ela existe.
UPDATE "FormaPagamento" f SET "contaBancariaId" = c.id
  FROM "ContaBancaria" c
 WHERE f."tPag" IN ('03', '04') AND f."contaBancariaId" IS NULL AND c.nome = 'PagSeguro' AND c."empresaId" = f."empresaId";
