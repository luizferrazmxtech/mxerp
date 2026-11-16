-- OS no padrão do Gestão Click: vários equipamentos por OS, prioridade, canal, frete, outros e observação interna.

-- CreateEnum
CREATE TYPE "PrioridadeOs" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE', 'MUITO_URGENTE');

-- CreateTable
CREATE TABLE "OsEquipamento" (
    "id" TEXT NOT NULL,
    "osId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 1,
    "equipamento" TEXT NOT NULL,
    "marca" TEXT,
    "modelo" TEXT,
    "serie" TEXT,
    "condicoes" TEXT,
    "defeitos" TEXT,
    "acessorios" TEXT,
    "solucao" TEXT,
    "laudo" TEXT,
    "garantia" TEXT,

    CONSTRAINT "OsEquipamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OsEquipamento_osId_idx" ON "OsEquipamento"("osId");

-- AddForeignKey
ALTER TABLE "OsEquipamento" ADD CONSTRAINT "OsEquipamento_osId_fkey" FOREIGN KEY ("osId") REFERENCES "OrdemServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Leva o equipamento que já estava na OS para a nova tabela (antes de apagar as colunas)
INSERT INTO "OsEquipamento" ("id", "osId", "ordem", "equipamento", "marca", "modelo", "serie", "defeitos", "laudo")
SELECT 'eq' || md5(random()::text || "id"), "id", 1, COALESCE(NULLIF("equipamento", ''), 'Equipamento'), "marca", "modelo", "numeroSerie", "defeito", "laudo"
FROM "OrdemServico"
WHERE COALESCE("equipamento", '') <> '' OR COALESCE("defeito", '') <> '' OR COALESCE("laudo", '') <> ''
   OR COALESCE("marca", '') <> '' OR COALESCE("modelo", '') <> '' OR COALESCE("numeroSerie", '') <> '';

-- AlterTable
ALTER TABLE "OrdemServico" DROP COLUMN "defeito",
DROP COLUMN "equipamento",
DROP COLUMN "laudo",
DROP COLUMN "marca",
DROP COLUMN "modelo",
DROP COLUMN "numeroSerie",
ADD COLUMN     "canal" TEXT NOT NULL DEFAULT 'Presencial',
ADD COLUMN     "frete" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "observacaoInterna" TEXT,
ADD COLUMN     "outros" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "prioridade" "PrioridadeOs";
