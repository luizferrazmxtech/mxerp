-- CreateEnum
CREATE TYPE "LiberacaoComissao" AS ENUM ('GERADO_FINANCEIRO', 'PRIMEIRA_PARCELA', 'ULTIMA_PARCELA', 'PARCIAL');

-- CreateEnum
CREATE TYPE "TipoCampoExtra" AS ENUM ('TEXTO', 'NUMEROS', 'DATA', 'CPF', 'CNPJ', 'SELECAO_UNICA', 'MULTIPLA_SELECAO');

-- AlterEnum
ALTER TYPE "TipoPessoa" ADD VALUE 'ESTRANGEIRO';

-- AlterTable
ALTER TABLE "Pessoa" ADD COLUMN     "areaCliente" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "camposExtras" JSONB,
ADD COLUMN     "codigoCliente" INTEGER,
ADD COLUMN     "codigoFornecedor" INTEGER,
ADD COLUMN     "codigoTransportadora" INTEGER,
ADD COLUMN     "criadoPorId" TEXT,
ADD COLUMN     "excederLimite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fax" TEXT,
ADD COLUMN     "foto" BYTEA,
ADD COLUMN     "fotoTipo" TEXT,
ADD COLUMN     "inscricaoMunicipal" TEXT,
ADD COLUMN     "limiteCredito" DECIMAL(14,2),
ADD COLUMN     "nascimento" DATE,
ADD COLUMN     "nomeSocial" TEXT,
ADD COLUMN     "pais" TEXT NOT NULL DEFAULT 'Brasil',
ADD COLUMN     "responsavel" TEXT,
ADD COLUMN     "rg" TEXT,
ADD COLUMN     "site" TEXT,
ADD COLUMN     "suframa" TEXT,
ADD COLUMN     "transportadora" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vendedorId" TEXT;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "acessoSistema" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "bairro" TEXT,
ADD COLUMN     "celular" TEXT,
ADD COLUMN     "celular2" TEXT,
ADD COLUMN     "cep" TEXT,
ADD COLUMN     "cidade" TEXT,
ADD COLUMN     "codigoMunicipio" TEXT,
ADD COLUMN     "comissao" DECIMAL(6,2),
ADD COLUMN     "complemento" TEXT,
ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "foto" BYTEA,
ADD COLUMN     "fotoTipo" TEXT,
ADD COLUMN     "liberacaoComissao" "LiberacaoComissao" NOT NULL DEFAULT 'PARCIAL',
ADD COLUMN     "logradouro" TEXT,
ADD COLUMN     "lojas" TEXT[],
ADD COLUMN     "nascimento" DATE,
ADD COLUMN     "numero" TEXT,
ADD COLUMN     "observacoes" TEXT,
ADD COLUMN     "preferencias" JSONB,
ADD COLUMN     "rg" TEXT,
ADD COLUMN     "sexo" TEXT,
ADD COLUMN     "telefone" TEXT,
ADD COLUMN     "uf" CHAR(2),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "senhaHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PessoaEndereco" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "tipo" TEXT,
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "codigoMunicipio" TEXT,
    "uf" CHAR(2),

    CONSTRAINT "PessoaEndereco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PessoaContato" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "tipo" TEXT,
    "nome" TEXT,
    "contato" TEXT,
    "cargo" TEXT,
    "observacao" TEXT,

    CONSTRAINT "PessoaContato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PessoaAnotacao" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PessoaAnotacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anexo" (
    "id" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "dados" BYTEA NOT NULL,
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Anexo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TipoContato" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "TipoContato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TipoEndereco" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "TipoEndereco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampoExtra" (
    "id" TEXT NOT NULL,
    "entidade" TEXT NOT NULL DEFAULT 'CLIENTE',
    "nome" TEXT NOT NULL,
    "tipo" "TipoCampoExtra" NOT NULL DEFAULT 'TEXTO',
    "opcoes" TEXT[],
    "obrigatorio" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampoExtra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PessoaEndereco_pessoaId_idx" ON "PessoaEndereco"("pessoaId");

-- CreateIndex
CREATE INDEX "PessoaContato_pessoaId_idx" ON "PessoaContato"("pessoaId");

-- CreateIndex
CREATE INDEX "PessoaAnotacao_pessoaId_idx" ON "PessoaAnotacao"("pessoaId");

-- CreateIndex
CREATE INDEX "Anexo_entidade_entidadeId_idx" ON "Anexo"("entidade", "entidadeId");

-- CreateIndex
CREATE UNIQUE INDEX "TipoContato_nome_key" ON "TipoContato"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "TipoEndereco_nome_key" ON "TipoEndereco"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Pessoa_codigoCliente_key" ON "Pessoa"("codigoCliente");

-- CreateIndex
CREATE UNIQUE INDEX "Pessoa_codigoFornecedor_key" ON "Pessoa"("codigoFornecedor");

-- CreateIndex
CREATE UNIQUE INDEX "Pessoa_codigoTransportadora_key" ON "Pessoa"("codigoTransportadora");

-- AddForeignKey
ALTER TABLE "Pessoa" ADD CONSTRAINT "Pessoa_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pessoa" ADD CONSTRAINT "Pessoa_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PessoaEndereco" ADD CONSTRAINT "PessoaEndereco_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PessoaContato" ADD CONSTRAINT "PessoaContato_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PessoaAnotacao" ADD CONSTRAINT "PessoaAnotacao_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PessoaAnotacao" ADD CONSTRAINT "PessoaAnotacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Dados: endereço principal vira o primeiro da lista de endereços
INSERT INTO "PessoaEndereco" ("id", "pessoaId", "ordem", "tipo", "cep", "logradouro", "numero", "complemento", "bairro", "cidade", "codigoMunicipio", "uf")
SELECT 'end_' || "id", "id", 0, NULL, "cep", "logradouro", "numero", "complemento", "bairro", "cidade", "codigoMunicipio", "uf"
FROM "Pessoa" WHERE COALESCE("logradouro", "cep", "cidade") IS NOT NULL;

-- Códigos: o do Gestão Click (idLegado "cliente:237") quando houver; o resto continua depois do maior
UPDATE "Pessoa" SET "codigoCliente" = substring("idLegado" from 9)::int WHERE "idLegado" ~ '^cliente:[0-9]+$';
UPDATE "Pessoa" SET "codigoFornecedor" = substring("idLegado" from 12)::int WHERE "idLegado" ~ '^fornecedor:[0-9]+$';
WITH n AS (SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS r FROM "Pessoa" WHERE "cliente" AND "codigoCliente" IS NULL)
UPDATE "Pessoa" p SET "codigoCliente" = (SELECT COALESCE(MAX("codigoCliente"), 0) FROM "Pessoa") + n.r FROM n WHERE p."id" = n."id";
WITH n AS (SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS r FROM "Pessoa" WHERE "fornecedor" AND "codigoFornecedor" IS NULL)
UPDATE "Pessoa" p SET "codigoFornecedor" = (SELECT COALESCE(MAX("codigoFornecedor"), 0) FROM "Pessoa") + n.r FROM n WHERE p."id" = n."id";
INSERT INTO "Sequencia" ("chave", "valor") SELECT 'CLIENTE', COALESCE(MAX("codigoCliente"), 0) FROM "Pessoa"
  ON CONFLICT ("chave") DO UPDATE SET "valor" = GREATEST("Sequencia"."valor", EXCLUDED."valor");
INSERT INTO "Sequencia" ("chave", "valor") SELECT 'FORNECEDOR', COALESCE(MAX("codigoFornecedor"), 0) FROM "Pessoa"
  ON CONFLICT ("chave") DO UPDATE SET "valor" = GREATEST("Sequencia"."valor", EXCLUDED."valor");

-- Opções auxiliares padrão do Gestão Click
INSERT INTO "TipoContato" ("id", "nome") VALUES ('tc_telefone', 'Telefone'), ('tc_email', 'E-mail'), ('tc_facebook', 'Facebook'), ('tc_whatsapp', 'WhatsApp'), ('tc_skype', 'Skype') ON CONFLICT DO NOTHING;
INSERT INTO "TipoEndereco" ("id", "nome") VALUES ('te_comercial', 'Comercial'), ('te_residencial', 'Residencial'), ('te_entrega', 'Entrega') ON CONFLICT DO NOTHING;

-- Todo funcionário existente tem acesso às empresas cadastradas
UPDATE "Usuario" SET "lojas" = ARRAY(SELECT "id" FROM "Empresa");
