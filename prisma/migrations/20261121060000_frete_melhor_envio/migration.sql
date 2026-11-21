-- Frete pelo Melhor Envio: serviço escolhido na venda e etiquetas compradas (rastreio).
ALTER TABLE "Venda" ADD COLUMN "freteServicoId" INTEGER;
ALTER TABLE "Venda" ADD COLUMN "freteServicoNome" TEXT;
ALTER TABLE "Venda" ADD COLUMN "fretePrazoDias" INTEGER;

CREATE TABLE "EnvioFrete" (
    "id" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "empresaId" TEXT,
    "servicoId" INTEGER NOT NULL,
    "servicoNome" TEXT NOT NULL,
    "transportadora" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "prazoDias" INTEGER,
    "volumes" JSONB NOT NULL DEFAULT '[]',
    "situacao" TEXT NOT NULL DEFAULT 'CARRINHO',
    "meId" TEXT,
    "protocolo" TEXT,
    "rastreio" TEXT,
    "rastreioMe" TEXT,
    "erro" TEXT,
    "pagaEm" TIMESTAMP(3),
    "geradaEm" TIMESTAMP(3),
    "postadaEm" TIMESTAMP(3),
    "entregueEm" TIMESTAMP(3),
    "canceladaEm" TIMESTAMP(3),
    "consultadaEm" TIMESTAMP(3),
    "usuarioNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnvioFrete_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EnvioFrete_meId_key" ON "EnvioFrete"("meId");
CREATE INDEX "EnvioFrete_vendaId_idx" ON "EnvioFrete"("vendaId");
CREATE INDEX "EnvioFrete_situacao_idx" ON "EnvioFrete"("situacao");
ALTER TABLE "EnvioFrete" ADD CONSTRAINT "EnvioFrete_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
