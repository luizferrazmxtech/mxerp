-- Número oficial da NFS-e (o "numero" continua sendo o da DPS/RPS, que controla a numeração)
ALTER TABLE "NotaFiscal" ADD COLUMN "numeroNfse" INTEGER;
-- NFS-e já autorizadas pelo MXERP: o número vem no XML devolvido (<nNFSe>)
UPDATE "NotaFiscal" SET "numeroNfse" = substring("xml" from '<nNFSe>\s*(\d+)\s*</nNFSe>')::int
 WHERE "modelo" = 'NFSE' AND "xml" ~ '<nNFSe>\s*\d+\s*</nNFSe>';
