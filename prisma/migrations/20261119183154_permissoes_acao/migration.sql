-- CreateTable
CREATE TABLE "PermissaoPapel" (
    "id" TEXT NOT NULL,
    "papel" "PapelUsuario" NOT NULL,
    "acao" TEXT NOT NULL,
    "permitido" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissaoPapel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PermissaoPapel_papel_acao_key" ON "PermissaoPapel"("papel", "acao");
