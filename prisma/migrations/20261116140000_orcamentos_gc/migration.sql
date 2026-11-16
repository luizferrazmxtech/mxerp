-- CreateEnum
CREATE TYPE "TipoOrcamento" AS ENUM ('PRODUTO', 'SERVICO');

-- CreateTable
CREATE TABLE "SituacaoOrcamento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT NOT NULL DEFAULT 'cinza',
    "exibir" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "geraVenda" BOOLEAN NOT NULL DEFAULT false,
    "enviarMensagem" BOOLEAN NOT NULL DEFAULT false,
    "modeloMensagemId" TEXT,
    "gerarAssinatura" BOOLEAN NOT NULL DEFAULT false,
    "bloqueados" "PapelUsuario"[],

    CONSTRAINT "SituacaoOrcamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Orcamento" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "tipo" "TipoOrcamento" NOT NULL DEFAULT 'PRODUTO',
    "clienteId" TEXT NOT NULL,
    "vendedorId" TEXT,
    "data" DATE NOT NULL,
    "validade" TEXT,
    "prazoEntrega" DATE,
    "aosCuidados" TEXT,
    "canal" TEXT NOT NULL DEFAULT 'Presencial',
    "centroCusto" TEXT,
    "introducao" TEXT,
    "situacaoId" TEXT NOT NULL,
    "transportadoraId" TEXT,
    "frete" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "mostrarEntrega" BOOLEAN NOT NULL DEFAULT false,
    "enderecoEntregaId" TEXT,
    "totalProdutos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalServicos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "descontoPercentual" DECIMAL(7,4),
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "exibirTotal" BOOLEAN NOT NULL DEFAULT true,
    "gerarCondicoes" BOOLEAN NOT NULL DEFAULT true,
    "condicao" TEXT NOT NULL DEFAULT 'AVISTA',
    "formaPagamentoId" TEXT,
    "intervaloDias" INTEGER NOT NULL DEFAULT 30,
    "observacoes" TEXT,
    "observacaoInterna" TEXT,
    "camposExtras" JSONB,
    "token" TEXT NOT NULL,
    "empresaId" TEXT,
    "vendaId" TEXT,
    "osId" TEXT,
    "criadoPorId" TEXT,
    "idLegado" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Orcamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrcamentoItem" (
    "id" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "produtoId" TEXT NOT NULL,
    "detalhes" TEXT,
    "quantidade" DECIMAL(14,4) NOT NULL,
    "tipoValorId" TEXT,
    "valorUnit" DECIMAL(14,2) NOT NULL,
    "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "OrcamentoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrcamentoServico" (
    "id" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "servicoId" TEXT NOT NULL,
    "detalhes" TEXT,
    "quantidade" DECIMAL(14,4) NOT NULL DEFAULT 1,
    "valorUnit" DECIMAL(14,2) NOT NULL,
    "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "OrcamentoServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrcamentoParcela" (
    "id" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "vencimento" DATE NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "formaPagamentoId" TEXT,
    "observacao" TEXT,

    CONSTRAINT "OrcamentoParcela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrcamentoHistorico" (
    "id" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "situacao" TEXT,
    "usuarioNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrcamentoHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anotacao" (
    "id" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Anotacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModeloMensagem" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "assunto" TEXT NOT NULL,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "email" TEXT NOT NULL,
    "sms" TEXT,

    CONSTRAINT "ModeloMensagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuracao" (
    "chave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,

    CONSTRAINT "Configuracao_pkey" PRIMARY KEY ("chave")
);

-- CreateIndex
CREATE UNIQUE INDEX "SituacaoOrcamento_nome_key" ON "SituacaoOrcamento"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Orcamento_numero_key" ON "Orcamento"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Orcamento_token_key" ON "Orcamento"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Orcamento_idLegado_key" ON "Orcamento"("idLegado");

-- CreateIndex
CREATE INDEX "Orcamento_data_idx" ON "Orcamento"("data");

-- CreateIndex
CREATE INDEX "Orcamento_clienteId_idx" ON "Orcamento"("clienteId");

-- CreateIndex
CREATE INDEX "Anotacao_entidade_entidadeId_idx" ON "Anotacao"("entidade", "entidadeId");

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_situacaoId_fkey" FOREIGN KEY ("situacaoId") REFERENCES "SituacaoOrcamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_transportadoraId_fkey" FOREIGN KEY ("transportadoraId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_formaPagamentoId_fkey" FOREIGN KEY ("formaPagamentoId") REFERENCES "FormaPagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrcamentoItem" ADD CONSTRAINT "OrcamentoItem_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrcamentoItem" ADD CONSTRAINT "OrcamentoItem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrcamentoServico" ADD CONSTRAINT "OrcamentoServico_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrcamentoServico" ADD CONSTRAINT "OrcamentoServico_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "Servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrcamentoParcela" ADD CONSTRAINT "OrcamentoParcela_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrcamentoParcela" ADD CONSTRAINT "OrcamentoParcela_formaPagamentoId_fkey" FOREIGN KEY ("formaPagamentoId") REFERENCES "FormaPagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrcamentoHistorico" ADD CONSTRAINT "OrcamentoHistorico_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Situações padrão do Gestão Click
INSERT INTO "SituacaoOrcamento" ("id", "nome", "cor", "exibir", "ordem", "geraVenda") VALUES
  ('so_aberto', 'Em aberto', 'cinza', true, 0, false),
  ('so_andamento', 'Em andamento', 'amarelo', true, 1, false),
  ('so_concretizado', 'Concretizado', 'verde', true, 2, true),
  ('so_cancelado', 'Cancelado', 'vermelho', false, 3, false)
ON CONFLICT DO NOTHING;

-- Mensagem padrão da proposta
INSERT INTO "ModeloMensagem" ("id", "tipo", "assunto", "padrao", "email", "sms") VALUES
  ('mm_proposta', 'OR', 'Proposta comercial', true,
   E'Olá [nome_cliente],\n\nSegue a proposta comercial nº [numero] no valor de [valor_total].\n\nPara ver os detalhes acesse: [link]\n\nAtenciosamente,\n[nome_empresa]',
   'Ola [nome_cliente], segue a proposta [numero] de [valor_total]: [link]')
ON CONFLICT DO NOTHING;
