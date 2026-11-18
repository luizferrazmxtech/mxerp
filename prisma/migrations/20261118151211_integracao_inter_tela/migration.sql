-- CreateTable
CREATE TABLE "IntegracaoInter" (
    "id" TEXT NOT NULL DEFAULT 'inter',
    "clientId" TEXT NOT NULL,
    "clientSecretCifrado" TEXT NOT NULL,
    "certificado" TEXT NOT NULL,
    "chaveCifrada" TEXT NOT NULL,
    "contaCorrente" TEXT,
    "ambiente" TEXT NOT NULL DEFAULT 'producao',
    "escopos" TEXT NOT NULL DEFAULT 'extrato.read',
    "contaBancariaId" TEXT,
    "sincronizarAuto" BOOLEAN NOT NULL DEFAULT true,
    "ultimoTesteEm" TIMESTAMP(3),
    "ultimoTesteOk" BOOLEAN,
    "ultimoTesteMsg" TEXT,
    "ultimaSincEm" TIMESTAMP(3),
    "ultimaSincMsg" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegracaoInter_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "IntegracaoInter" ADD CONSTRAINT "IntegracaoInter_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
