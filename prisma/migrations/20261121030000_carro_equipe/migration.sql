-- O estoque móvel passa a ser do carro da equipe (sempre os mesmos técnicos), não de cada técnico.
ALTER TABLE "Deposito" ADD COLUMN "equipeId" TEXT;

-- migra os estoques por técnico que existirem: usa uma equipe ativa (sem carro) de que ele é membro;
-- se não houver, cria a equipe com o nome do técnico
DO $$
DECLARE d RECORD; eq TEXT; nome_eq TEXT;
BEGIN
  FOR d IN SELECT dp.id, dp."tecnicoId", u.nome FROM "Deposito" dp JOIN "Usuario" u ON u.id = dp."tecnicoId" WHERE dp."tecnicoId" IS NOT NULL LOOP
    SELECT e.id INTO eq FROM "Equipe" e
     WHERE e.ativo AND d."tecnicoId" = ANY(e.membros) AND NOT EXISTS (SELECT 1 FROM "Deposito" x WHERE x."equipeId" = e.id)
     ORDER BY e.nome LIMIT 1;
    IF eq IS NULL THEN
      nome_eq := 'Carro ' || d.nome;
      WHILE EXISTS (SELECT 1 FROM "Equipe" WHERE nome = nome_eq) LOOP nome_eq := nome_eq || ' 2'; END LOOP;
      eq := 'eq_' || d.id;
      INSERT INTO "Equipe" (id, nome, ativo, membros, "createdAt") VALUES (eq, nome_eq, true, ARRAY[d."tecnicoId"], now());
    END IF;
    UPDATE "Deposito" SET "equipeId" = eq WHERE id = d.id;
    eq := NULL;
  END LOOP;
END $$;

ALTER TABLE "Deposito" DROP CONSTRAINT "Deposito_tecnicoId_fkey";
DROP INDEX "Deposito_tecnicoId_key";
ALTER TABLE "Deposito" DROP COLUMN "tecnicoId";
CREATE UNIQUE INDEX "Deposito_equipeId_key" ON "Deposito"("equipeId");
ALTER TABLE "Deposito" ADD CONSTRAINT "Deposito_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;
