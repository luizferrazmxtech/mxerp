# Banco Inter e conciliação bancária

## Como funciona

A tela **Financeiro → Conciliação** recebe o extrato e baixa as contas a pagar sozinha:

- Cada saída do extrato é casada com uma conta a pagar em aberto de **mesmo valor**, vencida até 45 dias antes ou com vencimento até 15 dias depois.
- Se o nome do favorecido bate com a pessoa da conta, ou se só existe uma conta possível, a baixa é feita na hora com a data e a conta do extrato.
- **Contas a receber não são baixadas por valor e data** (dois clientes podem pagar o mesmo valor no mesmo dia). As de boleto são baixadas pelo próprio boleto (veja abaixo); as outras aparecem só como sugestão para confirmar uma a uma.
- O resto aparece como sugestão para confirmar, com opção de escolher outra conta, lançar como despesa/receita avulsa (tarifa, rendimento, Pix avulso) ou ignorar.
- Tudo pode ser desfeito. Transações que já vieram antes não são duplicadas, então pode subir extratos com períodos sobrepostos.

O extrato entra de duas formas:

1. **Arquivo**: OFX (melhor) ou CSV/Excel de qualquer banco, com colunas de data, descrição e valor (ou crédito/débito).
2. **API do Banco Inter**: o ERP puxa o extrato direto do banco, pelo botão na tela ou de hora em hora pelo agendador.

## Boletos (BolePix) pelo Inter

Igual ao Gestão Click: ao lançar uma venda, OS ou conta a receber com a forma de pagamento **Boleto**, o ERP registra o boleto no Inter, **um por parcela**, na hora em que a parcela vira conta a receber (situação que lança o financeiro).

- Cada parcela mostra a situação do boleto, o nosso número e a linha digitável, com os botões **Imprimir** (PDF do Inter), **Linha digitável** e **Pix** (copiar), **WhatsApp** e **E-mail** (mensagem pronta com a linha digitável e o Pix copia e cola), **Consultar**, **Emitir de novo** e **Cancelar**. Fica na aba *Pagamento* da venda/OS e na lista de contas a receber.
- O boleto é BolePix: o cliente pode pagar pelo código de barras ou pelo QR Code Pix impresso no boleto.
- Se o cadastro do cliente estiver incompleto (CPF/CNPJ, endereço, cidade, UF ou CEP), o boleto não é registrado e a venda/OS mostra um aviso vermelho com o que falta. Corrija o cadastro e clique em **Emitir de novo**.
- **Baixa automática**: quando o Inter informa que o boleto foi pago, a conta a receber é baixada **na data do pagamento**, na conta do Inter, com o valor recebido (o que passar do valor vira juros/multa; o que faltar, desconto). A consulta roda de hora em hora (8h às 20h) junto com o extrato, e também no botão *Buscar no Inter* da conciliação. Com o webhook (abaixo), a baixa é na hora.
- A entrada do extrato desse pagamento é amarrada à conta pelo **nosso número** (ou pelo txid do Pix), não por valor/data.
- Se a venda/OS for editada com outras parcelas, cancelada ou excluída, os boletos das parcelas que sumiram são **cancelados no Inter**. Se você receber à mão (dinheiro, Pix avulso) uma conta com boleto em aberto, o boleto também é cancelado, para o cliente não pagar duas vezes.
- Só viram boleto sozinhas as parcelas lançadas **depois** que os boletos foram ligados na tela. Contas antigas e as migradas do Gestão Click nunca geram boleto automático (o botão *Emitir boleto* continua disponível para qualquer conta a receber em aberto).
- Multa (padrão 2%), juros de mora (padrão 1% ao mês), mensagem do boleto, dias até o Inter cancelar o boleto vencido não pago (padrão 30) e quais formas de pagamento geram boleto ficam na tela de configuração.
- Regras do Inter: valor mínimo de R$ 2,50 e vencimento a partir de hoje.

### Webhook (opcional)

Sem webhook, os pagamentos chegam pela consulta de hora em hora. Para baixar na hora, o ERP precisa estar acessível pela internet em **https** (por exemplo com um Cloudflare Tunnel apontando para o computador do ERP). Informe esse endereço em *Endereço público do ERP* na tela de configuração e salve: o ERP cadastra no Inter o endereço `https://SEU-ENDERECO/api/inter/webhook/<token secreto>`. O aviso do Inter nunca é usado direto: o ERP consulta o boleto no Inter antes de baixar.

Com o endereço público configurado, as mensagens de WhatsApp/e-mail também levam um link para o cliente abrir o PDF do boleto (`/cobranca/boleto/...`). Sem ele, a mensagem leva a linha digitável e o Pix copia e cola, e o PDF pode ser impresso ou anexado.

## Configurar a API do Inter

1. No **Inter Empresas** (internet banking), vá em *Soluções para sua empresa → Nova integração* (precisa ser o administrador da conta).
2. Dê um nome (ex.: MXERP) e marque as permissões:
   - **Consultar extrato e saldo** (escopo `extrato.read`);
   - **Emitir e cancelar boletos/cobranças** e **Consultar boletos/cobranças** (escopos `boleto-cobranca.write` e `boleto-cobranca.read`), para os boletos.

   Se a integração já existe só com o extrato, edite-a no Inter Empresas e acrescente as permissões de boleto; o Client ID, o Client Secret e o certificado continuam os mesmos.
3. Anote o **Client ID** e o **Client Secret** e baixe a chave e o certificado (`.key` e `.crt`, vêm num .zip).
4. No ERP, entre como administrador em **Financeiro → Conciliação → Configurar** (ou *Configurações → Banco Inter (API)*) e preencha:
   - Client ID e Client Secret;
   - o .zip baixado do Inter (ou o `.crt` e o `.key` juntos);
   - conta corrente, só se a empresa tiver mais de uma conta no Inter;
   - a conta bancária do ERP que recebe o extrato;
   - as permissões pedidas (extrato e boletos) e os parâmetros dos boletos.
5. Clique em **Salvar e testar conexão**. O sistema confere se a chave é do mesmo par do certificado, pega o token no Inter, lê o saldo da conta e, com boletos marcados, testa a consulta de boletos. A tela mostra o resultado, a validade do certificado, a última busca do extrato e a última consulta dos boletos. Se aparecer *Boletos: sem acesso*, falta a permissão de boletos na integração do Inter Empresas; o extrato continua funcionando mesmo assim (o ERP pede um token separado para cada permissão).

A busca automática (extrato e situação dos boletos) roda de hora em hora (8h às 20h) pelo serviço `agendador` do Docker e pode ser desligada na mesma tela.

### Onde ficam as credenciais

O Client Secret e a chave `.key` ficam no banco **cifrados (AES-256-GCM)** com uma chave que fica só no `.env` do servidor: `CHAVE_SEGREDOS`, ou o `CRON_SECRET` gerado na instalação se ela estiver vazia. Um backup do banco sozinho não abre as credenciais, e elas nunca voltam para a tela. Se essa chave do `.env` mudar, é só salvar as credenciais de novo na tela.

O certificado da integração vence (em geral em 1 ano). Quando vencer, baixe o novo no Inter e envie na mesma tela; o resto não precisa ser redigitado.

### Jeito antigo (pelo .env)

Ainda funciona, se não houver nada salvo na tela: `INTER_CLIENT_ID`, `INTER_CLIENT_SECRET`, `INTER_CERT_FILE`, `INTER_KEY_FILE`, `INTER_CONTA`, `INTER_AMBIENTE=sandbox`, `INTER_CONTA_ERP` e, para boletos, `INTER_ESCOPOS="extrato.read boleto-cobranca.read boleto-cobranca.write"`. A configuração da tela tem prioridade.

## Contas trazidas do Gestão Click

Na migração, as contas a pagar já vencidas ficam de fora por padrão (foram pagas sem baixa no sistema antigo). Contas a receber antigas não são baixadas pelo extrato (não há mais casamento por valor/data para receber) e nunca geram boleto automático; o combinado é tratá-las como pagas e começar o uso real em janeiro.
