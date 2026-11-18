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
3. Anote o **Client ID** e o **Client Secret** e baixe a chave e o certificado (`.key` e `.crt`, vêm num .zip).
4. No ERP, entre como administrador em **Financeiro → Conciliação → Configurar** (ou *Configurações → Banco Inter (API)*) e preencha:
   - Client ID e Client Secret;
   - o .zip baixado do Inter (ou o `.crt` e o `.key` juntos);
   - conta corrente, só se a empresa tiver mais de uma conta no Inter;
   - a conta bancária do ERP que recebe o extrato.
5. Clique em **Salvar e testar conexão**. O sistema confere se a chave é do mesmo par do certificado, pega o token no Inter e lê o saldo da conta. A tela mostra o resultado, a validade do certificado e a última busca do extrato.

A busca automática roda de hora em hora (8h às 20h) pelo serviço `agendador` do Docker e pode ser desligada na mesma tela.

### Onde ficam as credenciais

O Client Secret e a chave `.key` ficam no banco **cifrados (AES-256-GCM)** com uma chave que fica só no `.env` do servidor: `CHAVE_SEGREDOS`, ou o `CRON_SECRET` gerado na instalação se ela estiver vazia. Um backup do banco sozinho não abre as credenciais, e elas nunca voltam para a tela. Se essa chave do `.env` mudar, é só salvar as credenciais de novo na tela.

O certificado da integração vence (em geral em 1 ano). Quando vencer, baixe o novo no Inter e envie na mesma tela; o resto não precisa ser redigitado.

### Jeito antigo (pelo .env)

Ainda funciona, se não houver nada salvo na tela: `INTER_CLIENT_ID`, `INTER_CLIENT_SECRET`, `INTER_CERT_FILE`, `INTER_KEY_FILE`, `INTER_CONTA`, `INTER_AMBIENTE=sandbox` e `INTER_CONTA_ERP`. A configuração da tela tem prioridade.

## Contas trazidas do Gestão Click

Na migração, as contas a pagar já vencidas ficam de fora por padrão (foram pagas sem baixa no sistema antigo). As contas a receber em aberto entram todas; puxando 60 a 90 dias de extrato do Inter logo depois da migração, as que já foram recebidas são baixadas automaticamente.
