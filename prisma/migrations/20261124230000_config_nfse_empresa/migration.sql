-- Tributação da NFS-e por empresa (natureza de operação, apuração, imunidade, suspensão, códigos da prefeitura).
ALTER TABLE "Empresa" ADD COLUMN "configNfse" JSONB NOT NULL DEFAULT '{}';
