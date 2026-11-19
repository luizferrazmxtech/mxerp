# Contratos (serviços recorrentes)

No Gestão Click o módulo se chamava **Assinaturas**. Aqui é **Contratos** (menu lateral → Contratos).

## O que o contrato faz sozinho

A cada vencimento, **N dias antes** (campo "Gerar a venda … dias antes do vencimento"):

1. Gera uma **venda de serviços** com os serviços do contrato, na situação configurada (padrão: a que lança o
   financeiro, ex.: *Concretizada*). A conta a receber vence no dia do vencimento do contrato.
2. Se a forma de pagamento é de **boleto Inter** (Configurações → Banco Inter), registra o **boleto (BolePix)** e
   ele é baixado sozinho quando o cliente paga (igual às vendas e OS).
3. Se marcado, **emite a NFS-e** da venda. Se a prefeitura recusar, o motivo fica na cobrança e a nota pode ser
   emitida de novo pela venda (Editar → Emitir NFS-e). Não tenta de novo sozinha, porque cada tentativa gasta um número de DPS.
4. Se marcado, **manda a cobrança por e-mail** com o boleto em PDF, a linha digitável e o Pix copia e cola.
5. Se marcado, manda o **lembrete de pagamento** M dias antes do vencimento, só se a conta ainda não foi paga.

O próximo vencimento anda conforme a **periodicidade** (mensal, trimestral, semestral ou anual), sempre no dia
escolhido (dia 31 vira o último dia nos meses curtos). Com término "Até uma data" ou "Por vezes", o contrato passa
para *Finalizado* sozinho na última cobrança. Só contratos **Ativos** geram cobrança.

## Quando roda

O agendador do Docker chama `/api/contratos/processar` de hora em hora, das 8h às 20h (precisa do `CRON_SECRET`
no `.env`, que a instalação já gera). Pode rodar várias vezes: só faz o que falta. Na tela também há
**Processar agora** (lista) e **Gerar cobrança agora** (no contrato, para antecipar a próxima).

## Antes de usar

- **Contratos → Configurações → E-mail de envio (SMTP)**: servidor, porta, usuário e senha da conta que manda os
  e-mails (Gmail/Google Workspace: `smtp.gmail.com`, porta 465 com SSL e uma *senha de app*). A senha fica cifrada
  com a chave do servidor, como as credenciais do Inter. Dá para mandar um e-mail de teste ao salvar.
- O cliente precisa de e-mail no cadastro (ou preencha "E-mail de cobrança" no contrato) e, para o boleto, CPF/CNPJ
  e endereço completos.
- Para a NFS-e automática, os serviços precisam do código de tributação nacional (como em qualquer NFS-e).
