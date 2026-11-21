-- AlterTable
ALTER TABLE "Lancamento" ADD COLUMN     "funcionarioId" TEXT;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "salario" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "RegraConciliacao" (
    "id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "modo" TEXT NOT NULL DEFAULT 'IGUAL',
    "tipo" "TipoLancamento" NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "centroCustoId" TEXT,
    "descricao" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'APRENDIDA',
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "vezes" INTEGER NOT NULL DEFAULT 0,
    "ultimaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegraConciliacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaldoBancario" (
    "id" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "saldo" DECIMAL(14,2) NOT NULL,
    "origem" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaldoBancario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegraConciliacao_texto_modo_tipo_key" ON "RegraConciliacao"("texto", "modo", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "SaldoBancario_contaBancariaId_data_origem_key" ON "SaldoBancario"("contaBancariaId", "data", "origem");

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegraConciliacao" ADD CONSTRAINT "RegraConciliacao_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaFinanceira"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegraConciliacao" ADD CONSTRAINT "RegraConciliacao_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaldoBancario" ADD CONSTRAINT "SaldoBancario_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

