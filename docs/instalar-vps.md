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

## 10. Clientes da revenda (manual, até a Central ficar pronta)

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
