-- AlterTable
ALTER TABLE "GrupoProduto" ADD COLUMN     "paiId" TEXT;

-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "altura" DECIMAL(14,4),
ADD COLUMN     "camposExtras" JSONB,
ADD COLUMN     "codigoBeneficio" TEXT,
ADD COLUMN     "comissao" DECIMAL(6,2),
ADD COLUMN     "comprimento" DECIMAL(14,4),
ADD COLUMN     "criadoPorId" TEXT,
ADD COLUMN     "descricao" TEXT,
ADD COLUMN     "despesasAcessorias" DECIMAL(14,4) NOT NULL DEFAULT 0,
ADD COLUMN     "emiteNota" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "estoqueMaximo" DECIMAL(14,4),
ADD COLUMN     "fatorConversao" DECIMAL(14,4) NOT NULL DEFAULT 1,
ADD COLUMN     "largura" DECIMAL(14,4),
ADD COLUMN     "lojas" TEXT[],
ADD COLUMN     "numeroFci" TEXT,
ADD COLUMN     "outrasDespesas" DECIMAL(14,4) NOT NULL DEFAULT 0,
ADD COLUMN     "peso" DECIMAL(14,4),
ADD COLUMN     "pesoBruto" DECIMAL(14,4),
ADD COLUMN     "pesoLiquido" DECIMAL(14,4),
ADD COLUMN     "possuiComposicao" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "possuiVariacoes" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "produtoEspecifico" TEXT,
ADD COLUMN     "unidadeCompra" TEXT,
ADD COLUMN     "vendePdv" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "vendidoSeparadamente" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Servico" ADD COLUMN     "aliquotaCofins" DECIMAL(7,4),
ADD COLUMN     "aliquotaCsll" DECIMAL(7,4),
ADD COLUMN     "aliquotaInss" DECIMAL(7,4),
ADD COLUMN     "aliquotaIr" DECIMAL(7,4),
ADD COLUMN     "aliquotaPis" DECIMAL(7,4),
ADD COLUMN     "atividade" TEXT,
ADD COLUMN     "camposExtras" JSONB,
ADD COLUMN     "cnae" TEXT,
ADD COLUMN     "codigoLc116" TEXT,
ADD COLUMN     "codigoTributacaoMunicipal" TEXT,
ADD COLUMN     "comissao" DECIMAL(6,2),
ADD COLUMN     "construcaoCivil" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "custo" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "descontarDeducoes" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "descontarImpostos" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "descricao" TEXT,
ADD COLUMN     "descricaoAtividade" TEXT,
ADD COLUMN     "lojas" TEXT[],
ADD COLUMN     "reterIss" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Unidade" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sigla" TEXT NOT NULL,
    "padrao" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Unidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TipoValor" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "lucro" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "porRegras" BOOLEAN NOT NULL DEFAULT false,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "lojas" TEXT[],

    CONSTRAINT "TipoValor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdutoValor" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "tipoValorId" TEXT NOT NULL,
    "lucroUtilizado" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "valor" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProdutoValor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdutoComponente" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "componenteId" TEXT NOT NULL,
    "quantidade" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "ProdutoComponente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdutoVariacao" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "nome" TEXT NOT NULL,
    "codigo" TEXT,
    "gtin" TEXT,

    CONSTRAINT "ProdutoVariacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemFornecedor" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT,
    "servicoId" TEXT,
    "fornecedorId" TEXT NOT NULL,
    "codigo" TEXT,

    CONSTRAINT "ItemFornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoValor" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "anterior" DECIMAL(14,4) NOT NULL,
    "novo" DECIMAL(14,4) NOT NULL,
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricoValor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grade" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "variacoes" TEXT[],

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModeloEtiqueta" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "padrao" TEXT NOT NULL DEFAULT 'Personalizado',
    "altura" DECIMAL(6,2) NOT NULL,
    "largura" DECIMAL(6,2) NOT NULL,
    "pagina" TEXT NOT NULL DEFAULT 'A4',
    "colunas" INTEGER NOT NULL,
    "linhas" INTEGER NOT NULL,
    "margemSuperior" DECIMAL(6,2) NOT NULL,
    "margemLateral" DECIMAL(6,2) NOT NULL,
    "distVertical" DECIMAL(6,2) NOT NULL,
    "distHorizontal" DECIMAL(6,2) NOT NULL,
    "mostrarNome" BOOLEAN NOT NULL DEFAULT true,
    "mostrarPreco" BOOLEAN NOT NULL DEFAULT true,
    "mostrarCodigo" BOOLEAN NOT NULL DEFAULT true,
    "mostrarBarras" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ModeloEtiqueta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Unidade_sigla_key" ON "Unidade"("sigla");

-- CreateIndex
CREATE UNIQUE INDEX "TipoValor_nome_key" ON "TipoValor"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoValor_produtoId_tipoValorId_key" ON "ProdutoValor"("produtoId", "tipoValorId");

-- CreateIndex
CREATE INDEX "ProdutoComponente_produtoId_idx" ON "ProdutoComponente"("produtoId");

-- CreateIndex
CREATE INDEX "ProdutoVariacao_produtoId_idx" ON "ProdutoVariacao"("produtoId");

-- CreateIndex
CREATE INDEX "ItemFornecedor_produtoId_idx" ON "ItemFornecedor"("produtoId");

-- CreateIndex
CREATE INDEX "ItemFornecedor_servicoId_idx" ON "ItemFornecedor"("servicoId");

-- CreateIndex
CREATE INDEX "ItemFornecedor_fornecedorId_idx" ON "ItemFornecedor"("fornecedorId");

-- CreateIndex
CREATE INDEX "HistoricoValor_produtoId_createdAt_idx" ON "HistoricoValor"("produtoId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Grade_nome_key" ON "Grade"("nome");

-- AddForeignKey
ALTER TABLE "GrupoProduto" ADD CONSTRAINT "GrupoProduto_paiId_fkey" FOREIGN KEY ("paiId") REFERENCES "GrupoProduto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoValor" ADD CONSTRAINT "ProdutoValor_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoValor" ADD CONSTRAINT "ProdutoValor_tipoValorId_fkey" FOREIGN KEY ("tipoValorId") REFERENCES "TipoValor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoComponente" ADD CONSTRAINT "ProdutoComponente_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoComponente" ADD CONSTRAINT "ProdutoComponente_componenteId_fkey" FOREIGN KEY ("componenteId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoVariacao" ADD CONSTRAINT "ProdutoVariacao_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemFornecedor" ADD CONSTRAINT "ItemFornecedor_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemFornecedor" ADD CONSTRAINT "ItemFornecedor_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "Servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemFornecedor" ADD CONSTRAINT "ItemFornecedor_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoValor" ADD CONSTRAINT "HistoricoValor_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Dados iniciais do módulo Itens (como no Gestão Click)
INSERT INTO "Unidade" ("id", "nome", "sigla", "padrao") VALUES
  ('un_un', 'Unidade', 'UN', true), ('un_cx', 'Caixa', 'CX', false), ('un_mt', 'Metro', 'MT', false), ('un_m2', 'Metro Quadrado', 'M2', false),
  ('un_kg', 'Quilograma', 'KG', false), ('un_lt', 'Litro', 'LT', false), ('un_pct', 'Pacote', 'PCT', false), ('un_pc', 'Peça', 'PC', false), ('un_rl', 'Rolo', 'RL', false)
ON CONFLICT DO NOTHING;
INSERT INTO "Unidade" ("id", "nome", "sigla")
SELECT 'un_' || md5(u), u, u FROM (SELECT DISTINCT "unidade" AS u FROM "Produto") x ON CONFLICT DO NOTHING;

INSERT INTO "TipoValor" ("id", "nome", "lucro", "padrao", "lojas") VALUES ('tv_varejo', 'Varejo', 50, true, ARRAY(SELECT "id" FROM "Empresa"));
INSERT INTO "ProdutoValor" ("id", "produtoId", "tipoValorId", "lucroUtilizado", "valor")
SELECT 'pv_' || "id", "id", 'tv_varejo',
  CASE WHEN "custo" > 0 THEN LEAST(9999999999, round((("precoVenda" - "custo") / "custo") * 100, 4)) ELSE 0 END, "precoVenda"
FROM "Produto";

UPDATE "Produto" SET "lojas" = ARRAY(SELECT "id" FROM "Empresa");
UPDATE "Servico" SET "lojas" = ARRAY(SELECT "id" FROM "Empresa");

INSERT INTO "CampoExtra" ("id", "entidade", "nome", "tipo", "opcoes", "ordem") VALUES
  ('ce_prod_bateria', 'PRODUTO', 'BATERIA', 'TEXTO', '{}', 0), ('ce_prod_local', 'PRODUTO', 'LOCALIZACAO', 'TEXTO', '{}', 1),
  ('ce_prod_marca', 'PRODUTO', 'MARCA', 'TEXTO', '{}', 2), ('ce_prod_modelo', 'PRODUTO', 'MODELO', 'TEXTO', '{}', 3)
ON CONFLICT DO NOTHING;

INSERT INTO "Grade" ("id", "nome", "variacoes") VALUES
  ('gr_cor', 'Cor', '{Preto,Branco}'), ('gr_tamanho', 'Tamanho', '{P,M,G}'), ('gr_genero', 'Gênero', '{Masculino,Feminino}')
ON CONFLICT DO NOTHING;

INSERT INTO "ModeloEtiqueta" ("id", "nome", "padrao", "altura", "largura", "pagina", "colunas", "linhas", "margemSuperior", "margemLateral", "distVertical", "distHorizontal")
VALUES ('et_pimaco6180', 'PIMACO 6180', 'PIMACO 6180', 2.54, 6.67, 'Carta', 3, 10, 1.27, 0.48, 0, 0.31);
