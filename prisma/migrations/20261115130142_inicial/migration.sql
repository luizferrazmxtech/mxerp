-- CreateEnum
CREATE TYPE "RegimeTributario" AS ENUM ('SIMPLES_NACIONAL', 'SIMPLES_EXCESSO_SUBLIMITE', 'REGIME_NORMAL', 'MEI');

-- CreateEnum
CREATE TYPE "AmbienteFiscal" AS ENUM ('PRODUCAO', 'HOMOLOGACAO');

-- CreateEnum
CREATE TYPE "PapelUsuario" AS ENUM ('ADMIN', 'GERENTE', 'OPERADOR', 'TECNICO', 'CAIXA');

-- CreateEnum
CREATE TYPE "TipoPessoa" AS ENUM ('FISICA', 'JURIDICA');

-- CreateEnum
CREATE TYPE "ContribuinteIcms" AS ENUM ('CONTRIBUINTE', 'ISENTO', 'NAO_CONTRIBUINTE');

-- CreateEnum
CREATE TYPE "OrigemDocumento" AS ENUM ('OS', 'VENDA', 'COMPRA', 'AJUSTE', 'TRANSFERENCIA', 'DEVOLUCAO', 'IMPLANTACAO');

-- CreateEnum
CREATE TYPE "StatusReserva" AS ENUM ('ATIVA', 'BAIXADA', 'LIBERADA');

-- CreateEnum
CREATE TYPE "TipoMovimento" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "SituacaoOs" AS ENUM ('ABERTA', 'EM_ANDAMENTO', 'AGUARDANDO_PECA', 'AGUARDANDO_APROVACAO', 'CONCLUIDA', 'FATURADA', 'CANCELADA', 'DEVOLVIDA_SEM_REPARO');

-- CreateEnum
CREATE TYPE "TipoVenda" AS ENUM ('PEDIDO', 'BALCAO');

-- CreateEnum
CREATE TYPE "SituacaoVenda" AS ENUM ('ORCAMENTO', 'ABERTA', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "GrupoDre" AS ENUM ('RECEITA_BRUTA', 'DEDUCOES', 'CUSTO', 'DESPESA_OPERACIONAL', 'DESPESA_FINANCEIRA', 'RECEITA_FINANCEIRA', 'OUTRAS_RECEITAS', 'OUTRAS_DESPESAS', 'NAO_OPERACIONAL');

-- CreateEnum
CREATE TYPE "TipoLancamento" AS ENUM ('RECEBER', 'PAGAR');

-- CreateEnum
CREATE TYPE "ModeloNota" AS ENUM ('NFE', 'NFCE', 'NFSE');

-- CreateEnum
CREATE TYPE "StatusNota" AS ENUM ('RASCUNHO', 'ASSINADA', 'ENVIADA', 'AUTORIZADA', 'REJEITADA', 'DENEGADA', 'CANCELADA', 'INUTILIZADA');

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpj" TEXT NOT NULL,
    "inscricaoEstadual" TEXT,
    "inscricaoMunicipal" TEXT,
    "regimeTributario" "RegimeTributario" NOT NULL DEFAULT 'SIMPLES_NACIONAL',
    "logradouro" TEXT,
    "numero" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "codigoMunicipio" TEXT,
    "uf" CHAR(2),
    "cep" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "ambienteFiscal" "AmbienteFiscal" NOT NULL DEFAULT 'HOMOLOGACAO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" "PapelUsuario" NOT NULL DEFAULT 'OPERADOR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "tecnico" BOOLEAN NOT NULL DEFAULT false,
    "vendedor" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pessoa" (
    "id" TEXT NOT NULL,
    "tipoPessoa" "TipoPessoa" NOT NULL DEFAULT 'JURIDICA',
    "nome" TEXT NOT NULL,
    "fantasia" TEXT,
    "documento" TEXT,
    "inscricaoEstadual" TEXT,
    "contribuinteIcms" "ContribuinteIcms" NOT NULL DEFAULT 'NAO_CONTRIBUINTE',
    "email" TEXT,
    "telefone" TEXT,
    "celular" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "codigoMunicipio" TEXT,
    "uf" CHAR(2),
    "cep" TEXT,
    "cliente" BOOLEAN NOT NULL DEFAULT true,
    "fornecedor" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "idLegado" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pessoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrupoProduto" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "GrupoProduto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produto" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "gtin" TEXT,
    "nome" TEXT NOT NULL,
    "unidade" TEXT NOT NULL DEFAULT 'UN',
    "grupoId" TEXT,
    "precoVenda" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "custo" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "controlaEstoque" BOOLEAN NOT NULL DEFAULT true,
    "estoqueMinimo" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "localPadraoId" TEXT,
    "ncm" TEXT,
    "cest" TEXT,
    "origem" INTEGER NOT NULL DEFAULT 0,
    "cfopInterno" TEXT,
    "cfopExterno" TEXT,
    "csosn" TEXT,
    "cstIcms" TEXT,
    "aliquotaIcms" DECIMAL(7,4),
    "cstPis" TEXT,
    "cstCofins" TEXT,
    "cClassTrib" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "idLegado" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Servico" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "preco" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "codigoTributacaoNacional" TEXT,
    "codigoNbs" TEXT,
    "aliquotaIss" DECIMAL(7,4),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "idLegado" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposito" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Deposito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Local" (
    "id" TEXT NOT NULL,
    "depositoId" TEXT NOT NULL,
    "corredor" TEXT,
    "prateleira" TEXT,
    "nivel" TEXT,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Local_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Saldo" (
    "produtoId" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "quantidade" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Saldo_pkey" PRIMARY KEY ("produtoId","localId")
);

-- CreateTable
CREATE TABLE "Reserva" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "localId" TEXT,
    "quantidade" DECIMAL(14,4) NOT NULL,
    "origemTipo" "OrigemDocumento" NOT NULL,
    "origemId" TEXT NOT NULL,
    "origemItemId" TEXT NOT NULL,
    "status" "StatusReserva" NOT NULL DEFAULT 'ATIVA',
    "separado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoEstoque" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "tipo" "TipoMovimento" NOT NULL,
    "quantidade" DECIMAL(14,4) NOT NULL,
    "custoUnit" DECIMAL(14,4),
    "origemTipo" "OrigemDocumento" NOT NULL,
    "origemId" TEXT,
    "observacao" TEXT,
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentoEstoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdemServico" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tecnicoId" TEXT,
    "vendedorId" TEXT,
    "situacao" "SituacaoOs" NOT NULL DEFAULT 'ABERTA',
    "entrada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previsao" TIMESTAMP(3),
    "saida" TIMESTAMP(3),
    "equipamento" TEXT,
    "marca" TEXT,
    "modelo" TEXT,
    "numeroSerie" TEXT,
    "defeito" TEXT,
    "laudo" TEXT,
    "observacoes" TEXT,
    "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalProdutos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalServicos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "idLegado" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdemServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OsItemProduto" (
    "id" TEXT NOT NULL,
    "osId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" DECIMAL(14,4) NOT NULL,
    "valorUnit" DECIMAL(14,2) NOT NULL,
    "custoUnit" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OsItemProduto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OsItemServico" (
    "id" TEXT NOT NULL,
    "osId" TEXT NOT NULL,
    "servicoId" TEXT NOT NULL,
    "quantidade" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "valorUnit" DECIMAL(14,2) NOT NULL,
    "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OsItemServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OsHistorico" (
    "id" TEXT NOT NULL,
    "osId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OsHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venda" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "tipo" "TipoVenda" NOT NULL DEFAULT 'PEDIDO',
    "clienteId" TEXT,
    "vendedorId" TEXT,
    "situacao" "SituacaoVenda" NOT NULL DEFAULT 'ABERTA',
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "frete" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "idLegado" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendaItem" (
    "id" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" DECIMAL(14,4) NOT NULL,
    "valorUnit" DECIMAL(14,2) NOT NULL,
    "custoUnit" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "VendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendaItemServico" (
    "id" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "servicoId" TEXT NOT NULL,
    "quantidade" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "valorUnit" DECIMAL(14,2) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "VendaItemServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendaPagamento" (
    "id" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "formaPagamentoId" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "parcelas" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "VendaPagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Compra" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recebida" BOOLEAN NOT NULL DEFAULT false,
    "chaveNfe" TEXT,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompraItem" (
    "id" TEXT NOT NULL,
    "compraId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "localId" TEXT,
    "quantidade" DECIMAL(14,4) NOT NULL,
    "custoUnit" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "CompraItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaBancaria" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "banco" TEXT,
    "agencia" TEXT,
    "conta" TEXT,
    "saldoInicial" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ContaBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormaPagamento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tPag" TEXT NOT NULL,
    "taxa" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "diasPrazo" INTEGER NOT NULL DEFAULT 0,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FormaPagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoriaFinanceira" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoLancamento" NOT NULL,
    "grupoDre" "GrupoDre" NOT NULL,
    "paiId" TEXT,

    CONSTRAINT "CategoriaFinanceira_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lancamento" (
    "id" TEXT NOT NULL,
    "tipo" "TipoLancamento" NOT NULL,
    "descricao" TEXT NOT NULL,
    "pessoaId" TEXT,
    "categoriaId" TEXT NOT NULL,
    "contaBancariaId" TEXT,
    "formaPagamentoId" TEXT,
    "valor" DECIMAL(14,2) NOT NULL,
    "vencimento" DATE NOT NULL,
    "competencia" DATE NOT NULL,
    "pagoEm" DATE,
    "valorPago" DECIMAL(14,2),
    "juros" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "parcela" INTEGER NOT NULL DEFAULT 1,
    "totalParcelas" INTEGER NOT NULL DEFAULT 1,
    "origemTipo" "OrigemDocumento",
    "origemId" TEXT,
    "idLegado" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaFiscal" (
    "id" TEXT NOT NULL,
    "modelo" "ModeloNota" NOT NULL,
    "serie" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "chave" TEXT,
    "status" "StatusNota" NOT NULL DEFAULT 'RASCUNHO',
    "ambiente" "AmbienteFiscal" NOT NULL,
    "origemTipo" "OrigemDocumento",
    "origemId" TEXT,
    "valorTotal" DECIMAL(14,2) NOT NULL,
    "xml" TEXT,
    "protocolo" TEXT,
    "motivo" TEXT,
    "emitidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotaFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaEvento" (
    "id" TEXT NOT NULL,
    "notaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "sequencia" INTEGER NOT NULL DEFAULT 1,
    "xml" TEXT,
    "protocolo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotaEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sequencia" (
    "chave" TEXT NOT NULL,
    "valor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Sequencia_pkey" PRIMARY KEY ("chave")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_cnpj_key" ON "Empresa"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Pessoa_documento_key" ON "Pessoa"("documento");

-- CreateIndex
CREATE UNIQUE INDEX "Pessoa_idLegado_key" ON "Pessoa"("idLegado");

-- CreateIndex
CREATE INDEX "Pessoa_nome_idx" ON "Pessoa"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "GrupoProduto_nome_key" ON "GrupoProduto"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Produto_codigo_key" ON "Produto"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Produto_idLegado_key" ON "Produto"("idLegado");

-- CreateIndex
CREATE INDEX "Produto_nome_idx" ON "Produto"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Servico_codigo_key" ON "Servico"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Servico_idLegado_key" ON "Servico"("idLegado");

-- CreateIndex
CREATE UNIQUE INDEX "Deposito_nome_key" ON "Deposito"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Local_codigo_key" ON "Local"("codigo");

-- CreateIndex
CREATE INDEX "Saldo_localId_idx" ON "Saldo"("localId");

-- CreateIndex
CREATE INDEX "Reserva_produtoId_status_idx" ON "Reserva"("produtoId", "status");

-- CreateIndex
CREATE INDEX "Reserva_origemTipo_origemId_idx" ON "Reserva"("origemTipo", "origemId");

-- CreateIndex
CREATE INDEX "Reserva_origemItemId_idx" ON "Reserva"("origemItemId");

-- CreateIndex
CREATE INDEX "MovimentoEstoque_produtoId_createdAt_idx" ON "MovimentoEstoque"("produtoId", "createdAt");

-- CreateIndex
CREATE INDEX "MovimentoEstoque_origemTipo_origemId_idx" ON "MovimentoEstoque"("origemTipo", "origemId");

-- CreateIndex
CREATE UNIQUE INDEX "OrdemServico_numero_key" ON "OrdemServico"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "OrdemServico_idLegado_key" ON "OrdemServico"("idLegado");

-- CreateIndex
CREATE INDEX "OrdemServico_situacao_idx" ON "OrdemServico"("situacao");

-- CreateIndex
CREATE INDEX "OrdemServico_clienteId_idx" ON "OrdemServico"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "Venda_numero_key" ON "Venda"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Venda_idLegado_key" ON "Venda"("idLegado");

-- CreateIndex
CREATE UNIQUE INDEX "Compra_numero_key" ON "Compra"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "ContaBancaria_nome_key" ON "ContaBancaria"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "FormaPagamento_nome_key" ON "FormaPagamento"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaFinanceira_nome_tipo_key" ON "CategoriaFinanceira"("nome", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "Lancamento_idLegado_key" ON "Lancamento"("idLegado");

-- CreateIndex
CREATE INDEX "Lancamento_tipo_vencimento_idx" ON "Lancamento"("tipo", "vencimento");

-- CreateIndex
CREATE INDEX "Lancamento_competencia_idx" ON "Lancamento"("competencia");

-- CreateIndex
CREATE INDEX "Lancamento_origemTipo_origemId_idx" ON "Lancamento"("origemTipo", "origemId");

-- CreateIndex
CREATE UNIQUE INDEX "NotaFiscal_chave_key" ON "NotaFiscal"("chave");

-- CreateIndex
CREATE INDEX "NotaFiscal_origemTipo_origemId_idx" ON "NotaFiscal"("origemTipo", "origemId");

-- CreateIndex
CREATE UNIQUE INDEX "NotaFiscal_modelo_serie_numero_ambiente_key" ON "NotaFiscal"("modelo", "serie", "numero", "ambiente");

-- AddForeignKey
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "GrupoProduto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_localPadraoId_fkey" FOREIGN KEY ("localPadraoId") REFERENCES "Local"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Local" ADD CONSTRAINT "Local_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "Deposito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Saldo" ADD CONSTRAINT "Saldo_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Saldo" ADD CONSTRAINT "Saldo_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoEstoque" ADD CONSTRAINT "MovimentoEstoque_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OsItemProduto" ADD CONSTRAINT "OsItemProduto_osId_fkey" FOREIGN KEY ("osId") REFERENCES "OrdemServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OsItemProduto" ADD CONSTRAINT "OsItemProduto_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OsItemServico" ADD CONSTRAINT "OsItemServico_osId_fkey" FOREIGN KEY ("osId") REFERENCES "OrdemServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OsItemServico" ADD CONSTRAINT "OsItemServico_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "Servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OsHistorico" ADD CONSTRAINT "OsHistorico_osId_fkey" FOREIGN KEY ("osId") REFERENCES "OrdemServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venda" ADD CONSTRAINT "Venda_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venda" ADD CONSTRAINT "Venda_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendaItem" ADD CONSTRAINT "VendaItem_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendaItem" ADD CONSTRAINT "VendaItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendaItemServico" ADD CONSTRAINT "VendaItemServico_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendaItemServico" ADD CONSTRAINT "VendaItemServico_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "Servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendaPagamento" ADD CONSTRAINT "VendaPagamento_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendaPagamento" ADD CONSTRAINT "VendaPagamento_formaPagamentoId_fkey" FOREIGN KEY ("formaPagamentoId") REFERENCES "FormaPagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compra" ADD CONSTRAINT "Compra_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraItem" ADD CONSTRAINT "CompraItem_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "Compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraItem" ADD CONSTRAINT "CompraItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoriaFinanceira" ADD CONSTRAINT "CategoriaFinanceira_paiId_fkey" FOREIGN KEY ("paiId") REFERENCES "CategoriaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaFinanceira"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_formaPagamentoId_fkey" FOREIGN KEY ("formaPagamentoId") REFERENCES "FormaPagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaEvento" ADD CONSTRAINT "NotaEvento_notaId_fkey" FOREIGN KEY ("notaId") REFERENCES "NotaFiscal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
