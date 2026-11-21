-- CreateTable
CREATE TABLE "FavorecidoExtrato" (
    "chave" TEXT NOT NULL,
    "documento" TEXT,
    "cnae" TEXT,
    "razaoSocial" TEXT,
    "consultadoEm" TIMESTAMP(3),
    "erro" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FavorecidoExtrato_pkey" PRIMARY KEY ("chave")
);
