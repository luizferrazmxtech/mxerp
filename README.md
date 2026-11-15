# MXERP

ERP da MXTECH: ordens de serviço, vendas/PDV, estoque com localização, financeiro/DRE e notas fiscais (NF-e, NFC-e, NFS-e) emitidas direto na SEFAZ e no padrão nacional de NFS-e.

## Diferencial: OS reserva o estoque

- Cada produto tem saldo **por local** (depósito › corredor › prateleira › nível).
- Ao adicionar um produto na OS ele é **reservado na hora** e o sistema diz **de qual prateleira pegar**.
- Se não houver estoque, a quantidade fica **em falta** e aparece na tela inicial como "comprar/repor". Quando a mercadoria entra, a falta é coberta automaticamente, na ordem das OS.
- Situações: *Concluída/Faturada* baixam o estoque das prateleiras reservadas; *Cancelada/Devolvida* liberam; reabrir uma OS concluída estorna e reserva de novo.
- Reservas são serializadas por produto no PostgreSQL (`SELECT … FOR NO KEY UPDATE`): dois técnicos nunca pegam a mesma peça.
- Lista de separação imprimível por OS, ordenada por local.

## Stack

Next.js 15 (App Router, server actions) · TypeScript · PostgreSQL 16 · Prisma · Tailwind · Vitest.

## Instalar na loja (Windows)

Passo a passo em [docs/instalar-windows.md](docs/instalar-windows.md): Docker Desktop + `windows/instalar.ps1`. Sobe banco, sistema, backup diário e busca do extrato do Inter; no primeiro acesso a tela pede para criar o administrador.

## Rodando localmente (desenvolvimento)

```bash
cp .env.example .env          # ajuste DATABASE_URL
npm install
npx prisma migrate dev        # cria as tabelas
npm run db:seed               # dados de demonstração (opcional)
npm run dev                   # http://localhost:3000
```

Testes (usam o banco `mxerp_test`):

```bash
createdb mxerp_test
npm test
```

## Estrutura

- `prisma/schema.prisma` — modelo de dados de todos os módulos.
- `src/lib/estoque/` — motor de estoque (alocação por prateleira, reservas, baixa, estorno, transferência).
- `src/lib/os/` — regras da ordem de serviço.
- `src/app/` — telas.

## Roadmap até 01/01/2027

1. ✅ Estoque com localização + OS com reserva
2. ✅ Vendas / PDV (mesmo motor de reserva)
3. ✅ Financeiro (contas a pagar/receber, caixa, bancos) e DRE gerencial
4. NF-e / NFC-e direto na SEFAZ-SP (✅ ver `docs/notas-fiscais.md`) e NFS-e padrão nacional
5. Importação de dados do Gestão Click e conferência de inventário
6. Login e permissões por usuário
