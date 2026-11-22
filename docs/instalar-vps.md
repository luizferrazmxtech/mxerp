# Colocar o MXERP na VPS

A VPS roda o sistema da MXTECH e, depois, o de cada cliente da revenda. Cada cliente tem **banco de dados próprio** e endereço próprio com HTTPS. Tudo é cuidado por um comando só: `./vps/mxerp.sh`.

O PC continua sendo o lugar de **testar** as versões novas. O uso de verdade passa a ser na VPS.

## 1. Contratar a VPS

- Região **São Paulo**, sistema **Ubuntu 24.04**.
- Só a MXTECH: 2 vCPU, 4 GB de RAM, 80 GB de disco já dá.
- Com revenda: 4 vCPU e **8 GB de RAM** (cabem uns 10 clientes). Dá para aumentar depois sem reinstalar.
- Anote o **IP** e a senha (ou chave) de acesso **root**.

## 2. Apontar o endereço (DNS)

No painel onde está o domínio `mxtech.inf.br`, crie um registro **A**:

| Nome | Tipo | Valor |
|---|---|---|
| `erp` | A | IP da VPS |

Para a revenda, depois, crie também `*.mxerp.com.br` (ou o domínio que escolher) apontando para o mesmo IP. Aí cada cliente novo já fica no ar sem mexer no DNS.

## 3. Entrar na VPS

No PowerShell do PC: `ssh root@IP-DA-VPS`

## 4. Baixar o sistema

O repositório é privado. Crie uma chave só de leitura para a VPS:

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/github_mxerp
cat ~/.ssh/github_mxerp.pub
```

Copie a linha que aparecer e cadastre em **GitHub → mxerp → Settings → Deploy keys → Add deploy key** (deixe *Allow write access* desmarcado). Depois:

```bash
printf 'Host github.com\n  IdentityFile ~/.ssh/github_mxerp\n' >> ~/.ssh/config
git clone git@github.com:luizferrazmxtech/mxerp.git /opt/mxerp
cd /opt/mxerp
```

## 5. Preparar e instalar

```bash
./vps/preparar-servidor.sh
./vps/mxerp.sh instalar
```

O instalador pergunta:

1. um e-mail para os avisos do certificado HTTPS;
2. o endereço da MXTECH (ex.: `erp.mxtech.inf.br`);
3. a `CHAVE_SEGREDOS` e o `CRON_SECRET` do PC. Abra `C:\mxerp\.env` no Bloco de Notas e copie os dois (se a `CHAVE_SEGREDOS` estiver vazia, deixe vazia e copie só o `CRON_SECRET`). Com eles, o Inter e os certificados A1 já salvos continuam funcionando quando o banco do PC vier para a VPS.

Leva uns 10 minutos (monta o sistema). No fim, `./vps/mxerp.sh status` deve mostrar `mxtech` como `healthy`, e `https://erp.mxtech.inf.br` abre a tela de login.

## 6. Trazer os dados do PC

1. No PC: `C:\mxerp\windows\backup-agora.ps1`. O arquivo fica em `C:\mxerp\backups`.
2. Envie para a VPS (no PowerShell do PC):
   ```powershell
   scp C:\mxerp\backups\mxerp-AAAAMMDD-HHMM-manual.dump root@IP-DA-VPS:/opt/mxerp/
   ```
3. Na VPS:
   ```bash
   ./vps/mxerp.sh restaurar mxtech /opt/mxerp/mxerp-AAAAMMDD-HHMM-manual.dump
   rm /opt/mxerp/mxerp-*.dump
   ```

Entre em `https://erp.mxtech.inf.br` com o mesmo usuário e senha do PC.

### Começar limpo com o backup novo do Gestão Click

Para entrar em produção com os dados do Gestão Click, depois de restaurar o banco do PC:

```bash
./vps/mxerp.sh limpar-movimento mxtech
```

Ele mostra o que sai e o que fica, faz uma cópia antes e apaga OS, vendas, orçamentos, compras, estoque e as contas que não foram conciliadas. Ficam as empresas, o certificado A1, os usuários, os cadastros, as notas emitidas e a numeração delas, as configurações, os contratos, o WhatsApp, as integrações e o extrato do banco com as contas já conciliadas nele.

Depois, na tela **Migração**, escolha o .zip, marque tudo (inclusive *contas a pagar já vencidas*, *contas já pagas* e *notas fiscais*), **Simule**, confira os avisos e **Grave**. As notas do Gestão Click entram só para consulta (sem XML) e a numeração do MXERP continua depois da última delas.

### Segunda empresa (outro Gestão Click)

Cadastre a empresa em *Empresas* (CNPJ e nome) antes. Na tela **Migração**, escolha em *De qual empresa é este backup* a opção *Outro Gestão Click: tudo para …*. Assim:

- OS, vendas, orçamentos, compras, contas e notas entram na loja dela;
- se um número já existir aqui (ex.: OS 7001 nas duas), ganha o próximo livre e o número antigo fica no histórico;
- o estoque entra num depósito só dela (*Loja NOME*), sem mexer no da primeira;
- clientes e produtos em comum (mesmo CPF/CNPJ, mesmo nome sem documento, mesmo código de produto) não duplicam: os que já existem só ganham o que estava vazio;
- a numeração das notas é por CNPJ, então a NF-e de uma loja não interfere na da outra.

### Baixar as contas antigas pelo extrato do Inter

As contas a pagar vencidas entram em aberto. Para baixá-las pela conciliação, traga o extrato do período delas: em *Financeiro → Conciliação → Banco Inter*, preencha **ou desde** com a data da conta mais antiga e clique em *Buscar extrato*. Ele busca de 90 em 90 dias (pode levar alguns minutos). Linhas de contas que já entraram baixadas (histórico do Gestão Click) são amarradas a elas, sem baixar de novo. O resto aparece nas sugestões da conciliação. Se o Inter não liberar um período tão antigo, exporte o OFX no Internet Banking e importe pelo arquivo.

### Backup novo do Gestão Click por cima

O banco do PC já tem o que veio do backup anterior do Gestão Click. Para trazer o que mudou lá desde então:

1. Pare de lançar no Gestão Click e gere o backup completo (.zip).
2. Na VPS, entre em **Migração**, escolha o .zip, marque as etapas e clique em **Simular**. Nada é gravado.
3. Confira os avisos e clique em **Gravar**.

Na reimportação nada é duplicado. Cadastros, preços e custos são atualizados. O estoque fica igual ao do backup, menos nos produtos que já tiveram movimento de verdade no MXERP. OS, vendas e contas novas entram. A OS já trazida que mudou de situação no Gestão Click passa para a situação atual (a reserva das peças acompanha, sem baixa, porque o saldo do backup já desconta). A conta trazida antes e paga ou recebida depois no Gestão Click é baixada com a data de confirmação de lá. O que foi mexido no MXERP depois da importação anterior fica como está no MXERP, e o aviso lista os números.

## 7. Depois que a VPS virar o sistema oficial

- **Inter:** em *Financeiro → Conciliação → Configurar Banco Inter*, preencha *Endereço público do ERP* com `https://erp.mxtech.inf.br` e salve. O webhook passa a apontar para a VPS e a baixa do boleto fica na hora.
- **PC vira teste.** Ele não pode continuar emitindo nada de verdade, senão sai boleto, contrato e nota em dobro:
  - no PC, pare o agendador: `cd C:\mxerp` e `docker compose stop agendador`;
  - em *Empresas*, ponha cada loja do PC em **homologação**;
  - na tela do Inter do PC, desligue a busca automática.

## 8. Versão nova: testa no PC, depois sobe na VPS

1. No PC: `windows\atualizar.ps1` e teste.
2. Deu certo? Na VPS:
   ```bash
   cd /opt/mxerp && ./vps/mxerp.sh atualizar
   ```
   Ele faz cópia de todos os bancos, baixa a versão, monta e atualiza **a MXTECH primeiro** e depois cada cliente. Se um não subir, ele para ali e mostra como ver o erro e voltar a cópia.

## 9. Cópias de segurança

- Automáticas às **3h, 12h30 e 19h30**, de todos os bancos, em `/opt/mxerp/vps/backups/<cliente>/`. Ficam 30 dias (`DIAS_BACKUP` em `vps/.env`).
- Na hora: `./vps/mxerp.sh backup` (todos) ou `./vps/mxerp.sh backup mxtech`.
- Voltar uma cópia: `./vps/mxerp.sh restaurar mxtech vps/backups/mxtech/ARQUIVO.dump`. Antes, ele guarda o estado atual.
- Baixar uma cópia para o PC: `scp root@IP-DA-VPS:/opt/mxerp/vps/backups/mxtech/ARQUIVO.dump .`
- **Cópia fora da VPS (recomendado):** se a VPS sumir, é ela que salva. Crie um bucket no Backblaze B2 (ou outro S3) e rode:
  ```bash
  ./vps/mxerp.sh copia-externa configurar   # cadastra o destino (ex.: nome "b2")
  ```
  Em `vps/.env`, preencha `DESTINO_BACKUP=b2:nome-do-bucket` e ligue com `./vps/mxerp.sh copia-externa ligar`. A cópia sobe de hora em hora.

## 10. Central de revenda

A Central é um sistema à parte, só da MXTECH, com banco próprio (`central`). Ela cuida dos clientes da revenda: cria o sistema de cada um, cobra a mensalidade pelo Inter, bloqueia quem atrasa e mostra os backups.

**Ligar:** no DNS, crie `central` (em mxtech.inf.br) apontando para o IP da VPS. Em `vps/.env`, preencha `DOMINIO_CENTRAL=central.mxtech.inf.br` e rode `./vps/mxerp.sh atualizar`. Na instalação nova o `instalar` já pergunta. Abra `https://central.mxtech.inf.br`: a primeira tela cria o administrador.

**Configurar (tela Configurações):**
1. Endereço público (`https://central.mxtech.inf.br`), multa, juros e régua (aviso 5 dias, só leitura 10, bloqueio 30).
2. Banco Inter: crie no Inter Empresas **uma integração nova só para a Central**, com permissão de boletos (leitura e escrita). Não use a do MXERP: o Inter guarda um webhook por integração e um apagaria o do outro.
3. E-mail de envio (SMTP).
4. Em **Planos**, cadastre os planos (valor, CNPJs e usuários).

**Novo cliente:** *Clientes → Novo cliente*. Ao salvar, a VPS cria banco, sistema e HTTPS em uns 2 minutos (acompanhe em *Tarefas da VPS*). Com um registro curinga no DNS (`*.mxerp.com.br`), qualquer subdomínio já funciona.

**Como a cobrança anda sozinha (de hora em hora, 8h às 20h):** gera a mensalidade 10 dias antes do vencimento, emite o BolePix, manda por e-mail com o PDF, manda lembrete no vencimento e a cada 5 dias de atraso, e baixa quando o Inter avisa o pagamento. O sistema do cliente consulta a Central pela rede interna da VPS:

| Atraso | O que o cliente vê |
|---|---|
| até 4 dias | nada |
| 5 dias | faixa amarela no topo com o boleto |
| 10 dias | faixa vermelha; o sistema não grava nada (só consulta) |
| 30 dias | só a tela de pagamento |
| pagou | libera sozinho em até 5 minutos |

Se a Central sair do ar, o sistema do cliente segue com a última situação conhecida. O plano também limita quantas lojas (CNPJs) e usuários o cliente cadastra.

**O sistema da MXTECH na Central:** aparece sozinho na lista de clientes como *sistema da casa*, sem plano, mensalidade nem bloqueio. Serve para acompanhar se está no ar e os backups dele no mesmo painel (no PC, mostra as cópias da pasta `C:\mxerp\backups`).

**Backups por cliente:** na ficha do cliente, aba *Backups*: horários, *Fazer backup agora*, *Baixar* e *Restaurar* (pede para digitar o nome do cliente e guarda o estado atual antes).

**Versão nova:** depois de testar no PC, *Tarefas da VPS → Atualizar todos para a versão nova* faz o mesmo que `./vps/mxerp.sh atualizar`.

## 11. Clientes da revenda pela linha de comando

```bash
./vps/mxerp.sh novo-cliente jtecobio jtecobio.mxerp.com.br
```

Cria o banco do cliente, sobe o sistema dele e liga o HTTPS. A primeira tela pede para criar o administrador. Outros comandos:

| Comando | O que faz |
|---|---|
| `./vps/mxerp.sh status` | clientes, situação, último backup, disco e memória |
| `./vps/mxerp.sh suspender jtecobio` | tira do ar com aviso "Sistema suspenso" (os dados ficam) |
| `./vps/mxerp.sh reativar jtecobio` | volta ao ar |
| `./vps/mxerp.sh admin jtecobio email@cliente.com.br "Nome"` | cria ou redefine a senha de um administrador |
| `./vps/mxerp.sh logs jtecobio` | últimas mensagens do sistema do cliente |

## Problemas comuns

- **Endereço não abre ou dá erro de certificado:** o DNS ainda não propagou (pode levar até 1 hora). Confira com `ping erp.mxtech.inf.br` se responde o IP da VPS.
- **Status `unhealthy`:** `./vps/mxerp.sh logs mxtech` mostra o erro.
- **Inter ou certificado A1 dizem que não conseguem decifrar:** a `CHAVE_SEGREDOS`/`CRON_SECRET` em `vps/clientes/mxtech/cliente.env` não é a mesma do PC. Corrija e rode `./vps/mxerp.sh aplicar`, ou salve as credenciais de novo nas telas.
