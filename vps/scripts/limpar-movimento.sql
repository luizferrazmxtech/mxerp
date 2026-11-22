-- Começar do zero com os dados do Gestão Click, mantendo o que foi configurado e integrado no MXERP.
-- FICA: empresas e certificado A1, usuários e permissões, cadastros (atualizados pela importação),
--       notas fiscais emitidas e a numeração delas, situações, campos extras, mensagens, plano de contas,
--       formas de pagamento, centros de custo, contas bancárias, regras e favorecidos da conciliação,
--       contratos (com as vendas e contas que geraram), chamados, mensagens do WhatsApp, as integrações
--       (Inter, MXChat, Mercado Livre, frete, PagSeguro, contador, Open Finance), o extrato do banco com as
--       contas já conciliadas nele e as contas com boleto emitido.
-- SAI: OS, vendas, devoluções, orçamentos, compras, as demais contas a pagar/receber, estoque (saldos,
--      reservas, movimentos, ajustes, transferências, inventários), cotações e caixas do PDV.
-- Rodado por ./vps/mxerp.sh limpar-movimento CLIENTE (que faz o backup antes). Tudo numa transação.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE vendas_contrato ON COMMIT DROP AS
  SELECT "vendaId" AS id FROM "ContratoCobranca" WHERE "vendaId" IS NOT NULL;
CREATE TEMP TABLE contas_ficam ON COMMIT DROP AS
  SELECT l.id FROM "Lancamento" l
   WHERE l."transacaoId" IS NOT NULL
      OR l."idLegado" LIKE 'extrato:%'
      OR EXISTS (SELECT 1 FROM "Boleto" b WHERE b."lancamentoId" = l.id)
      OR (l."origemTipo" = 'VENDA' AND l."origemId" IN (SELECT id FROM vendas_contrato));

SELECT 'OS (saem)' AS o, count(*) FROM "OrdemServico"
UNION ALL SELECT 'vendas (saem)', count(*) FROM "Venda" WHERE id NOT IN (SELECT id FROM vendas_contrato)
UNION ALL SELECT 'vendas dos contratos (ficam)', count(*) FROM vendas_contrato
UNION ALL SELECT 'orçamentos (saem)', count(*) FROM "Orcamento"
UNION ALL SELECT 'compras (saem)', count(*) FROM "Compra"
UNION ALL SELECT 'contas (saem)', count(*) FROM "Lancamento" WHERE id NOT IN (SELECT id FROM contas_ficam)
UNION ALL SELECT 'contas conciliadas ou com boleto (ficam)', count(*) FROM contas_ficam
UNION ALL SELECT 'linhas do extrato (ficam)', count(*) FROM "TransacaoBancaria"
UNION ALL SELECT 'movimentos de estoque (saem)', count(*) FROM "MovimentoEstoque"
UNION ALL SELECT 'notas fiscais (ficam)', count(*) FROM "NotaFiscal";

-- anexos dos documentos que saem
DELETE FROM "Anexo" WHERE entidade IN ('OS', 'OS_FOTO', 'ORCAMENTO', 'COMPRA', 'COTACAO', 'AJUSTE', 'TRANSFERENCIA');
DELETE FROM "Anexo" WHERE entidade = 'VENDA' AND "entidadeId" NOT IN (SELECT id FROM vendas_contrato);

DELETE FROM "Lancamento" WHERE id NOT IN (SELECT id FROM contas_ficam);

TRUNCATE "ValeCompra", "DevolucaoItem", "Devolucao", "MovimentoCaixa",
  "OsItemProduto", "OsItemServico", "OsHistorico", "OsEquipamento", "OsParcela", "OsTrabalho",
  "OrcamentoItem", "OrcamentoServico", "OrcamentoParcela", "OrcamentoHistorico", "Orcamento",
  "CompraItem", "CompraItemServico", "CompraParcela", "CompraHistorico", "Compra",
  "CotacaoResposta", "CotacaoItem", "CotacaoFornecedor", "Cotacao",
  "AjusteEstoqueItem", "AjusteEstoque", "TransferenciaEstoqueItem", "TransferenciaEstoque", "InventarioItem", "Inventario",
  "Reserva", "MovimentoEstoque", "Saldo";
-- os chamados apontam para a OS e os contratos para a venda: por isso DELETE e não TRUNCATE
DELETE FROM "OrdemServico";
DELETE FROM "Venda" WHERE id NOT IN (SELECT id FROM vendas_contrato);
UPDATE "Venda" SET "caixaId" = NULL WHERE "caixaId" IS NOT NULL;
DELETE FROM "CaixaPdv";

-- a numeração de OS, vendas, orçamentos e compras volta a seguir a do Gestão Click (a das notas fica)
DELETE FROM "Sequencia" WHERE chave IN ('OS', 'VENDA', 'ORCAMENTO', 'COMPRA', 'AJUSTE', 'TRANSFERENCIA', 'INVENTARIO', 'COTACAO', 'DEVOLUCAO');
-- contas importadas não viram boleto; só as lançadas daqui para frente
UPDATE "IntegracaoInter" SET "boletosDesde" = now();
COMMIT;
