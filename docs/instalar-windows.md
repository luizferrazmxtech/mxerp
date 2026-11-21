# Instalar o MXERP num computador Windows

O sistema roda no próprio computador da loja, dentro do **Docker Desktop**: banco de dados, sistema, cópia de segurança automática e busca do extrato do Inter. Os outros computadores da rede acessam pelo navegador.

## 1. O que precisa

- Windows 10 ou 11 (64 bits), 8 GB de RAM ou mais, 20 GB livres.
- Esse computador fica **ligado no horário de trabalho**. Em *Configurações → Sistema → Energia*, ponha "Suspender" como **Nunca** quando ligado na tomada.
- Virtualização ligada na BIOS (quase todo computador recente já vem assim; o Docker avisa se não estiver).

## 2. Instalar o Docker Desktop e o Git (uma vez)

Abra o **PowerShell** (menu Iniciar → digite PowerShell) e rode:

```powershell
winget install -e --id Docker.DockerDesktop
winget install -e --id Git.Git
```

**Reinicie o computador.** Abra o Docker Desktop, aceite os termos (é gratuito para empresas pequenas) e espere aparecer *Engine running*. Em *Settings → General*, deixe marcado **Start Docker Desktop when you sign in**.

## 3. Baixar o sistema

No PowerShell:

```powershell
git clone https://github.com/luizferrazmxtech/mxerp.git C:\mxerp
```

Como o repositório é privado, o Git abre o navegador para você entrar no GitHub na primeira vez.

## 4. Instalar

Abra a pasta `C:\mxerp\windows`, clique com o botão direito em **instalar.ps1** → **Executar com o PowerShell**.
Para também liberar o acesso dos outros computadores da loja, rode como administrador:

```powershell
cd C:\mxerp
powershell -ExecutionPolicy Bypass -File windows\instalar.ps1
```

(em um PowerShell aberto com *Executar como administrador*).

O instalador cria o arquivo `.env` com senhas novas, sobe tudo e abre o navegador em `http://localhost:3000`. Ele mostra também o endereço para os outros computadores (ex.: `http://192.168.0.10:3000`). Vale reservar esse IP no roteador para ele não mudar.

## 5. Primeiro acesso

1. A tela pede para **criar o administrador** (seu e-mail e uma senha). Ela só aparece enquanto não existe nenhum usuário.
2. Em **Usuários**, crie um login para cada pessoa, com o perfil certo:
   - Administrador: tudo.
   - Gerente: tudo menos usuários e migração.
   - Atendente: OS, vendas, PDV, estoque e cadastros.
   - Técnico: OS, estoque e cadastros (sem financeiro e sem vendas).
   - Caixa: PDV, vendas, OS, estoque e cadastros.
3. Em **Notas fiscais**, preencha os dados da empresa (CNPJ, IE, regime, séries, CSC da NFC-e) e deixe em **homologação** até a primeira nota de teste sair certa.

## 6. Trazer os dados do Gestão Click

Menu **Migração** → *Backup completo do Gestão Click* → escolha o `.zip` → **Simular**. Confira os números e avisos e clique em **Importar de verdade**. Pode repetir com um backup mais novo na véspera da virada: nada é duplicado.

## 7. Certificado digital A1 (notas fiscais)

1. Copie o arquivo `.pfx` para `C:\mxerp\certificados\certificado.pfx`.
2. Abra `C:\mxerp\.env` no Bloco de Notas e preencha `CERTIFICADO_A1_SENHA=` com a senha do certificado.
3. No PowerShell: `cd C:\mxerp` e `docker compose up -d`.

A senha fica só nesse arquivo, no seu computador. Ela não vai para o banco de dados nem para o GitHub.

## 8. Banco Inter (extrato automático)

1. No Inter Empresas, crie a integração com a permissão **Consultar extrato e saldo**, anote o Client ID e o Client Secret e baixe o .zip com o certificado e a chave.
2. No ERP, em **Financeiro → Conciliação → Configurar**, preencha os dados, envie o .zip e clique em **Salvar e testar conexão**. Não precisa mexer no `.env` nem copiar arquivos. Detalhes em `docs/banco-inter.md`.
3. A busca automática roda de hora em hora, das 8h às 20h, e pode ser desligada na mesma tela.

## 9. Cópias de segurança

- Automáticas todo dia às **12h30 e 19h30** em `C:\mxerp\backups` (guarda 30 dias).
- Cópia na hora: `windows\backup-agora.ps1`.
- **Leve as cópias para fora do computador** (Google Drive, OneDrive ou pendrive), por exemplo apontando a pasta `C:\mxerp\backups` para o OneDrive. Se o disco queimar, é isso que salva.
- Restaurar uma cópia: coloque o arquivo em `backups` e rode `powershell -File windows\restaurar.ps1 -Arquivo nome-do-arquivo.dump`.

## 10. Atualizar para uma versão nova

`windows\atualizar.ps1`: faz uma cópia do banco, baixa a versão nova e reinicia. Os dados ficam.

## Problemas comuns

- **Página não abre**: veja se o Docker Desktop está aberto e verde. No PowerShell, `cd C:\mxerp` e `docker compose ps` mostra o que está rodando; `docker compose logs app --tail 50` mostra o erro.
- **Outro computador não acessa**: rode o instalador como administrador (libera a porta 3000 no firewall) e confira se a rede do Windows está como *Privada*.
- **Esqueci a senha do administrador**: outro administrador redefine em Usuários. Se não houver outro: `docker compose exec app npm run usuario:admin -- seu@email.com.br "Seu Nome"` e digite a senha nova.
- **Mudar a porta**: troque `PORTA=3000` no `.env` e rode `docker compose up -d`.

## Central de revenda (teste no PC)

`powershell -ExecutionPolicy Bypass -File windows\central.ps1` liga a Central em `http://localhost:3100`, com banco próprio. Dá para testar cadastro de planos e clientes, mensalidades, boletos (com o Inter em sandbox) e e-mails. Criar o sistema do cliente, backup e restaurar só acontecem na VPS: no PC essas tarefas ficam como "pendentes". Depois de ligada, o `atualizar.ps1` atualiza a Central junto.
