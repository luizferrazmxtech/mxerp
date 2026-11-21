-- Área do Cliente: senha e convite do cliente, sessões próprias
ALTER TABLE "Pessoa" ADD COLUMN "portalSenhaHash" TEXT,
  ADD COLUMN "portalConviteHash" TEXT,
  ADD COLUMN "portalConviteExpira" TIMESTAMP(3),
  ADD COLUMN "portalUltimoAcesso" TIMESTAMP(3);
CREATE UNIQUE INDEX "Pessoa_portalConviteHash_key" ON "Pessoa"("portalConviteHash");

CREATE TABLE "SessaoCliente" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "expira" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessaoCliente_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SessaoCliente_tokenHash_key" ON "SessaoCliente"("tokenHash");
CREATE INDEX "SessaoCliente_pessoaId_idx" ON "SessaoCliente"("pessoaId");
ALTER TABLE "SessaoCliente" ADD CONSTRAINT "SessaoCliente_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
