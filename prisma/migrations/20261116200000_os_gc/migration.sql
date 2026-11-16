-- AlterTable
ALTER TABLE "OrdemServico" ADD COLUMN     "camposExtras" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "centroCusto" TEXT,
ADD COLUMN     "condicao" TEXT NOT NULL DEFAULT 'AVISTA',
ADD COLUMN     "criadoPorId" TEXT,
ADD COLUMN     "descontoPercentual" DECIMAL(7,4),
ADD COLUMN     "enderecoEntregaId" TEXT,
ADD COLUMN     "exibirTotal" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "formaPagamentoId" TEXT,
ADD COLUMN     "intervaloDias" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "mostrarEntrega" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "situacaoId" TEXT,
ADD COLUMN     "tecnicoIds" TEXT[],
ADD COLUMN     "token" TEXT,
ADD COLUMN     "transportadoraId" TEXT;

-- AlterTable
ALTER TABLE "OsHistorico" ADD COLUMN     "situacao" TEXT,
ADD COLUMN     "usuarioNome" TEXT;

-- AlterTable
ALTER TABLE "OsItemProduto" ADD COLUMN     "detalhes" TEXT,
ADD COLUMN     "ordem" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tipoValorId" TEXT;

-- AlterTable
ALTER TABLE "OsItemServico" ADD COLUMN     "detalhes" TEXT,
ADD COLUMN     "ordem" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SituacaoOsConfig" (
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
    "notaServico" "NotaSituacao" NOT NULL DEFAULT 'NAO',
    "enviarMensagem" BOOLEAN NOT NULL DEFAULT false,
    "modeloMensagemId" TEXT,
    "gerarAssinatura" BOOLEAN NOT NULL DEFAULT false,
    "preencherSaida" BOOLEAN NOT NULL DEFAULT false,
    "bloqueados" "PapelUsuario"[],

    CONSTRAINT "SituacaoOsConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OsParcela" (
    "id" TEXT NOT NULL,
    "osId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "vencimento" DATE NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "formaPagamentoId" TEXT,
    "observacao" TEXT,

    CONSTRAINT "OsParcela_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SituacaoOsConfig_nome_key" ON "SituacaoOsConfig"("nome");

-- CreateIndex
CREATE INDEX "OsParcela_osId_idx" ON "OsParcela"("osId");

UPDATE "OrdemServico" SET "token" = md5(random()::text || id);
ALTER TABLE "OrdemServico" ALTER COLUMN "token" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "OrdemServico_token_key" ON "OrdemServico"("token");

-- AddForeignKey
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_situacaoId_fkey" FOREIGN KEY ("situacaoId") REFERENCES "SituacaoOsConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_transportadoraId_fkey" FOREIGN KEY ("transportadoraId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_formaPagamentoId_fkey" FOREIGN KEY ("formaPagamentoId") REFERENCES "FormaPagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OsParcela" ADD CONSTRAINT "OsParcela_osId_fkey" FOREIGN KEY ("osId") REFERENCES "OrdemServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OsParcela" ADD CONSTRAINT "OsParcela_formaPagamentoId_fkey" FOREIGN KEY ("formaPagamentoId") REFERENCES "FormaPagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Situações do Gestão Click (MXERP: "Em aberto" e "Em andamento" reservam as peças)
INSERT INTO "SituacaoOsConfig" (id, nome, cor, ordem, padrao, "permiteEdicao", exibir, estoque, financeiro, "preencherSaida", bloqueados) VALUES
  ('so_aberto', 'Em aberto', 'cinza', 0, true, true, true, 'RESERVAR', false, false, '{}'),
  ('so_andamento', 'Em andamento', 'amarelo', 1, false, true, true, 'RESERVAR', false, false, '{}'),
  ('so_concretizada', 'Concretizada', 'verde', 2, false, true, true, 'LANCAR', true, true, '{}'),
  ('so_cancelada', 'Cancelada', 'vermelho', 3, false, true, false, 'NAO', false, false, '{}'),
  ('so_teste', 'TESTE', 'marrom', 4, false, true, true, 'LANCAR', false, false, '{}'),
  ('so_condenado', 'Condenado', 'preto', 5, false, true, true, 'NAO', false, false, '{}'),
  ('so_faturar', 'CONCLUIDA - FATURAR', 'purpura', 6, false, false, true, 'LANCAR', false, true, '{}'),
  ('so_devolvido', 'DEVOLVIDO S/ REPARO', 'roxo', 7, false, true, true, 'NAO', false, false, '{}')
ON CONFLICT DO NOTHING;

INSERT INTO "ModeloMensagem" (id, tipo, assunto, email, padrao)
VALUES ('mm_os', 'OS', 'Ordem de serviço [numero]', 'Olá [nome_cliente],

Segue a ordem de serviço nº [numero], no valor de [valor_total].

Acompanhe pelo link: [link]

Atenciosamente,
[nome_empresa]', true)
ON CONFLICT DO NOTHING;

UPDATE "OrdemServico" SET "situacaoId" = CASE situacao
  WHEN 'ABERTA' THEN 'so_aberto'
  WHEN 'CONCLUIDA' THEN 'so_faturar'
  WHEN 'FATURADA' THEN 'so_concretizada'
  WHEN 'CANCELADA' THEN 'so_cancelada'
  WHEN 'DEVOLVIDA_SEM_REPARO' THEN 'so_devolvido'
  ELSE 'so_andamento' END;
UPDATE "OrdemServico" SET "tecnicoIds" = ARRAY["tecnicoId"] WHERE "tecnicoId" IS NOT NULL;
UPDATE "OrdemServico" SET "tecnicoIds" = '{}' WHERE "tecnicoIds" IS NULL;
