-- CreateEnum
CREATE TYPE "EstoqueSituacao" AS ENUM ('RESERVAR', 'LANCAR', 'NAO');

-- CreateEnum
CREATE TYPE "NotaSituacao" AS ENUM ('NAO', 'GERAR', 'EMITIR');

-- CreateEnum
CREATE TYPE "TipoDevolucao" AS ENUM ('DEVOLUCAO', 'TROCA');

-- AlterEnum
ALTER TYPE "TipoVenda" ADD VALUE 'SERVICO';

-- AlterTable
ALTER TABLE "Venda" ADD COLUMN     "camposExtras" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "canal" TEXT NOT NULL DEFAULT 'Presencial',
ADD COLUMN     "centroCusto" TEXT,
ADD COLUMN     "condicao" TEXT NOT NULL DEFAULT 'AVISTA',
ADD COLUMN     "criadoPorId" TEXT,
ADD COLUMN     "descontoPercentual" DECIMAL(7,4),
ADD COLUMN     "enderecoEntregaId" TEXT,
ADD COLUMN     "formaPagamentoId" TEXT,
ADD COLUMN     "intervaloDias" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "mostrarEntrega" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "observacaoInterna" TEXT,
ADD COLUMN     "prazoEntrega" DATE,
ADD COLUMN     "situacaoId" TEXT,
ADD COLUMN     "token" TEXT,
ADD COLUMN     "totalProdutos" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalServicos" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "transportadoraId" TEXT;

-- AlterTable
ALTER TABLE "VendaItem" ADD COLUMN     "detalhes" TEXT,
ADD COLUMN     "ordem" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tipoValorId" TEXT;

-- AlterTable
ALTER TABLE "VendaItemServico" ADD COLUMN     "desconto" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "detalhes" TEXT,
ADD COLUMN     "ordem" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SituacaoVendaConfig" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT NOT NULL DEFAULT 'cinza',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "permiteEdicao" BOOLEAN NOT NULL DEFAULT true,
    "exibir" BOOLEAN NOT NULL DEFAULT true,
    "exibirCobranca" BOOLEAN NOT NULL DEFAULT true,
    "estoque" "EstoqueSituacao" NOT NULL DEFAULT 'RESERVAR',
    "financeiro" BOOLEAN NOT NULL DEFAULT false,
    "notaProduto" "NotaSituacao" NOT NULL DEFAULT 'NAO',
    "notaServico" "NotaSituacao" NOT NULL DEFAULT 'NAO',
    "enviarMensagem" BOOLEAN NOT NULL DEFAULT false,
    "modeloMensagemId" TEXT,
    "gerarAssinatura" BOOLEAN NOT NULL DEFAULT false,
    "bloqueados" "PapelUsuario"[],

    CONSTRAINT "SituacaoVendaConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanalVenda" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CanalVenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendaParcela" (
    "id" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "vencimento" DATE NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "formaPagamentoId" TEXT,
    "observacao" TEXT,

    CONSTRAINT "VendaParcela_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendaHistorico" (
    "id" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "situacao" TEXT,
    "usuarioNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendaHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Devolucao" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "tipo" "TipoDevolucao" NOT NULL,
    "vendaId" TEXT NOT NULL,
    "clienteId" TEXT,
    "total" DECIMAL(14,2) NOT NULL,
    "observacao" TEXT,
    "usuarioNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Devolucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevolucaoItem" (
    "id" TEXT NOT NULL,
    "devolucaoId" TEXT NOT NULL,
    "vendaItemId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" DECIMAL(14,4) NOT NULL,
    "valorUnit" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "DevolucaoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValeCompra" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "clienteId" TEXT,
    "devolucaoId" TEXT,
    "valor" DECIMAL(14,2) NOT NULL,
    "saldo" DECIMAL(14,2) NOT NULL,
    "validade" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValeCompra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SituacaoVendaConfig_nome_key" ON "SituacaoVendaConfig"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "CanalVenda_nome_key" ON "CanalVenda"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Devolucao_numero_key" ON "Devolucao"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "ValeCompra_codigo_key" ON "ValeCompra"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "ValeCompra_devolucaoId_key" ON "ValeCompra"("devolucaoId");

-- CreateIndex
UPDATE "Venda" SET token = md5(random()::text || id) WHERE token IS NULL;
ALTER TABLE "Venda" ALTER COLUMN "token" SET NOT NULL;

CREATE UNIQUE INDEX "Venda_token_key" ON "Venda"("token");

-- AddForeignKey
ALTER TABLE "Venda" ADD CONSTRAINT "Venda_situacaoId_fkey" FOREIGN KEY ("situacaoId") REFERENCES "SituacaoVendaConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venda" ADD CONSTRAINT "Venda_transportadoraId_fkey" FOREIGN KEY ("transportadoraId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venda" ADD CONSTRAINT "Venda_formaPagamentoId_fkey" FOREIGN KEY ("formaPagamentoId") REFERENCES "FormaPagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendaParcela" ADD CONSTRAINT "VendaParcela_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendaParcela" ADD CONSTRAINT "VendaParcela_formaPagamentoId_fkey" FOREIGN KEY ("formaPagamentoId") REFERENCES "FormaPagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendaHistorico" ADD CONSTRAINT "VendaHistorico_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Devolucao" ADD CONSTRAINT "Devolucao_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevolucaoItem" ADD CONSTRAINT "DevolucaoItem_devolucaoId_fkey" FOREIGN KEY ("devolucaoId") REFERENCES "Devolucao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValeCompra" ADD CONSTRAINT "ValeCompra_devolucaoId_fkey" FOREIGN KEY ("devolucaoId") REFERENCES "Devolucao"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Situações de venda do Gestão Click (no MXERP "Em aberto" e "Em andamento" já reservam as peças)
INSERT INTO "SituacaoVendaConfig" (id, nome, cor, ordem, padrao, "permiteEdicao", exibir, "exibirCobranca", estoque, financeiro, "notaProduto", "notaServico", "enviarMensagem", "gerarAssinatura", bloqueados) VALUES
  ('sv_aberto', 'Em aberto', 'cinza', 0, false, true, true, true, 'RESERVAR', false, 'NAO', 'NAO', false, false, '{}'),
  ('sv_andamento', 'Em andamento', 'amarelo', 1, false, true, true, true, 'RESERVAR', false, 'NAO', 'NAO', false, false, '{}'),
  ('sv_concretizada', 'Concretizada', 'verde', 2, true, true, true, true, 'LANCAR', true, 'NAO', 'NAO', false, false, '{}'),
  ('sv_cancelada', 'Cancelada', 'vermelho', 3, false, true, false, true, 'NAO', false, 'NAO', 'NAO', false, false, '{}'),
  ('sv_rma', 'RMA/TROCA', 'roxo', 4, false, true, true, true, 'LANCAR', false, 'NAO', 'NAO', false, false, '{}'),
  ('sv_carteira', 'CARTEIRA', 'laranja', 5, false, true, true, true, 'LANCAR', false, 'NAO', 'NAO', false, false, '{}');

INSERT INTO "CanalVenda" (id, nome, padrao, ordem) VALUES ('cv_presencial', 'Presencial', true, 0), ('cv_telemarketing', 'Telemarketing', false, 1), ('cv_internet', 'Internet', false, 2);

INSERT INTO "ModeloMensagem" (id, tipo, assunto, padrao, email, sms) VALUES ('mm_venda', 'VE', 'Pedido de venda', true,
  'Olá [nome_cliente],

Segue o pedido de venda nº [numero], no valor de [valor_total].

Para ver o pedido e pagar: [link]

Obrigado pela preferência,
[nome_empresa]', 'Pedido [numero] de [valor_total]: [link]');

-- vendas existentes ganham a situação configurável e os totais
UPDATE "Venda" SET "situacaoId" = CASE situacao WHEN 'CONCLUIDA' THEN 'sv_concretizada' WHEN 'CANCELADA' THEN 'sv_cancelada' ELSE 'sv_aberto' END;
UPDATE "Venda" v SET "totalProdutos" = COALESCE((SELECT SUM(subtotal) FROM "VendaItem" i WHERE i."vendaId" = v.id), 0),
  "totalServicos" = COALESCE((SELECT SUM(subtotal) FROM "VendaItemServico" s WHERE s."vendaId" = v.id), 0);
