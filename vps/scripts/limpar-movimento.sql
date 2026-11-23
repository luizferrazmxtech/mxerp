-- Começar do zero com os dados do Gestão Click, mantendo o que foi configurado e integrado no MXERP.
-- FICA: empresas e certificado A1, usuários e permissões, cadastros (atualizados pela importação),
--       notas fiscais emitidas e a numeração delas, situações, campos extras, mensagens, plano de contas,
--       formas de pagamento, centros de custo, contas bancárias, regras e favorecidos da conciliação,
--       contratos, chamados, mensagens do WhatsApp, as integrações (Inter, MXChat, Mercado Livre, frete,
--       PagSeguro, contador, Open Finance), o extrato do banco (volta a ficar para conciliar) e as contas
--       com boleto registrado ainda em aberto (para o Inter não cancelar o boleto).
-- SAI: OS, vendas, devoluções, orçamentos, compras, todo o financeiro (o fluxo de caixa zera), estoque
--      (saldos, reservas, movimentos, ajustes, transferências, inventários), cotações e caixas do PDV.
-- Rodado por ./vps/mxerp.sh limpar-movimento CLIENTE [SERIE] (que faz o backup antes). Tudo numa transação.
\set ON_ERROR_STOP on
BEGIN;

-- contas a receber com boleto registrado e ainda não pago: ficam (apagar faria o Inter cancelar o boleto)
CREATE TEMP TABLE contas_ficam ON COMMIT DROP AS
  SELECT l.id FROM "Lancamento" l
   WHERE l."pagoEm" IS NULL
     AND EXISTS (SELECT 1 FROM "Boleto" b WHERE b."lancamentoId" = l.id AND b.situacao IN ('EMITINDO', 'EM_PROCESSAMENTO', 'A_RECEBER', 'ATRASADO', 'PROTESTO'));
CREATE TEMP TABLE vendas_ficam ON COMMIT DROP AS
  SELECT DISTINCT l."origemId" AS id FROM "Lancamento" l JOIN contas_ficam f ON f.id = l.id WHERE l."origemTipo" = 'VENDA'
  UNION SELECT "vendaId" FROM "ContratoCobranca" WHERE "vendaId" IS NOT NULL;

SELECT 'OS (saem)' AS o, count(*) FROM "OrdemServico"
UNION ALL SELECT 'vendas (saem)', count(*) FROM "Venda" WHERE id NOT IN (SELECT id FROM vendas_ficam)
UNION ALL SELECT 'vendas dos contratos e de boletos em aberto (ficam)', count(*) FROM vendas_ficam
UNION ALL SELECT 'orçamentos (saem)', count(*) FROM "Orcamento"
UNION ALL SELECT 'compras (saem)', count(*) FROM "Compra"
UNION ALL SELECT 'contas a pagar e receber (saem)', count(*) FROM "Lancamento" WHERE id NOT IN (SELECT id FROM contas_ficam)
UNION ALL SELECT 'contas com boleto em aberto (ficam)', count(*) FROM contas_ficam
UNION ALL SELECT 'linhas do extrato (ficam, para conciliar de novo)', count(*) FROM "TransacaoBancaria"
UNION ALL SELECT 'movimentos de estoque (saem)', count(*) FROM "MovimentoEstoque"
UNION ALL SELECT 'notas fiscais', count(*) FROM "NotaFiscal";

-- anexos dos documentos que saem
DELETE FROM "Anexo" WHERE entidade IN ('OS', 'OS_FOTO', 'ORCAMENTO', 'COMPRA', 'COTACAO', 'AJUSTE', 'TRANSFERENCIA');
DELETE FROM "Anexo" WHERE entidade = 'VENDA' AND "entidadeId" NOT IN (SELECT id FROM vendas_ficam);

-- financeiro: sai tudo (menos os boletos em aberto); o extrato volta para conciliar com as contas do Gestão Click
UPDATE "Lancamento" SET "transacaoId" = NULL WHERE "transacaoId" IS NOT NULL;
DELETE FROM "Lancamento" WHERE id NOT IN (SELECT id FROM contas_ficam);
UPDATE "TransacaoBancaria" SET situacao = 'PENDENTE' WHERE situacao = 'CONCILIADA';

TRUNCATE "ValeCompra", "DevolucaoItem", "Devolucao", "MovimentoCaixa",
  "OsItemProduto", "OsItemServico", "OsHistorico", "OsEquipamento", "OsParcela", "OsTrabalho",
  "OrcamentoItem", "OrcamentoServico", "OrcamentoParcela", "OrcamentoHistorico", "Orcamento",
  "CompraItem", "CompraItemServico", "CompraParcela", "CompraHistorico", "Compra",
  "CotacaoResposta", "CotacaoItem", "CotacaoFornecedor", "Cotacao",
  "AjusteEstoqueItem", "AjusteEstoque", "TransferenciaEstoqueItem", "TransferenciaEstoque", "InventarioItem", "Inventario",
  "Reserva", "MovimentoEstoque", "Saldo";
-- os chamados apontam para a OS e os contratos para a venda: por isso DELETE e não TRUNCATE
DELETE FROM "OrdemServico";
DELETE FROM "Venda" WHERE id NOT IN (SELECT id FROM vendas_ficam);
UPDATE "Venda" SET "caixaId" = NULL WHERE "caixaId" IS NOT NULL;
DELETE FROM "CaixaPdv";

-- notas de teste (./vps/mxerp.sh limpar-movimento CLIENTE SERIE): saem as notas e a numeração da série
\if :{?serie_teste}
SELECT 'notas da série ' || :'serie_teste' || ' (saem)' AS o, count(*) FROM "NotaFiscal" WHERE serie = :'serie_teste'::int;
DELETE FROM "NotaFiscal" WHERE serie = :'serie_teste'::int;
DELETE FROM "Sequencia" WHERE chave ~ ('^(NF-[0-9]+-(55|65)|DPS-[0-9]+)-' || :'serie_teste' || '-[PH]$');
\endif

-- a numeração de OS, vendas, orçamentos e compras volta a seguir a do Gestão Click (a das notas fica)
DELETE FROM "Sequencia" WHERE chave IN ('OS', 'VENDA', 'ORCAMENTO', 'COMPRA', 'AJUSTE', 'TRANSFERENCIA', 'INVENTARIO', 'COTACAO', 'DEVOLUCAO');
-- contas importadas não viram boleto; só as lançadas daqui para frente
UPDATE "IntegracaoInter" SET "boletosDesde" = now();
COMMIT;
