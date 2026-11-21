-- MXERP da MXTECH como cliente da casa (sem plano nem cobrança)
ALTER TABLE "Cliente" ADD COLUMN "interno" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Cliente" ALTER COLUMN "planoId" DROP NOT NULL;
