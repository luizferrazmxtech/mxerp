# Banco Inter e conciliação bancária

## Como funciona

A tela **Financeiro → Conciliação** recebe o extrato e baixa as contas sozinha:

- Cada transação do extrato é casada com uma conta a pagar ou a receber em aberto de **mesmo valor**, vencida até 45 dias antes ou com vencimento até 15 dias depois.
- Se o nome do favorecido/pagador bate com a pessoa da conta, ou se só existe uma conta possível, a baixa é feita na hora com a data e a conta do extrato.
- O resto aparece como sugestão para confirmar, com opção de escolher outra conta, lançar como despesa/receita avulsa (tarifa, rendimento, Pix avulso) ou ignorar.
- Tudo pode ser desfeito. Transações que já vieram antes não são duplicadas, então pode subir extratos com períodos sobrepostos.

O extrato entra de duas formas:

1. **Arquivo**: OFX (melhor) ou CSV/Excel de qualquer banco, com colunas de data, descrição e valor (ou crédito/débito).
2. **API do Banco Inter**: o ERP puxa o extrato direto do banco, pelo botão na tela ou de hora em hora pelo agendador.

## Configurar a API do Inter

1. No **Inter Empresas** (internet banking), vá em *Soluções para sua empresa → Nova integração* (precisa ser o administrador da conta).
2. Dê um nome (ex.: MXERP) e marque a permissão **Consultar extrato e saldo** (escopo `extrato.read`).
3. Baixe a chave e o certificado gerados (`.key` e `.crt`) e anote o **Client ID** e o **Client Secret**.
4. Copie os dois arquivos para o servidor do ERP, numa pasta só de leitura do usuário do sistema (ex.: `/etc/mxerp/inter/`).
5. Coloque no `.env` do servidor (nunca no banco de dados nem no repositório):

```
INTER_CLIENT_ID=...
INTER_CLIENT_SECRET=...
INTER_CERT_FILE=/etc/mxerp/inter/Inter_API_Certificado.crt
INTER_KEY_FILE=/etc/mxerp/inter/Inter_API_Chave.key
INTER_CONTA=          # número da conta corrente, se a integração tiver mais de uma
INTER_CONTA_ERP=INTER MXTECH   # nome da conta bancária no ERP
CRON_SECRET=...       # senha longa e aleatória para o agendador
```

6. Agende a busca (cron do servidor), por exemplo de hora em hora em horário comercial:

```
0 8-19 * * 1-6  curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/inter/sincronizar
```

O certificado da integração vence (em geral em 1 ano); o Inter avisa e é só baixar o novo e trocar os arquivos.

## Contas trazidas do Gestão Click

Na migração, as contas a pagar já vencidas ficam de fora por padrão (foram pagas sem baixa no sistema antigo). As contas a receber em aberto entram todas; puxando 60 a 90 dias de extrato do Inter logo depois da migração, as que já foram recebidas são baixadas automaticamente.
