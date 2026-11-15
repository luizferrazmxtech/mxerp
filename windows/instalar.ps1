# Instalador do MXERP para Windows (Docker Desktop)
# Uso: clique com o botao direito em instalar.ps1 > "Executar com o PowerShell"
#      ou, no PowerShell aberto na pasta do mxerp:  powershell -ExecutionPolicy Bypass -File windows\instalar.ps1
# "Continue": o docker escreve progresso no stderr, e com "Stop" o PowerShell 5 trataria isso como erro
$ErrorActionPreference = "Continue"
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz
Write-Host ""
Write-Host "== MXERP: instalacao ==" -ForegroundColor Cyan

# 1. Docker
$temDocker = $false
try { docker version --format "{{.Server.Version}}" *> $null; $temDocker = ($LASTEXITCODE -eq 0) } catch { }
if (-not $temDocker) {
  Write-Host ""
  Write-Host "O Docker Desktop nao esta instalado ou nao esta aberto." -ForegroundColor Yellow
  Write-Host "1) Instale com:  winget install -e --id Docker.DockerDesktop"
  Write-Host "2) Reinicie o computador, abra o Docker Desktop e espere ficar verde (Engine running)."
  Write-Host "3) Rode este instalador de novo."
  Read-Host "Enter para sair"; exit 1
}

# 2. Pastas e .env com senhas geradas aqui (nao precisam ser decoradas)
New-Item -ItemType Directory -Force -Path "$raiz\certificados", "$raiz\backups" | Out-Null
function Senha([int]$n = 32) {
  $b = New-Object byte[] $n
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  ([Convert]::ToBase64String($b) -replace '[^A-Za-z0-9]', '').Substring(0, [Math]::Min(32, $n))
}
$envArq = Join-Path $raiz ".env"
if (-not (Test-Path $envArq)) {
  $txt = Get-Content (Join-Path $raiz ".env.example") -Raw
  $txt = $txt -replace '(?m)^DB_SENHA=.*$', ("DB_SENHA=" + (Senha 32))
  $txt = $txt -replace '(?m)^CRON_SECRET=.*$', ("CRON_SECRET=" + (Senha 32))
  [IO.File]::WriteAllText($envArq, ($txt -replace "`r`n", "`n"), (New-Object Text.UTF8Encoding $false))
  Write-Host "Arquivo .env criado com senhas novas." -ForegroundColor Green
} else {
  Write-Host ".env ja existe: mantido."
}

# 3. Sobe tudo (a primeira vez demora alguns minutos)
Write-Host "Montando e iniciando o sistema (pode levar uns 5 minutos na primeira vez)..."
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { Write-Host "Falhou ao subir. Veja a mensagem acima." -ForegroundColor Red; Read-Host "Enter para sair"; exit 1 }

# 4. Libera a porta na rede local (outros computadores da loja). Se nao for administrador, pede a permissao (UAC).
$porta = ((Get-Content $envArq | Where-Object { $_ -match '^PORTA=' }) -replace 'PORTA=', '').Trim()
if (-not $porta) { $porta = "3000" }
if (-not (Get-NetFirewallRule -DisplayName "MXERP" -ErrorAction SilentlyContinue)) {
  $regra = "New-NetFirewallRule -DisplayName 'MXERP' -Direction Inbound -Protocol TCP -LocalPort $porta -Action Allow -Profile Private -ErrorAction Stop | Out-Null"
  $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  try {
    if ($admin) { Invoke-Expression $regra }
    else {
      Write-Host "O Windows vai pedir permissao de administrador para liberar a porta $porta na rede local."
      $p = Start-Process powershell -Verb RunAs -Wait -PassThru -ArgumentList "-NoProfile", "-Command", $regra
      if ($p.ExitCode -ne 0) { throw "falhou" }
    }
    Write-Host "Porta $porta liberada no firewall (rede privada)." -ForegroundColor Green
  } catch { Write-Host "Nao consegui liberar a porta no firewall. Outros PCs so vao acessar depois de rodar o instalador como administrador." -ForegroundColor Yellow }
}

# 5. Espera responder e abre o navegador
Write-Host "Aguardando o sistema responder..."
for ($i = 0; $i -lt 90; $i++) {
  try { Invoke-WebRequest "http://localhost:$porta/login" -UseBasicParsing -TimeoutSec 3 | Out-Null; break } catch { Start-Sleep 2 }
}
# placa com gateway e ligada: ignora as placas virtuais do WSL/Docker (vEthernet)
$ip = (Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1).IPv4Address.IPAddress
Write-Host ""
Write-Host "Pronto!" -ForegroundColor Green
Write-Host "Neste computador:   http://localhost:$porta"
if ($ip) { Write-Host "Outros computadores: http://${ip}:$porta" }
Write-Host "No primeiro acesso, crie o usuario administrador na propria tela."
Start-Process "http://localhost:$porta"
Read-Host "Enter para fechar"
