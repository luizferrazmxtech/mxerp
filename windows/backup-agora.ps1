# Faz uma copia do banco agora, na pasta backups (alem das automaticas de 12h30 e 19h30).
param([switch]$SemPausa)
# "Continue": o docker escreve progresso no stderr, e com "Stop" o PowerShell 5 trataria isso como erro
$ErrorActionPreference = "Continue"
Set-Location (Split-Path -Parent $PSScriptRoot)
$nome = "mxerp-" + (Get-Date -Format "yyyyMMdd-HHmm") + "-manual.dump"
docker compose exec -T backup sh -c "pg_dump -h db -U mxerp -d mxerp -Fc -f /backups/$nome"
if ($LASTEXITCODE -ne 0) { Write-Host "Falhou a copia. O sistema esta rodando? (docker compose ps)" -ForegroundColor Red; exit 1 }
Write-Host "Copia salva em backups\$nome" -ForegroundColor Green
Write-Host "Guarde as copias tambem fora deste computador (pendrive, Google Drive, OneDrive)."
if (-not $SemPausa) { Read-Host "Enter para fechar" }
