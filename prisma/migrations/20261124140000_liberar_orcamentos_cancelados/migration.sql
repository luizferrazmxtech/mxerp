-- Vendas e OS canceladas antes desta versão mantinham o vínculo com o orçamento de origem
-- (o orçamento continuava com "Ver venda nº X" e não podia gerar venda/OS de novo).
-- Só desfaz o vínculo (a situação do orçamento fica como está, para não mexer no histórico antigo);
-- daqui em diante, cancelar a venda/OS também devolve o orçamento concretizado para "Em aberto".

CREATE TEMP TABLE _lib AS
SELECT o.id, o.numero, 'Venda nº ' || v.numero || ' cancelada' AS motivo, 'venda' AS doc
  FROM "Orcamento" o JOIN "Venda" v ON v.id = o."vendaId"
 WHERE v.situacao = 'CANCELADA'
UNION ALL
SELECT o.id, o.numero, 'OS nº ' || os.numero || ' cancelada', 'os'
  FROM "Orcamento" o JOIN "OrdemServico" os ON os.id = o."osId"
 WHERE os.situacao = 'CANCELADA';

-- vínculo apontando para venda/OS que nem existe mais
UPDATE "Orcamento" SET "vendaId" = NULL WHERE "vendaId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Venda" v WHERE v.id = "Orcamento"."vendaId");
UPDATE "Orcamento" SET "osId" = NULL WHERE "osId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "OrdemServico" x WHERE x.id = "Orcamento"."osId");

UPDATE "Orcamento" o SET "vendaId" = NULL FROM _lib l WHERE l.id = o.id AND l.doc = 'venda';
UPDATE "Orcamento" o SET "osId" = NULL FROM _lib l WHERE l.id = o.id AND l.doc = 'os';

INSERT INTO "OrcamentoHistorico" (id, "orcamentoId", descricao, situacao, "usuarioNome", "createdAt")
SELECT 'lib' || md5(random()::text || l.id || l.doc), l.id,
       l.motivo || ': vínculo desfeito na atualização do sistema. Pode gerar venda ou OS de novo.',
       (SELECT s.nome FROM "SituacaoOrcamento" s JOIN "Orcamento" o ON o."situacaoId" = s.id WHERE o.id = l.id), 'Sistema', now()
  FROM _lib l;

DROP TABLE _lib;
