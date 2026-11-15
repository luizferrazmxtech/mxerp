# Atualiza o MXERP para a versao mais nova do GitHub e reinicia (os dados ficam).
# "Continue": o docker escreve progresso no stderr, e com "Stop" o PowerShell 5 trataria isso como erro
$ErrorActionPreference = "Continue"
Set-Location (Split-Path -Parent $PSScriptRoot)
Write-Host "Fazendo uma copia do banco antes de atualizar..."
& "$PSScriptRoot\backup-agora.ps1" -SemPausa
if ($LASTEXITCODE -ne 0) { Read-Host "Sem copia do banco, nao atualizo. Enter para sair"; exit 1 }
git pull
if ($LASTEXITCODE -ne 0) { Read-Host "Falhou ao baixar a versao nova. Enter para sair"; exit 1 }
docker compose up -d --build
Write-Host "Atualizado." -ForegroundColor Green
Read-Host "Enter para fechar"
